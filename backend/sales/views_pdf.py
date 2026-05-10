# backend/sales/views_pdf.py
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

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
