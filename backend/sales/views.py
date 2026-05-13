import threading
from decimal import Decimal

import requests

# Imports de Modelos
from cash.models import CashMovement, CashShift
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from inventory.models import Kardex, Stock

# DRF Imports
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .invoice_service import InvoiceService
from .models import CreditNote, Customer, Sale
from .serializers import CreditNoteSerializer, CustomerSerializer, SaleSerializer

User = get_user_model()

# --- VIEWSETS ---


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"])
    def search_doc(self, request):
        doc_number = request.query_params.get("doc")
        if not doc_number:
            return Response({"error": "Falta doc"}, status=400)

        # 1. Búsqueda Local
        c = Customer.objects.filter(tax_id=doc_number).first()
        if c:
            return Response(self.get_serializer(c).data)

        # 2. API Externa
        tokenconsul = settings.APISPERU_CONSULTA_TOKEN
        try:
            if len(doc_number) == 8:
                r = requests.get(
                    f"https://dniruc.apisperu.com/api/v1/dni/{doc_number}?token={tokenconsul}",
                    timeout=3,
                )
                d = r.json()
                if r.status_code == 200 and d.get("nombres"):
                    new_c = Customer.objects.create(
                        tax_id=doc_number,
                        name=f"{d['nombres']} {d['apellidoPaterno']}",
                        document_type="DNI",
                        address="PERU",
                    )
                    return Response(self.get_serializer(new_c).data)
            elif len(doc_number) == 11:
                r = requests.get(
                    f"https://dniruc.apisperu.com/api/v1/ruc/{doc_number}?token={tokenconsul}",
                    timeout=3,
                )
                d = r.json()
                if r.status_code == 200 and d.get("razonSocial"):
                    new_c = Customer.objects.create(
                        tax_id=doc_number,
                        name=d["razonSocial"],
                        document_type="RUC",
                        address=d.get("direccion", "PERU"),
                    )
                    return Response(self.get_serializer(new_c).data)
        except:  # noqa: E722
            pass
        return Response({"error": "No encontrado"}, status=404)


