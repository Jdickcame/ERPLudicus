from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Event, EventRegistration
from .serializers import EventRegistrationSerializer, EventSerializer


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all().order_by("-date")
    serializer_class = EventSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs


class EventRegistrationViewSet(viewsets.ModelViewSet):
    queryset = EventRegistration.objects.all().order_by("-created_at")
    serializer_class = EventRegistrationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        event_id = self.request.query_params.get("event_id")
        search = self.request.query_params.get("search")

        # CAPTURAMOS LAS FECHAS
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        payment_method = self.request.query_params.get("payment_method")

        if event_id:
            qs = qs.filter(event_id=event_id)

        # APLICAMOS EL FILTRO DE RANGO DE FECHAS
        if start_date and end_date:
            qs = qs.filter(sale__date__date__range=[start_date, end_date])

        if payment_method and payment_method != "ALL":
            qs = qs.filter(sale__payments__payment_method=payment_method)

        if search:
            qs = qs.filter(
                Q(ticket_code__icontains=search)  # Busca por E-TRU001
                | Q(
                    sale__client_name__icontains=search
                )  # Busca por Nombre (Ej: "Juan")
                | Q(sale__client_doc__icontains=search)  # Busca por DNI (Ej: "72635")
            )
        return qs

    @action(detail=True, methods=["patch"])
    def redeem(self, request, pk=None):
        registration = self.get_object()

        # React nos enviará algo como {"15": 2, "18": 1}
        items_to_redeem = request.data.get("items", {})

        # 👇 1. ATRAPAMOS EL ÍNDICE EXACTO DE LA PERSONA 👇
        attendee_index = request.data.get("attendee_index")

        if not items_to_redeem:
            return Response(
                {"error": "Debes especificar qué entradas vas a canjear."}, status=400
            )

        breakdown = registration.redeemed_breakdown or {}

        # 1. Validamos que no intenten meter más personas de las que compraron
        for prod_id_str, qty_str in items_to_redeem.items():
            qty_to_add = int(qty_str)
            if qty_to_add <= 0:
                continue

            detalle = registration.sale.details.filter(
                product_id=int(prod_id_str)
            ).first()
            if not detalle:
                return Response(
                    {"error": "Producto no válido para este ticket."}, status=400
                )

            comprados = int(detalle.quantity)
            ya_canjeados = breakdown.get(prod_id_str, 0)

            if ya_canjeados + qty_to_add > comprados:
                return Response(
                    {
                        "error": f'No quedan suficientes entradas de "{detalle.product.name}".'
                    },
                    status=400,
                )

        # 2. Si todo está bien, sumamos y guardamos
        total_canjeando_ahora = 0
        for prod_id_str, qty_str in items_to_redeem.items():
            qty_to_add = int(qty_str)
            if qty_to_add > 0:
                breakdown[prod_id_str] = breakdown.get(prod_id_str, 0) + qty_to_add
                total_canjeando_ahora += qty_to_add

        registration.redeemed_breakdown = breakdown
        registration.redeemed_quantity += total_canjeando_ahora

        if registration.redeemed_quantity >= registration.total_quantity:
            registration.status = "REDEEMED"

        registration.redeemed_at = timezone.now()

        # 👇 2. MARCAMOS AL PARTICIPANTE EXACTO COMO "VALIDADO" EN EL JSON 👇
        if attendee_index is not None and registration.attendee_data:
            try:
                idx = int(attendee_index)
                if 0 <= idx < len(registration.attendee_data):
                    registration.attendee_data[idx]["_valido"] = True
            except ValueError:
                pass

        registration.save()

        # Devolvemos toda la data fresca a React
        serializer = self.get_serializer(registration)
        return Response(serializer.data)

    # NUEVA ACCIÓN PARA EXPORTAR EL EXCEL
    @action(detail=False, methods=["get"])
    def export_excel(self, request):
        # Usamos filter_queryset para que aplique los filtros de fecha que configuramos arriba
        queryset = self.filter_queryset(self.get_queryset())

        wb = Workbook()
        ws = wb.active
        ws.title = "Reporte de Inscripciones"

        # Cabeceras del Excel
        headers = [
            "Fecha Venta",
            "Ticket",
            "Cliente",
            "Documento",
            "Evento",
            "Horario",
            "Asesor",
            "Método Pago",
            "Total (S/)",
        ]
        ws.append(headers)

        for reg in queryset:
            # Protecciones por si alguna venta quedó huérfana
            if not reg.sale:
                continue

            # Obtenemos el método de pago
            payment = reg.sale.payments.first()
            payment_method = payment.payment_method if payment else "N/A"

            cliente_nombre = "Público General"
            cliente_doc = "S/N"

            if reg.sale.customer:
                cliente_nombre = reg.sale.customer.name
                cliente_doc = reg.sale.customer.tax_id

            # Formateamos los datos para la fila
            ws.append(
                [
                    reg.sale.date.strftime("%d/%m/%Y %H:%M"),
                    reg.ticket_code,
                    cliente_nombre,  # Usamos la variable segura
                    cliente_doc,  # Usamos la variable segura
                    reg.event.name if reg.event else "N/A",
                    reg.schedule_selected or "N/A",
                    reg.advisor or "S/A",
                    payment_method,
                    float(reg.sale.total),
                ]
            )

        # Preparamos la respuesta HTTP
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="Reporte_Eventos.xlsx"'
        wb.save(response)

        return response
