# backend/sales/views_pdf.py
from cash.models import CashShift
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import CreditNote, Sale
from .pdf_engine import TicketEngine  # 👈 Importamos nuestro motor nuevo


@api_view(["GET"])
@permission_classes([AllowAny])
def generate_pdf_view(request, pk):
    # 1. PDF DE VENTA
    sale = get_object_or_404(Sale, pk=pk)

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = (
        f'inline; filename="{sale.series}-{sale.number}.pdf"'
    )

    titulo = (
        "FACTURA ELECTRÓNICA" if sale.invoice_type_code == "01" else "BOLETA DE VENTA"
    )

    # Usamos el motor
    engine = TicketEngine(response)
    engine.generate(sale, titulo, sale.details.all())

    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def generate_nc_pdf_view(request, pk):
    # 2. PDF DE NOTA DE CRÉDITO
    note = get_object_or_404(CreditNote, pk=pk)

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = (
        f'inline; filename="{note.series}-{note.number}.pdf"'
    )

    # Usamos el mismo motor, activando modo 'is_note'
    engine = TicketEngine(response)
    engine.generate(
        note,
        "NOTA DE CRÉDITO",
        note.sale.details.all(),
        total_label="TOTAL DEVOLUCIÓN",
        is_note=True,
    )

    return response


@api_view(["GET"])
@permission_classes(
    [IsAuthenticated]
)  # 🔒 Protegido: Necesitamos saber quién es el cajero
def print_hourly_report_view(request):
    # 1. Buscar turno abierto de este usuario
    shift = CashShift.objects.filter(user=request.user, status="OPEN").first()
    if not shift:
        return HttpResponse("No tienes un turno de caja abierto.", status=400)

    # 2. Obtener las ventas válidas del turno
    sales = Sale.objects.filter(date__gte=shift.opened_at).exclude(status="CANCELED")

    if request.user.role != "ADMIN" and request.user.branch:
        sales = sales.filter(branch=request.user.branch)

    # 3. Agrupar la matemática
    hourly_data = {}
    for sale in sales:
        hour = sale.date.hour
        time_label = f"{str(hour).zfill(2)}:00 - {str(hour).zfill(2)}:59"

        if time_label not in hourly_data:
            hourly_data[time_label] = {"count": 0, "gross": 0.0, "net": 0.0}

        hourly_data[time_label]["count"] += 1
        hourly_data[time_label]["gross"] += float(sale.total)
        hourly_data[time_label]["net"] += float(sale.total) / 1.18

    # 4. Enviar al motor PDF
    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = 'inline; filename="Reporte_Horas.pdf"'

    engine = TicketEngine(response)
    engine.generate_hourly_report(shift.opened_at, hourly_data)

    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def print_pmix_report_view(request):
    shift = CashShift.objects.filter(user=request.user, status="OPEN").first()
    if not shift:
        return HttpResponse("No tienes un turno de caja abierto.", status=400)

    # Solo nos interesan las ventas completadas
    sales = (
        Sale.objects.filter(date__gte=shift.opened_at)
        .exclude(status="CANCELED")
        .prefetch_related("details__product")
    )

    # Igual que arriba:
    if request.user.role != "ADMIN" and request.user.branch:
        sales = sales.filter(branch=request.user.branch)

    # Agrupar matemática del PMIX
    pmix_data = {}
    for sale in sales:
        for detail in sale.details.all():
            name = detail.product.name
            qty = float(detail.quantity)

            if name not in pmix_data:
                pmix_data[name] = 0
            pmix_data[name] += qty

    # Enviar al motor PDF
    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = 'inline; filename="Reporte_PMIX.pdf"'

    engine = TicketEngine(response)
    engine.generate_pmix_report(pmix_data)

    return response