class SaleViewSet(viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated]
    queryset = Sale.objects.all()

    def perform_create(self, serializer):
        branch_id = self.request.data.get("branch_id")
        if not branch_id and hasattr(self.request.user, "branch"):
            branch_id = self.request.user.branch.id

        is_courtesy = (
            str(self.request.data.get("is_courtesy", "false")).lower() == "true"
        )
        supervisor = None

        if is_courtesy:
            if (
                getattr(self.request.user, "can_authorize_voids", False)
                or self.request.user.is_superuser
            ):
                supervisor = self.request.user
            else:
                supervisor_pin = self.request.data.get("supervisor_pin")

                if not supervisor_pin or supervisor_pin == "BYPASS":
                    raise serializers.ValidationError(
                        {
                            "error": "No tienes permisos. Se requiere PIN de un Gerente/Admin."
                        }
                    )

                supervisor = User.objects.filter(
                    pin=supervisor_pin, can_authorize_voids=True
                ).first()

                if not supervisor:
                    raise serializers.ValidationError(
                        {
                            "error": "PIN inválido o el usuario no tiene permisos de autorización."
                        }
                    )

        with transaction.atomic():
            # 1. Leemos del frontend
            raw_invoice_type = self.request.data.get("invoice_type_code")
            is_nota_venta = raw_invoice_type == "00"
            is_factura = False
            cid = self.request.data.get("customer")

            # 2. Configurar Tipo y Serie
            if is_courtesy:
                serie = "T001"
                tipo = "99"
            elif is_nota_venta:
                serie = "NV01"
                tipo = "00"
            else:
                if cid:
                    if Customer.objects.filter(pk=cid, document_type="RUC").exists():
                        is_factura = True
                serie = "F007" if is_factura else "B007"
                tipo = "01" if is_factura else "03"

            # 3. Correlativo
            last = Sale.objects.filter(series=serie).order_by("-number").first()
            new_num = (int(last.number) + 1) if last else 1

            # 4. Guardar Venta (Pasamos lo básico al serializer)
            sale = serializer.save(
                branch_id=branch_id,
                is_courtesy=is_courtesy,
                authorized_by=supervisor,
            )

            # 🔥 LA SOLUCIÓN MÁGICA: Forzamos el guardado de estos 3 campos directamente en el modelo
            sale.series = serie
            sale.number = str(new_num).zfill(8)
            sale.invoice_type_code = tipo
            sale.save()  # Aquí aseguramos que la BD tome el "00" y el "NV01"

            # 5. Detalles, Stock y Kardex
            total_gravada, total_igv = 0, 0
            for d in sale.details.all():
                st, _ = Stock.objects.get_or_create(
                    branch_id=branch_id, product=d.product, defaults={"quantity": 0}
                )
                d.unit_cost = st.average_cost
                st.quantity -= d.quantity
                st.save()

                Kardex.objects.create(
                    branch_id=branch_id,
                    product=d.product,
                    date=sale.date,
                    type="OUT_SALE" if not is_courtesy else "OUT_COURTESY",
                    quantity=d.quantity,
                    unit_cost=d.unit_cost,
                    total_cost=Decimal(str(d.quantity)) * Decimal(str(d.unit_cost)),
                    balance_quantity=st.quantity,
                    balance_unit_cost=st.average_cost,
                    balance_total_cost=Decimal(str(st.quantity))
                    * Decimal(str(st.average_cost)),
                    user=self.request.user,
                    description=f"Venta {sale.id}"
                    if not is_courtesy
                    else f"Cortesía {sale.id} (Aut: {supervisor.first_name})",
                )

                if not is_courtesy:
                    sub = float(d.subtotal)
                    base = sub / 1.18
                    total_gravada += base
                    total_igv += sub - base

                d.save()

            sale.total_gravada = round(total_gravada, 2) if not is_courtesy else 0
            sale.total_igv = round(total_igv, 2) if not is_courtesy else 0

            if is_courtesy:
                sale.total = 0
                sale.status = "COMPLETED"
                sale.sunat_status = "ACCEPTED"

            # Si es Nota de Venta, la damos por aceptada internamente
            if is_nota_venta:
                sale.sunat_status = "ACCEPTED"
                sale.sunat_description = "Uso Interno (No enviada a SUNAT)"

            sale.save()

            # 6. REGISTRO EN CAJA
            shift = CashShift.objects.filter(
                user=self.request.user, status="OPEN"
            ).first()
            if shift:
                for p in sale.payments.all():
                    if p.amount > 0 and not is_courtesy:
                        CashMovement.objects.create(
                            shift=shift,
                            user=self.request.user,
                            amount=p.amount,
                            movement_type="IN",
                            concept="SALE",
                            description=f"Venta {sale.series}-{sale.number}",
                            related_sale=sale,
                        )

            # 7. Facturación Electrónica a SUNAT
            # El candado final para que NV01 y T001 NO pasen
            if not is_courtesy and not is_nota_venta:
                sale.sunat_status = "PENDING"
                sale.save()

                def enviar_a_sunat(venta_id):
                    from django.db import connection

                    try:
                        venta = Sale.objects.get(id=venta_id)
                        InvoiceService(venta).generar_comprobante()
                    except Exception as e:
                        print(f"Error en hilo de SUNAT: {e}")
                    finally:
                        connection.close()

                threading.Thread(target=enviar_a_sunat, args=(sale.id,)).start()

    # 🔥 NUEVA ACCIÓN: REINTENTO MANUAL DE ENVÍO A SUNAT
    @action(detail=True, methods=["post"])
    def send_sunat(self, request, pk=None):
        sale = self.get_object()

        if sale.invoice_type_code == "99":
            return Response(
                {"error": "Los tickets internos no se envían a SUNAT."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if sale.sunat_status == "ACCEPTED":
            return Response(
                {"message": "El documento ya está aceptado."}, status=status.HTTP_200_OK
            )

        try:
            InvoiceService(sale).generar_comprobante()
            sale.sunat_status = "ACCEPTED"
            sale.save()
            return Response(
                {"message": "✅ Documento enviado y aceptado por SUNAT correctamente."}
            )
        except Exception as e:
            return Response(
                {"error": f"Error SUNAT: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CreditNoteViewSet(viewsets.ModelViewSet):
    queryset = CreditNote.objects.all()
    serializer_class = CreditNoteSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user

        # 🛑 1. EL GUARDIÁN
        if not getattr(user, "can_authorize_voids", False):
            supervisor_pin = self.request.data.get("supervisor_pin")

            if not supervisor_pin:
                raise serializers.ValidationError(
                    {
                        "error": "No tienes permisos. Se requiere PIN de un Gerente/Admin para anular."
                    }
                )

            supervisor = User.objects.filter(
                pin=supervisor_pin, can_authorize_voids=True
            ).first()

            if not supervisor:
                raise serializers.ValidationError(
                    {
                        "error": "PIN inválido o el usuario no tiene permisos de autorización."
                    }
                )

        # ✅ 2. LÓGICA DE ANULACIÓN
        sale_id = self.request.data.get("sale")
        sale = Sale.objects.get(pk=sale_id)

        if sale.credit_notes.exists():
            raise serializers.ValidationError(
                {"error": "Esta venta ya fue anulada/modificada."}
            )

        with transaction.atomic():
            # GENERAR SERIE
            prefix = "F" if sale.invoice_type_code == "01" else "B"
            type_char = "C"
            serie_nc = f"{prefix}{type_char}01"

            last = (
                CreditNote.objects.filter(series=serie_nc).order_by("-number").first()
            )
            new_num = str(int(last.number) + 1).zfill(8) if last else "00000001"

            note = serializer.save(
                sale=sale,
                series=serie_nc,
                number=new_num,
                note_type="07",
            )

            # LOGISTICA INVERSA (Blindada con Decimal)
            if note.note_type == "07":
                for detail in sale.details.all():
                    st = Stock.objects.get(branch=sale.branch, product=detail.product)
                    st.quantity += detail.quantity
                    st.save()

                    Kardex.objects.create(
                        branch=sale.branch,
                        product=detail.product,
                        date=note.date,
                        type="IN_RETURN",
                        quantity=detail.quantity,
                        unit_cost=st.average_cost,
                        total_cost=Decimal(str(detail.quantity))
                        * Decimal(str(st.average_cost)),
                        balance_quantity=st.quantity,
                        balance_unit_cost=st.average_cost,
                        balance_total_cost=Decimal(str(st.quantity))
                        * Decimal(str(st.average_cost)),
                        user=self.request.user,
                        description=f"Anulación {sale.series}-{sale.number}",
                    )

            # CAJA
            shift = CashShift.objects.filter(
                user=self.request.user, status="OPEN"
            ).first()
            if shift and note.note_type == "07":
                CashMovement.objects.create(
                    shift=shift,
                    user=self.request.user,
                    amount=sale.total,
                    movement_type="OUT",
                    concept="REFUND",
                    description=f"Devolución {sale.series}-{sale.number}",
                    related_sale=sale,
                )
            sale.status = "CANCELED"
            sale.save()

            # ENVIAR NOTA A API (Síncrono para que se procese de inmediato)
            try:
                InvoiceService(None).enviar_nota(note)
            except Exception as e:
                print("Error enviando nota a SUNAT:", e)
