from cash.models import CashShift
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import CreditNote, Sale
from .pdf_engine import A4Engine, TicketEngine


@api_view(["GET"])
@permission_classes([AllowAny])
def generate_pdf_view(request, pk):
    sale = get_object_or_404(Sale, pk=pk)

    tipo_papel = request.query_params.get("papel", "ticket_80")

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = (
        f'inline; filename="{sale.series}-{sale.number}.pdf"'
    )

    if sale.invoice_type_code == "01":
        titulo = "FACTURA ELECTRÓNICA"
    elif sale.invoice_type_code == "03":
        titulo = "BOLETA DE VENTA"
    elif sale.invoice_type_code == "00":
        titulo = "NOTA DE VENTA"
    else:
        titulo = "TICKET INTERNO"

    if tipo_papel == "a4":
        engine = A4Engine(response)
    else:
        engine = TicketEngine(response)

    engine.generate(sale, titulo, sale.details.all())
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def generate_nc_pdf_view(request, pk):
    note = get_object_or_404(CreditNote, pk=pk)

    format_type = request.query_params.get("format", "ticket_80")

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = (
        f'inline; filename="{note.series}-{note.number}.pdf"'
    )

    if format_type == "a4":
        engine = A4Engine(response)
    else:
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
@permission_classes([IsAuthenticated])
def print_hourly_report_view(request):
    # 👇 1. BUSCAMOS SI LA WEB NOS MANDÓ UN TURNO ESPECÍFICO 👇
    shift_id = request.query_params.get("shift_id")

    if shift_id:
        shift = get_object_or_404(CashShift, pk=shift_id)
    else:
        shift = CashShift.objects.filter(user=request.user, status="OPEN").first()

    if not shift:
        return HttpResponse("No se encontró el turno de caja.", status=400)

    # 👇 2. FILTRAMOS ESTRICTAMENTE POR EL TURNO (Shift) 👇
    sales = Sale.objects.filter(shift=shift).exclude(status="CANCELED")

    if request.user.role != "ADMIN" and request.user.branch:
        sales = sales.filter(branch=request.user.branch)

    hourly_data = {}
    for sale in sales:
        hour = sale.date.hour
        time_label = f"{str(hour).zfill(2)}:00 - {str(hour).zfill(2)}:59"

        if time_label not in hourly_data:
            hourly_data[time_label] = {"count": 0, "gross": 0.0, "net": 0.0}

        hourly_data[time_label]["count"] += 1
        hourly_data[time_label]["gross"] += float(sale.total)
        hourly_data[time_label]["net"] += float(sale.total) / 1.18

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = 'inline; filename="Reporte_Horas.pdf"'

    engine = TicketEngine(response)
    engine.generate_hourly_report(shift.opened_at, hourly_data)

    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def print_pmix_report_view(request):
    # 👇 1. BUSCAMOS EL TURNO ESPECÍFICO 👇
    shift_id = request.query_params.get("shift_id")

    if shift_id:
        shift = get_object_or_404(CashShift, pk=shift_id)
    else:
        shift = CashShift.objects.filter(user=request.user, status="OPEN").first()

    if not shift:
        return HttpResponse("No se encontró el turno de caja.", status=400)

    # 👇 2. FILTRAMOS ESTRICTAMENTE POR EL TURNO 👇
    sales = (
        Sale.objects.filter(shift=shift)
        .exclude(status="CANCELED")
        .prefetch_related("details__product")
    )

    if request.user.role != "ADMIN" and request.user.branch:
        sales = sales.filter(branch=request.user.branch)

    pmix_data = {}
    for sale in sales:
        for detail in sale.details.all():
            name = detail.product.name
            qty = float(detail.quantity)

            if name not in pmix_data:
                pmix_data[name] = 0
            pmix_data[name] += qty

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = 'inline; filename="Reporte_PMIX.pdf"'

    engine = TicketEngine(response)
    engine.generate_pmix_report(pmix_data)

    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def print_courtesies_report_view(request):
    # 👇 1. BUSCAMOS EL TURNO ESPECÍFICO 👇
    shift_id = request.query_params.get("shift_id")

    if shift_id:
        shift = get_object_or_404(CashShift, pk=shift_id)
    else:
        shift = CashShift.objects.filter(user=request.user, status="OPEN").first()

    if not shift:
        return HttpResponse("No se encontró el turno de caja.", status=400)

    # 👇 2. FILTRAMOS ESTRICTAMENTE POR EL TURNO 👇
    sales = (
        Sale.objects.filter(shift=shift)
        .exclude(status="CANCELED")
        .prefetch_related("details__product")
    )

    if request.user.role != "ADMIN" and request.user.branch:
        sales = sales.filter(branch=request.user.branch)

    courtesy_pmix = {}
    total_costo_asumido = 0.0

    for sale in sales:
        if sale.invoice_type_code == "99" or getattr(sale, "is_courtesy", False):
            for d in sale.details.all():
                name = d.product.name
                qty = float(d.quantity)

                costo_linea = float(d.price) * qty
                total_costo_asumido += costo_linea

                if name not in courtesy_pmix:
                    courtesy_pmix[name] = 0
                courtesy_pmix[name] += qty

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = 'inline; filename="Reporte_Cortesias.pdf"'

    engine = TicketEngine(response)
    engine.generate_courtesies_report(
        courtesy_pmix, total_costo_asumido, shift.opened_at
    )

    return response
