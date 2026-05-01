import threading

import requests

# Imports de Modelos
from cash.models import CashMovement, CashShift
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from inventory.models import Kardex, Stock
from num2words import num2words
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing

# PDF Imports (ReportLab)
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

# DRF Imports
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .invoice_service import InvoiceService
from .models import Customer, Sale
from .serializers import CustomerSerializer, SaleSerializer

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

        with transaction.atomic():
            # 1. Configurar Series
            is_factura = False
            cid = self.request.data.get("customer")
            if cid:
                if Customer.objects.filter(pk=cid, document_type="RUC").exists():
                    is_factura = True

            serie = "F007" if is_factura else "B007"
            tipo = "01" if is_factura else "03"

            # 2. Correlativo
            last = Sale.objects.filter(series=serie).order_by("-number").first()
            new_num = (int(last.number) + 1) if last else 1

            # 3. Guardar Venta
            sale = serializer.save(
                branch_id=branch_id,
                series=serie,
                number=str(new_num).zfill(8),
                invoice_type_code=tipo,
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

                # Kardex
                Kardex.objects.create(
                    branch_id=branch_id,
                    product=d.product,
                    date=sale.date,
                    type="OUT_SALE",
                    quantity=d.quantity,
                    unit_cost=d.unit_cost,
                    total_cost=d.quantity * d.unit_cost,
                    balance_quantity=st.quantity,
                    balance_unit_cost=st.average_cost,
                    balance_total_cost=st.quantity * st.average_cost,
                    user=self.request.user,
                    description=f"Venta {sale.id}",
                )

                # Impuestos
                sub = float(d.subtotal)
                base = sub / 1.18
                total_gravada += base
                total_igv += sub - base
                d.save()

            sale.total_gravada = round(total_gravada, 2)
            sale.total_igv = round(total_igv, 2)
            sale.save()

            # 5. REGISTRO EN CAJA (Esto faltaba y por eso los imports no se usaban)
            shift = CashShift.objects.filter(
                user=self.request.user, status="OPEN"
            ).first()
            if shift:
                for p in sale.payments.all():
                    CashMovement.objects.create(
                        shift=shift,
                        user=self.request.user,
                        amount=p.amount,
                        movement_type="IN",  # Ingreso
                        concept="SALE",
                        description=f"Venta {sale.series}-{sale.number}",
                        related_sale=sale,
                    )

            # 6. Facturación Electrónica (Hilo)
            def enviar():
                try:
                    InvoiceService(sale).generar_comprobante()
                except:  # noqa: E722
                    pass

            threading.Thread(target=enviar).start()


# --- FUNCIÓN DE TICKET RESPONSIVO (DISEÑO LÍQUIDO) ---


@api_view(["GET"])
@permission_classes([AllowAny])
def generate_pdf_view(request, pk):
    try:
        sale = (
            Sale.objects.select_related("customer")
            .prefetch_related("details__product", "payments")
            .get(pk=pk)
        )
    except Sale.DoesNotExist:
        return HttpResponse("Venta no encontrada", status=404)

    # 1. ANCHO DINÁMICO
    try:
        width_req = int(request.query_params.get("width", 72))
    except ValueError:
        width_req = 72

    response = HttpResponse(content_type="application/pdf")
    filename = f"{sale.series}-{sale.number}.pdf"
    response["Content-Disposition"] = f'inline; filename="{filename}"'

    # --- 2. MATEMÁTICA DEL DISEÑO LÍQUIDO ---
    ancho_total = width_req * mm

    # Factor de Escala
    scale = width_req / 72.0

    # Márgenes Porcentuales
    margin_pct = 0.05
    x_izq = ancho_total * margin_pct
    x_der = ancho_total * (1 - margin_pct)
    x_centro = ancho_total / 2
    ancho_util = x_der - x_izq

    # Funciones Helper
    def get_size(base_pt):
        return base_pt * scale

    # Calculamos alto dinámico
    row_h = 5 * mm * scale
    items_h = len(sale.details.all()) * (row_h + (1 * mm))
    pagos_h = len(sale.payments.all()) * row_h

    # 👇 AQUÍ ESTABA EL ERROR: Definimos qr_size y qr_h correctamente
    qr_size = ancho_util * 0.5
    qr_h = qr_size + (10 * mm * scale)  # Le damos un poco de aire extra

    base_h = 220 * mm * scale
    alto_total = base_h + items_h + pagos_h + qr_h

    c = canvas.Canvas(response, pagesize=(ancho_total, alto_total))
    y = alto_total - (5 * mm * scale)

    # --- 3. DIBUJO DEL CONTENIDO ---

    # Cabecera
    c.setFont("Helvetica-Bold", get_size(11))
    c.drawCentredString(x_centro, y, "AGA CORP S.A.C.")
    y -= row_h
    c.setFont("Helvetica", get_size(9))
    c.drawCentredString(x_centro, y, "RUC: 20491934671")
    y -= row_h
    c.setFont("Helvetica", get_size(8))
    c.drawCentredString(x_centro, y, "Cal. Siqueiros Nro 110 - Surquillo")
    y -= row_h * 0.8
    c.drawCentredString(x_centro, y, "Lima - Lima")
    y -= row_h * 2

    # Info Doc
    tipo_txt = (
        "FACTURA ELECTRÓNICA"
        if sale.invoice_type_code == "01"
        else "BOLETA DE VENTA ELECTRÓNICA"
    )
    c.setFont("Helvetica-Bold", get_size(9))
    c.drawCentredString(x_centro, y, tipo_txt)
    y -= row_h
    c.setFont("Helvetica-Bold", get_size(12))
    c.drawCentredString(x_centro, y, f"{sale.series}-{sale.number}")
    y -= row_h * 2

    # Cliente
    c.setFont("Helvetica", get_size(8))
    c.drawString(x_izq, y, f"F. Emisión: {sale.date.strftime('%d/%m/%Y %H:%M')}")
    y -= row_h

    def safe_text(txt, limit=30):
        return txt[:limit] + "..." if len(txt) > limit else txt

    nom_cli = sale.customer.name if sale.customer else "PUBLICO GENERAL"
    doc_cli = sale.customer.tax_id if sale.customer else "-"
    dir_cli = (
        sale.customer.address if (sale.customer and sale.customer.address) else "-"
    )

    c.drawString(x_izq, y, f"Cliente: {safe_text(nom_cli)}")
    y -= row_h * 0.9
    c.drawString(x_izq, y, f"RUC/DNI: {doc_cli}")
    y -= row_h * 0.9
    c.drawString(x_izq, y, f"Dirección: {safe_text(dir_cli)}")
    y -= row_h * 1.5

    c.setLineWidth(0.5 * scale)
    c.line(x_izq, y, x_der, y)
    y -= row_h

    # --- COLUMNAS ---
    col_cant = x_izq
    col_desc = x_izq + (ancho_util * 0.15)
    col_pu = x_izq + (ancho_util * 0.75)
    col_tot = x_der

    c.setFont("Helvetica-Bold", get_size(7))
    c.drawString(col_cant, y, "CNT")
    c.drawString(col_desc, y, "DESCRIPCIÓN")
    c.drawRightString(col_pu, y, "P.U")
    c.drawRightString(col_tot, y, "TOTAL")
    y -= row_h

    c.setFont("Helvetica", get_size(7))
    for d in sale.details.all():
        prod_name = d.product.name[:20]
        p_unit_calc = float(d.subtotal) / float(d.quantity) if d.quantity > 0 else 0

        c.drawString(col_cant, y, f"{d.quantity:.0f}")
        c.drawString(col_desc, y, prod_name)
        c.drawRightString(col_pu, y, f"{p_unit_calc:.2f}")
        c.drawRightString(col_tot, y, f"{d.subtotal}")
        y -= row_h

    y -= row_h * 0.5
    c.line(x_izq, y, x_der, y)
    y -= row_h * 1.5

    # --- TOTALES ---
    c.setFont("Helvetica", get_size(8))
    x_lbl = x_izq + (ancho_util * 0.65)

    c.drawRightString(x_lbl, y, "OP. GRAVADA:")
    c.drawRightString(x_der, y, f"S/ {sale.total_gravada}")
    y -= row_h

    c.drawRightString(x_lbl, y, "I.G.V. (18%):")
    c.drawRightString(x_der, y, f"S/ {sale.total_igv}")
    y -= row_h * 1.5

    c.setFont("Helvetica-Bold", get_size(12))
    c.drawRightString(x_lbl, y, "TOTAL:")
    c.drawRightString(x_der, y, f"S/ {sale.total}")
    y -= row_h * 2

    # --- MONTO LETRAS ---
    try:
        entero = int(sale.total)
        decimal = int(round((sale.total - entero) * 100))
        letras = num2words(entero, lang="es").upper()
        leyenda = f"SON: {letras} CON {decimal:02d}/100 SOLES"
    except:  # noqa: E722
        leyenda = f"SON: {sale.total} SOLES"

    font_size_leyenda = get_size(8)
    if c.stringWidth(leyenda, "Helvetica-Bold", font_size_leyenda) > ancho_util:
        font_size_leyenda = get_size(6)

    c.setFont("Helvetica-Bold", font_size_leyenda)
    c.drawCentredString(x_centro, y, leyenda)
    y -= row_h * 2

    # --- PAGOS ---
    c.setFont("Helvetica-Bold", get_size(7))
    c.drawString(x_izq, y, "PAGOS:")
    y -= row_h
    c.setFont("Helvetica", get_size(7))
    for p in sale.payments.all():
        m_txt = p.payment_method
        if m_txt == "CASH":
            m_txt = "Efectivo"
        elif m_txt == "CARD":
            m_txt = "Tarjeta"
        elif m_txt == "YAPE":
            m_txt = "Yape"

        c.drawString(x_izq + (5 * mm * scale), y, f"- {m_txt}")
        c.drawRightString(x_der, y, f"S/ {p.amount}")
        y -= row_h
    y -= row_h

    # --- QR ---
    qr_data = f"20491934671|{sale.invoice_type_code}|{sale.series}|{sale.number}|{sale.total_igv}|{sale.total}|{sale.date.strftime('%d/%m/%Y')}|{sale.customer.document_type if sale.customer else '-'}|{sale.customer.tax_id if sale.customer else '-'}|"

    # Usamos la variable qr_size que definimos arriba
    qr_code = qr.QrCodeWidget(qr_data)
    qr_code.barWidth = qr_size
    qr_code.barHeight = qr_size

    bounds = qr_code.getBounds()
    w = bounds[2] - bounds[0]
    h = bounds[3] - bounds[1]
    d = Drawing(qr_size, qr_size, transform=[qr_size / w, 0, 0, qr_size / h, 0, 0])
    d.add(qr_code)

    renderPDF.draw(d, c, x_centro - (qr_size / 2), y - qr_size)
    y -= qr_size + (5 * mm * scale)

    # --- PIE ---
    c.setFont("Helvetica", get_size(6))
    c.drawCentredString(
        x_centro, y, "Representación Impresa del Comprobante Electrónico"
    )
    y -= row_h * 0.6
    c.drawCentredString(x_centro, y, "Consulte en: factura.agacorp.pe")
    y -= row_h
    c.setFont("Helvetica-Bold", get_size(7))
    c.drawCentredString(x_centro, y, "¡GRACIAS POR SU COMPRA!")

    c.showPage()
    c.save()
    return response
