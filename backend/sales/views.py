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

        # 1. BÚSQUEDA LOCAL
        c = Customer.objects.filter(tax_id=doc_number).first()
        if c:
            return Response(self.get_serializer(c).data)

        # 2. DETERMINAR EL TIPO DE DOCUMENTO
        doc_type = None
        if len(doc_number) == 8:
            doc_type = "DNI"
        elif len(doc_number) == 9:
            doc_type = "CEE"
        elif len(doc_number) == 11:
            doc_type = "RUC"

        if not doc_type:
            return Response(
                {"error": "Longitud invalida (DNI=8, CE=9, RUC=11)"}, status=400
            )

        customer_data = None

        # 3. INTENTO 1: APISPERU (Solo soporta DNI y RUC)
        if doc_type in ["DNI", "RUC"]:
            token_apisperu = getattr(settings, "APISPERU_CONSULTA_TOKEN", "")
            try:
                if doc_type == "DNI":
                    r = requests.get(
                        f"https://dniruc.apisperu.com/api/v1/dni/{doc_number}?token={token_apisperu}",
                        timeout=5,  # ⏱️ Tiempo optimizado
                    )
                    d = r.json()
                    if r.status_code == 200 and d.get("nombres"):
                        customer_data = {
                            "name": f"{d.get('nombres', '')} {d.get('apellidoPaterno', '')} {d.get('apellidoMaterno', '')}".strip(),
                            "document_type": "DNI",
                            "tax_id": doc_number,
                            "address": "PERU",
                        }
                elif doc_type == "RUC":
                    r = requests.get(
                        f"https://dniruc.apisperu.com/api/v1/ruc/{doc_number}?token={token_apisperu}",
                        timeout=5,
                    )
                    d = r.json()
                    if r.status_code == 200 and d.get("razonSocial"):
                        customer_data = {
                            "name": d.get("razonSocial", ""),
                            "document_type": "RUC",
                            "tax_id": doc_number,
                            "address": d.get("direccion", "PERU"),
                        }
            except Exception as e:
                print(f"ApisPeru fallo o demoro ({e}). Saltando a Factiliza...")

        # 4. INTENTO 2: FACTILIZA (DNI, RUC y CEE)
        if not customer_data:
            print("Consultando API de respaldo (Factiliza)...")
            token_factiliza = getattr(settings, "FACTILIZA_TOKEN", "")
            headers = {"Authorization": f"Bearer {token_factiliza}"}

            try:
                if doc_type == "DNI":
                    r = requests.get(
                        f"https://api.factiliza.com/v1/dni/info/{doc_number}",
                        headers=headers,
                        timeout=5,
                    )
                    resp = r.json()
                    if r.status_code == 200:
                        data = resp.get("data", resp)
                        nombres = data.get("nombres")

                        if nombres:
                            name_str = f"{data.get('nombres', '')} {data.get('apellido_paterno', '')} {data.get('apellido_materno', '')}".strip()
                            customer_data = {
                                "name": name_str,
                                "document_type": "DNI",
                                "tax_id": doc_number,
                                "address": data.get(
                                    "direccion_completa", data.get("direccion", "PERU")
                                ),
                            }

                elif doc_type == "RUC":
                    r = requests.get(
                        f"https://api.factiliza.com/v1/ruc/info/{doc_number}",
                        headers=headers,
                        timeout=5,
                    )
                    resp = r.json()
                    if r.status_code == 200:
                        data = resp.get("data", resp)
                        # Leemos la variable exacta según el JSON que proporcionaste
                        razon_social = data.get("nombre_o_razon_social") or data.get(
                            "razon_social"
                        )

                        if razon_social:
                            customer_data = {
                                "name": str(razon_social).strip(),
                                "document_type": "RUC",
                                "tax_id": doc_number,
                                "address": data.get(
                                    "direccion_completa", data.get("direccion", "PERU")
                                ),
                            }

                elif doc_type == "CEE":
                    r = requests.get(
                        f"https://api.factiliza.com/v1/cee/info/{doc_number}",
                        headers=headers,
                        timeout=5,
                    )
                    resp = r.json()
                    # CE no trae success=true, solo message=Exito
                    if r.status_code == 200 and resp.get("message") == "Exito":
                        data = resp.get("data", resp)
                        nombres = data.get("nombres")

                        if nombres:
                            name_str = f"{data.get('nombres', '')} {data.get('apellido_paterno', '')} {data.get('apellido_materno', '')}".strip()
                            customer_data = {
                                "name": name_str,
                                "document_type": "CE",
                                "tax_id": doc_number,
                                "address": "PERU",  # Extranjería no devuelve dirección exacta
                            }
            except Exception as e:
                print(f"Factiliza fallo o crasheo: {e}")

        # 5. RETORNAR RESULTADOS AL FRONTEND
        if customer_data and customer_data.get("name"):
            return Response({"exists_local": False, "data": customer_data}, status=200)

        return Response(
            {
                "error": "No se encontraron datos en SUNAT/RENIEC/MIGRACIONES. Por favor, ingrese los datos manualmente."
            },
            status=404,
        )


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
            is_factura = raw_invoice_type == "01"
            cid = data.get("customer")

            # 👇 SOLUCIÓN: Auto-crear cliente si viene de la Web sin ID 👇
            client_doc = data.get("customer_document")
            client_name = data.get("customer_name")
            doc_type_front = data.get("customer_type", "DNI")
            customer_obj = None

            if (
                (not cid or int(cid) < 0)
                and client_doc
                and client_doc not in ["", "00000000"]
            ):
                # Lo buscamos o lo creamos al instante en Postgres/MySQL
                customer_obj, _ = Customer.objects.get_or_create(
                    tax_id=client_doc,
                    defaults={
                        "name": client_name or "Cliente General",
                        "document_type": doc_type_front,
                        "address": "PERU",
                    },
                )
                # Le asignamos el nuevo ID REAL para el resto del proceso
                cid = customer_obj.id

            elif cid and int(cid) > 0:
                # Si el ID es positivo, es un cliente normal que ya existía
                customer_obj = Customer.objects.filter(id=cid).first()

            shift = None
            serie = ""
            tipo = ""
            # 🔥 SEPARAMOS LA LÓGICA WEB Y POS 🔥
            if origin == "pos":
                shift = (
                    CashShift.objects.filter(user=self.request.user, status="OPEN")
                    .order_by("-opened_at")
                    .first()
                )
                if not shift:
                    raise serializers.ValidationError(
                        {
                            "error": "Error de seguridad: El usuario no tiene ningun turno de caja registrado para emitir comprobantes."
                        }
                    )
                caja = shift.cash_register

                if is_courtesy:
                    serie = "T001"
                    tipo = "99"
                elif is_nota_venta:
                    serie = "NV01"
                    tipo = "00"
                else:
                    if cid:
                        if Customer.objects.filter(
                            pk=cid, document_type="RUC"
                        ).exists():
                            is_factura = True
                    serie = caja.factura_series if is_factura else caja.boleta_series
                    tipo = "01" if is_factura else "03"
            else:
                # SI ORIGEN ES WEB (NO HAY CAJA REGISTRADORA)
                if is_courtesy:
                    serie = "T001"
                    tipo = "99"
                elif is_nota_venta:
                    serie = "NV01"
                    tipo = "00"
                else:
                    if cid:
                        if Customer.objects.filter(
                            pk=cid, document_type="RUC"
                        ).exists():
                            is_factura = True

                    # LA WEB AHORA RESPETA SUS PROPIAS SERIES DESDE LA SEDE
                    branch_obj = Branch.objects.get(id=branch_id)

                    serie = (
                        branch_obj.web_factura_series
                        if is_factura
                        else branch_obj.web_boleta_series
                    )
                    tipo = "01" if is_factura else "03"

            # VALIDACIÓN CRÍTICA: Si es cortesía, el supervisor ES OBLIGATORIO
            if is_courtesy and supervisor is None:
                raise serializers.ValidationError(
                    {
                        "error": "ERROR DE SEGURIDAD: No se puede hacer una cortesia sin autorizacion valida."
                    }
                )

            # 4. Correlativo
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

            # DEFINIMOS LA FUNCIÓN RECURSIVA DENTRO DEL SCOPE
            def procesar_descuento_inventario(
                producto, cantidad_a_descontar, branch_id_local, costo_heredado=None
            ):

                # =======================================================
                # CASO 1: EL PRODUCTO MANEJA STOCK (MTS - Make To Stock)
                # (Aplica para Gaseosas, Insumos, y Productos Terminados Pre-Preparados)
                # =======================================================
                if producto.manage_stock:
                    st, _ = Stock.objects.get_or_create(
                        branch_id=branch_id_local,
                        product=producto,
                        defaults={"quantity": 0},
                    )
                    # if st.quantity < cantidad_a_descontar:
                    #     raise serializers.ValidationError(
                    #         {
                    #             "error": f"Stock insuficiente en el insumo/producto '{producto.name}'. "
                    #             f"Tienes {st.quantity} y necesitas {cantidad_a_descontar}."
                    #         }
                    #     )
                    costo_unitario = (
                        costo_heredado
                        if costo_heredado is not None
                        else st.average_cost
                    )
                    st.quantity -= cantidad_a_descontar
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

            sale.total_gravada = (
                Decimal(str(total_gravada)) if not is_courtesy else Decimal("0")
            )
            sale.total_igv = (
                Decimal(str(total_igv)) if not is_courtesy else Decimal("0")
            )

            # 🔥 CORRECCIÓN SIRE: Aplicar descuento a total_gravada y total_igv
            if sale.discount_amount and sale.discount_amount > 0:
                disc_base = sale.discount_amount / Decimal("1.18")
                disc_igv = sale.discount_amount - disc_base
                sale.total_gravada = round(sale.total_gravada - disc_base, 2)
                sale.total_igv = round(sale.total_igv - disc_igv, 2)

            if is_courtesy:
                sale.total = 0
                sale.status = "COMPLETED"
                sale.sunat_status = "ACCEPTED"

            # Si es Nota de Venta, la damos por aceptada internamente
            if is_nota_venta:
                sale.sunat_status = "ACCEPTED"
                sale.sunat_description = "Uso Interno (No enviada a SUNAT)"

            sale.save()

            event_id = data.get("event_id")
            event_id = data.get("event_id")
            if event_id:
                try:
                    # 🛡️ BLOQUEO DE FILA: select_for_update() impide que 2 compras simultáneas repitan el mismo código
                    evento = Event.objects.select_for_update().get(id=event_id)
                    detalles_recibidos = data.get("details", [])

                    # LÓGICA DE CENTRALIZACIÓN POR CATEGORÍA
                    total_entradas = 0
                    for d in detalles_recibidos:
                        from inventory.models import Product

                        prod_obj = Product.objects.filter(id=d.get("product")).first()

                        if (
                            prod_obj
                            and prod_obj.category
                            # RECONOCIMIENTO DE CATEGORIA
                            and prod_obj.category.name.upper()
                            in ["BOLETERÍA", "EVENTOS"]
                        ):
                            total_entradas += int(d.get("quantity", 0))

                    if total_entradas > 0:
                        prefix = f"E-{evento.branch.name[:3].upper()}"
                        last_ticket = (
                            EventRegistration.objects.filter(
                                ticket_code__startswith=prefix
                            )
                            .order_by("-id")
                            .first()
                        )

                        if last_ticket:
                            try:
                                last_num = int(
                                    last_ticket.ticket_code.replace(prefix, "")
                                )
                                new_code = f"{prefix}{str(last_num + 1).zfill(3)}"
                            except:  # noqa: E722
                                new_code = f"{prefix}001"
                        else:
                            new_code = f"{prefix}001"

                        # 👇 NUEVA MAGIA: AUTO-NUMERACIÓN DE PARTICIPANTES 👇
                        attendee_data = data.get("attendee_data")

                        if attendee_data and isinstance(attendee_data, list):
                            schema = evento.form_schema or []

                            for attendee in attendee_data:
                                perfil_aplicado = attendee.get("perfil_aplicado")

                                # Buscamos la configuración de ese perfil principal (Ej: "Menores")
                                matched_profile = None
                                for p in schema:
                                    if p.get("profileName") == perfil_aplicado:
                                        matched_profile = p
                                        break

                                if matched_profile:
                                    # Extraemos qué compró exactamente el usuario (Ej: "Kids")
                                    categoria_elegida = str(
                                        attendee.get("categoria_elegida", "")
                                    ).strip()

                                    # Extraemos los diccionarios de React
                                    category_codes = matched_profile.get(
                                        "categoryCodes", {}
                                    )
                                    current_codes_dict = matched_profile.get(
                                        "currentCodes", {}
                                    )

                                    # 1. Buscamos el inicio para esa categoría (Ej: 1000)
                                    start_code = int(
                                        category_codes.get(categoria_elegida) or 0
                                    )

                                    # 2. Vemos por dónde va el conteo de esa categoría
                                    current_code = int(
                                        current_codes_dict.get(categoria_elegida)
                                        or start_code
                                    )

                                    # 3. Incrementamos
                                    next_code = current_code + 1
                                    current_codes_dict[categoria_elegida] = next_code

                                    # Guardamos el diccionario de progreso actualizado
                                    matched_profile["currentCodes"] = current_codes_dict

                                    # Inyectamos el Código al formulario del Participante
                                    attendee["N° DORSAL"] = str(next_code)
                                else:
                                    attendee["N° DORSAL"] = f"{new_code}-GEN"

                            evento.form_schema = schema
                            evento.save(update_fields=["form_schema"])
                        # 👆 FIN DE LA MAGIA 👇

                        # Creamos el registro con el conteo real de "Boletería"
                        EventRegistration.objects.create(
                            event=evento,
                            sale=sale,
                            ticket_code=new_code,
                            schedule_selected=data.get("schedule_selected"),
                            operation_number=data.get("operation_number"),
                            observations=data.get("observations"),
                            total_quantity=total_entradas,
                            redeemed_quantity=0,
                            advisor=data.get("advisor"),
                            attendee_data=attendee_data,  # 👈 Ahora se guarda con los dorsales inyectados
                        )
                except Event.DoesNotExist:
                    pass

            # 6. REGISTRO EN CAJA CORREGIDO
            if origin == "pos" and shift and not is_courtesy:
                payments_data = data.get("payments", [])

                if not payments_data and hasattr(sale, "total"):
                    CashMovement.objects.create(
                        shift=shift,
                        user=self.request.user,
                        amount=sale.total,
                        movement_type="IN",
                        concept="SALE",
                        description=f"Venta {sale.series}-{sale.number}",
                        related_sale=sale,
                    )
                else:
                    for p_data in payments_data:
                        monto_pago = float(p_data.get("amount", 0))
                        metodo_pago = p_data.get("payment_method", "CASH")

                        if monto_pago > 0:
                            CashMovement.objects.create(
                                shift=shift,
                                user=self.request.user,
                                amount=monto_pago,
                                movement_type="IN",
                                concept="SALE",
                                description=f"Venta {sale.series}-{sale.number} ({metodo_pago})",
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

    # EL MOTOR DE SINCRONIZACIÓN OFFLINE-FIRST
    @action(detail=False, methods=["post"])
    def bulk_sync(self, request):
        sales_data = request.data

        if not isinstance(sales_data, list):
            return Response(
                {
                    "error": "Formato invalido. Se esperaba una lista de ventas [{}, {}]."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        synced_count = 0
        errors = []
        successes = []  # 🌟 NUEVO: Lista para decirle a React exactamente cuáles ya están listas

        self.is_bulk_sync = True

        for index, sale_json in enumerate(sales_data):
            sale_uuid = sale_json.get("uuid")

            # 1. IDEMPOTENCIA: Si ya existe, le decimos al front que es un ÉXITO para que deje de enviarlo
            if sale_uuid and Sale.objects.filter(uuid=sale_uuid).exists():
                successes.append({"uuid": sale_uuid})
                continue

            serializer = self.get_serializer(data=sale_json)

            try:
                if serializer.is_valid():
                    self.perform_create(serializer)
                    synced_count += 1
                    successes.append({"uuid": sale_uuid})  # 🌟 Añadimos a éxitos
                else:
                    errors.append(
                        {"index": index, "uuid": sale_uuid, "errors": serializer.errors}
                    )
            except Exception as e:
                # 🛡️ EL SALVAVIDAS: Si a pesar de todo MySQL lanza el error 1062 (Duplicado), lo salvamos
                if "1062" in str(e) or "Duplicate entry" in str(e):
                    successes.append({"uuid": sale_uuid})
                else:
                    errors.append({"index": index, "uuid": sale_uuid, "errors": str(e)})

        return Response(
            {
                "message": "Sincronizacion finalizada",
                "synced_count": synced_count,
                "successes": successes,  # 🌟 NUEVO: Se lo enviamos a React
                "errors": errors,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def export_excel(self, request):
        queryset = self.filter_queryset(self.get_queryset()).prefetch_related(
            "payments", "customer", "credit_notes"
        )

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Historial de Ventas"

        # 1. CABECERAS
        headers = [
            "Fecha",  # A
            "Hora",  # B
            "Documento",  # C
            "Serie",  # D
            "Correlativo",  # E
            "RUC/DNI Cliente",  # F
            "Razón Social / Nombre",  # G
            "Subtotal",  # H
            "IGV",  # I
            "Total (S/)",  # J
            "Estado SUNAT",  # K
            "Referencia",  # L
            "Método de Pago",  # M
        ]
        ws.append(headers)

        for s in queryset:
            notas = s.credit_notes.all()
            es_anulada = len(notas) > 0

            # --- 1. PREPARAMOS LOS DATOS DE LA VENTA ORIGINAL ---
            if s.series.startswith("F"):
                tipo_doc = "Factura"
            elif s.series.startswith("B"):
                tipo_doc = "Boleta"
            elif s.series.startswith("NV") or s.series.startswith("N"):
                tipo_doc = "Nota de Venta"
            else:
                tipo_doc = "Ticket"

            pagos = s.payments.all()
            metodos_pago = (
                ", ".join([p.payment_method for p in pagos])
                if len(pagos) > 0
                else "EFECTIVO"
            )

            documento_cliente = s.customer.tax_id if s.customer else "-"
            nombre_cliente = s.customer.name if s.customer else "Público General"

            # El monto original SIEMPRE va en positivo para respetar el libro mayor
            total_final = float(s.total) if s.total else 0.0
            subtotal = total_final / 1.18
            igv = total_final - subtotal

            if tipo_doc in ["Factura", "Boleta"]:
                raw_status = s.sunat_status or "PENDIENTE"
                if raw_status == "ACCEPTED":
                    estado_label = "ACEPTADO"
                elif raw_status == "REJECTED":
                    estado_label = "RECHAZADO"
                else:
                    estado_label = "PENDIENTE"
            else:
                # Si es Ticket o Nota de Venta, no va a SUNAT
                estado_label = "NO APLICA"

            # --- 2. DIBUJAMOS LA VENTA ORIGINAL ---
            ws.append(
                [
                    s.date.strftime("%d/%m/%Y") if s.date else "-",
                    s.date.strftime("%H:%M") if s.date else "-",
                    tipo_doc,
                    s.series,
                    s.number,
                    documento_cliente,
                    nombre_cliente,
                    subtotal,
                    igv,
                    total_final,
                    estado_label,
                    "-",
                    metodos_pago,
                ]
            )

            # --- 3. DIBUJAMOS LA NOTA DE CRÉDITO (SI TIENE) EN NEGATIVO ---
            if es_anulada:
                for nc in notas:
                    # Las Notas de Crédito SÍ van a SUNAT, así que traducimos su estado
                    raw_nc_status = nc.sunat_status or "PENDIENTE"
                    if raw_nc_status == "ACCEPTED":
                        estado_nc = "ACEPTADO"
                    elif raw_nc_status == "REJECTED":
                        estado_nc = "RECHAZADO"
                    else:
                        estado_nc = "PENDIENTE"

                    ws.append(
                        [
                            nc.date.strftime("%d/%m/%Y") if nc.date else "-",
                            nc.date.strftime("%H:%M") if nc.date else "-",
                            "Nota de Credito",
                            nc.series,
                            nc.number,
                            documento_cliente,
                            nombre_cliente,
                            -subtotal,
                            -igv,
                            -total_final,
                            estado_nc,
                            f"Ref: {s.series}-{s.number}",
                            "DEVOLUCION",
                        ]
                    )

        # ========================================================
        # 🎨 DISEÑO, BORDES Y AUTO-AJUSTE
        # ========================================================
        header_fill = PatternFill(
            start_color="1E293B", end_color="1E293B", fill_type="solid"
        )
        header_font = Font(color="FFFFFF", bold=True)
        thin_border = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1"),
        )

        # Pintamos la cabecera
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border

        # Fijamos los anchos a mano
        anchos_columnas = {
            "A": 12,  # Fecha
            "B": 8,  # Hora
            "C": 15,  # Documento (más ancho por "Nota de Credito")
            "D": 8,  # Serie
            "E": 12,  # Correlativo
            "F": 15,  # RUC/DNI
            "G": 35,  # Razón Social
            "H": 12,  # Subtotal
            "I": 12,  # IGV
            "J": 15,  # Total
            "K": 15,  # Estado SUNAT
            "L": 18,  # Referencia
            "M": 15,  # Método de pago
        }
        for letra, ancho in anchos_columnas.items():
            ws.column_dimensions[letra].width = ancho

        # Aplicamos el formato de Moneda a las columnas H, I, J
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=8, max_col=10):
            for cell in row:
                cell.number_format = '"S/" #,##0.00'

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = (
            'attachment; filename="Historial_Ventas_Ludicus.xlsx"'
        )
        wb.save(response)
        return response


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
            # 👇 LA SOLUCIÓN: SERIES SEPARADAS PARA NO QUEMAR CORRELATIVOS SUNAT 👇
            if sale.invoice_type_code == "01":
                serie_nc = "FC01"  # Nota de Crédito de Factura (Va a SUNAT)
            elif sale.invoice_type_code == "03":
                serie_nc = "BC01"  # Nota de Crédito de Boleta (Va a SUNAT)
            elif sale.invoice_type_code == "00":
                serie_nc = "NC01"  # Anulación interna de Nota de Venta
            else:
                serie_nc = "TC01"  # Anulación interna de Ticket (99)
            # 👆 FIN DE LA SOLUCIÓN 👆

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

        if sale.invoice_type_code not in ["99", "00"]:
            # CREAMOS UN HILO (THREAD) PARA NO HACER ESPERAR AL FRONTEND
            def enviar_nota_async(nota_id):
                from django.db import connection

                try:
                    nota_bd = CreditNote.objects.get(id=nota_id)
                    InvoiceService(None).enviar_nota(nota_bd)
                except Exception as e:
                    print(f"Error en hilo de SUNAT (Nota de Credito): {e}")
                finally:
                    connection.close()

            # Disparamos el hilo en segundo plano al instante
            threading.Thread(target=enviar_nota_async, args=(note.id,)).start()
        else:
            # 👇 CORRECCIÓN FINAL PARA EL EXCEL 👇
            note.sunat_status = "NO APLICA"
            note.sunat_description = "Anulacion de Uso Interno"
            note.save()
