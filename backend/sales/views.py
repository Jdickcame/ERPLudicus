import threading

import requests

# Imports de Modelos
from cash.models import CashMovement, CashShift
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from inventory.models import Kardex, Stock

# PDF Imports (ReportLab)
# DRF Imports
from rest_framework import serializers, viewsets
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

        # 👈 NUEVO: Detectar si viene como cortesía desde el Frontend
        is_courtesy = (
            str(self.request.data.get("is_courtesy", "false")).lower() == "true"
        )
        supervisor = None

        # 👈 NUEVO: EL GUARDIÁN DE CORTESÍAS
        if is_courtesy:
            # 1. ¿El usuario actual YA tiene permisos? (Revisamos tu flag personalizada o si es superusuario)
            if (
                getattr(self.request.user, "can_authorize_voids", False)
                or self.request.user.is_superuser
            ):
                supervisor = self.request.user  # ¡Aprobado automáticamente!

            # 2. Si es un cajero normal, exigimos el PIN
            else:
                supervisor_pin = self.request.data.get("supervisor_pin")

                # OJO: Si viene la palabra "BYPASS" desde el frontend, pero el usuario en el backend NO es admin,
                # esto bloqueará el intento de fraude.
                if not supervisor_pin or supervisor_pin == "BYPASS":
                    raise serializers.ValidationError(
                        {
                            "error": "No tienes permisos. Se requiere PIN de un Gerente/Admin."
                        }
                    )

                # Buscamos al gerente dueño de ese PIN
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
            # 1. Configurar Series
            is_factura = False
            cid = self.request.data.get("customer")

            if is_courtesy:
                # 👈 NUEVO: Si es cortesía, es un Ticket Interno
                serie = "T001"  # Serie para tickets de control
                tipo = "99"  # Código interno (no va a SUNAT)
            else:
                # Lógica original para ventas normales
                if cid:
                    if Customer.objects.filter(pk=cid, document_type="RUC").exists():
                        is_factura = True
                serie = "F007" if is_factura else "B007"
                tipo = "01" if is_factura else "03"

            # 2. Correlativo
            last = Sale.objects.filter(series=serie).order_by("-number").first()
            new_num = (int(last.number) + 1) if last else 1

            # 3. Guardar Venta (👈 Modificado para inyectar cortesía y autorizador)
            sale = serializer.save(
                branch_id=branch_id,
                series=serie,
                number=str(new_num).zfill(8),
                invoice_type_code=tipo,
                is_courtesy=is_courtesy,
                authorized_by=supervisor,
            )

            # 4. Detalles, Stock y Kardex
            total_gravada, total_igv = 0, 0
            for d in sale.details.all():
                # Stock
                st, _ = Stock.objects.get_or_create(
                    branch_id=branch_id, product=d.product, defaults={"quantity": 0}
                )
                d.unit_cost = st.average_cost
                st.quantity -= d.quantity
                st.save()

                # Kardex (Descuenta igual así sea cortesía)
                Kardex.objects.create(
                    branch_id=branch_id,
                    product=d.product,
                    date=sale.date,
                    type="OUT_SALE"
                    if not is_courtesy
                    else "OUT_COURTESY",  # 👈 Etiqueta especial en kardex
                    quantity=d.quantity,
                    unit_cost=d.unit_cost,
                    total_cost=d.quantity * d.unit_cost,
                    balance_quantity=st.quantity,
                    balance_unit_cost=st.average_cost,
                    balance_total_cost=st.quantity * st.average_cost,
                    user=self.request.user,
                    description=f"Venta {sale.id}"
                    if not is_courtesy
                    else f"Cortesía {sale.id} (Aut: {supervisor.first_name})",
                )

                # Impuestos (Solo si NO es cortesía calculamos impuestos reales)
                if not is_courtesy:
                    sub = float(d.subtotal)
                    base = sub / 1.18
                    total_gravada += base
                    total_igv += sub - base

                d.save()

            # Forzar totales a 0 en la cabecera si es cortesía
            sale.total_gravada = round(total_gravada, 2) if not is_courtesy else 0
            sale.total_igv = round(total_igv, 2) if not is_courtesy else 0
            # IMPORTANTE: Forzamos el total de la venta a 0 por seguridad
            if is_courtesy:
                sale.total = 0
                sale.status = "COMPLETED"
                sale.sunat_status = "ACCEPTED"  # Falso aceptado para que no estorbe en reportes pendientes

            sale.save()

            # 5. REGISTRO EN CAJA
            shift = CashShift.objects.filter(
                user=self.request.user, status="OPEN"
            ).first()
            if shift:
                for p in sale.payments.all():
                    # Si es cortesía, el frontend debería mandar monto 0 o método "COURTESY"
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

            # 6. Facturación Electrónica (Hilo) 👈 NUEVO: Bloqueo a SUNAT
            if not is_courtesy:

                def enviar():
                    try:
                        InvoiceService(sale).generar_comprobante()
                    except:  # noqa: E722
                        pass

                threading.Thread(target=enviar).start()


class CreditNoteViewSet(viewsets.ModelViewSet):
    queryset = CreditNote.objects.all()
    serializer_class = CreditNoteSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user

        # 🛑 1. EL GUARDIÁN: Validar permisos de anulación
        # Si el usuario NO tiene permiso para anular, exigimos el PIN del gerente
        if not getattr(user, "can_authorize_voids", False):
            supervisor_pin = self.request.data.get("supervisor_pin")

            if not supervisor_pin:
                raise serializers.ValidationError(
                    {
                        "error": "No tienes permisos. Se requiere PIN de un Gerente/Admin para anular."
                    }
                )

            # Buscamos un usuario con ese PIN que SÍ tenga el permiso
            supervisor = User.objects.filter(
                pin=supervisor_pin, can_authorize_voids=True
            ).first()

            if not supervisor:
                raise serializers.ValidationError(
                    {
                        "error": "PIN inválido o el usuario no tiene permisos de autorización."
                    }
                )

        # ✅ 2. LÓGICA DE ANULACIÓN (Sigue exactamente igual que la tuya)
        sale_id = self.request.data.get("sale")
        sale = Sale.objects.get(pk=sale_id)

        # Validar duplicados
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

            # LOGISTICA INVERSA
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
                        total_cost=detail.quantity * st.average_cost,
                        balance_quantity=st.quantity,
                        balance_unit_cost=st.average_cost,
                        balance_total_cost=st.quantity * st.average_cost,
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

            # ENVIAR A API (Hilo)
            def send():
                try:
                    InvoiceService(None).enviar_nota(note)
                except:  # noqa: E722
                    pass

            threading.Thread(target=send).start()
