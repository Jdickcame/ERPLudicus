from num2words import num2words
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


class TicketEngine:
    def __init__(self, response, width_mm=72):
        self.response = response
        self.ancho_pt = width_mm * mm
        self.scale = 1.0

        self.margin = 4 * mm
        self.x_izq = self.margin
        self.x_der = self.ancho_pt - self.margin
        self.x_cen = self.ancho_pt / 2
        self.ancho_util = self.x_der - self.x_izq

        self.row_h = 3.5 * mm

    def drawDottedLine(self, c, y):
        c.setLineWidth(0.5)
        c.setDash(1, 2)
        c.line(self.x_izq, y, self.x_der, y)
        c.setDash()

    def generate(self, doc_obj, title_lbl, items, total_label="TOTAL", is_note=False):
        sale = doc_obj.sale if is_note else doc_obj

        series_num = f"{doc_obj.series}-{doc_obj.number}"
        date_str = doc_obj.date.strftime("%d/%m/%Y %H:%M:%S")

        items_h = len(items) * (self.row_h * 2) + (self.row_h * 2)
        pagos_h = (
            (len(sale.payments.all()) * self.row_h + self.row_h) if not is_note else 0
        )
        qr_size = self.ancho_util * 0.45
        qr_h = qr_size + (15 * mm)

        base_h = 160 * mm
        alto_total = base_h + items_h + pagos_h + qr_h

        c = canvas.Canvas(self.response, pagesize=(self.ancho_pt, alto_total))
        y = alto_total - (6 * mm)

        # --- 1. CABECERA ---
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(self.x_cen, y, "GRUPO LÚDICUS")
        y -= self.row_h * 1.2
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(self.x_cen, y, "AGA CORP S.A.C.")
        y -= self.row_h
        c.setFont("Helvetica", 8)
        c.drawCentredString(self.x_cen, y, "LÚDICUS PARK")
        y -= self.row_h
        c.drawCentredString(self.x_cen, y, "RUC: 20491934671")
        y -= self.row_h
        c.drawCentredString(self.x_cen, y, "CAL.SIQUEIROS NRO. 110 URB. LA CALERA")
        y -= self.row_h * 0.8
        c.drawCentredString(self.x_cen, y, "DE LA MERCED LIMA - LIMA - SURQUILLO")
        y -= self.row_h
        c.drawCentredString(self.x_cen, y, "Telf. 943779110")
        y -= self.row_h
        c.drawCentredString(self.x_cen, y, "E-mail: gerencia@grupoludicus.com")
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- 2. DATOS DEL DOCUMENTO ---
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(self.x_cen, y, title_lbl.upper())
        y -= self.row_h * 1.2
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(self.x_cen, y, series_num)
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- 3. INFO CLIENTE ---
        c.setFont("Helvetica", 8)
        lbl_x = self.x_izq
        val_x = self.x_izq + (18 * mm)

        c.drawString(lbl_x, y, "Fecha:")
        c.drawString(val_x, y, date_str)
        y -= self.row_h

        nom_cli = sale.customer.name if sale.customer else "PUBLICO GENERAL"
        doc_cli = sale.customer.tax_id if sale.customer else "-"
        dir_cli = (
            sale.customer.address if (sale.customer and sale.customer.address) else "-"
        )

        c.drawString(lbl_x, y, "Cliente:")
        c.drawString(val_x, y, nom_cli[:35])
        y -= self.row_h
        c.drawString(lbl_x, y, "RUC/DNI:")
        c.drawString(val_x, y, doc_cli)
        y -= self.row_h
        c.drawString(lbl_x, y, "Dirección:")
        c.drawString(val_x, y, dir_cli[:35])
        y -= self.row_h

        if is_note:
            c.drawString(lbl_x, y, "Ref:")
            c.drawString(val_x, y, f"{sale.series}-{sale.number}")
            y -= self.row_h
            c.drawString(lbl_x, y, "Motivo:")
            c.drawString(val_x, y, doc_obj.description[:35])
            y -= self.row_h

        forma_pago = "CONTADO"
        if len(sale.payments.all()) > 1:
            forma_pago = "MIXTO"
        elif sale.payments.exists() and sale.payments.first().payment_method != "CASH":
            forma_pago = sale.payments.first().payment_method.replace("_", " ")

        c.drawString(lbl_x, y, "F. Pago:")
        c.drawString(val_x, y, forma_pago)
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h

        # --- 4. ÍTEMS ---
        col_cant = self.x_izq
        col_desc = self.x_izq + (10 * mm)
        col_precio = self.x_der - (12 * mm)
        col_total = self.x_der

        c.setFont("Helvetica-Bold", 7)
        c.drawString(col_cant, y, "CANT")
        c.drawString(col_desc, y, "DESCRIPCIÓN")
        c.drawRightString(col_precio, y, "PRECIO")
        c.drawRightString(col_total, y, "TOTAL")
        y -= self.row_h * 0.5

        self.drawDottedLine(c, y)
        y -= self.row_h

        c.setFont("Helvetica", 7)
        for d in items:
            p_unit = float(d.subtotal) / float(d.quantity) if d.quantity > 0 else 0
            prod_name = d.product.name

            c.drawString(col_cant, y, f"{d.quantity:.0f}")
            c.drawString(col_desc, y, prod_name[:18])
            c.drawRightString(col_precio, y, f"{p_unit:.2f}")
            c.drawRightString(col_total, y, f"{d.subtotal}")
            y -= self.row_h

            if len(prod_name) > 18:
                c.drawString(col_desc, y, prod_name[18:40])
                y -= self.row_h

        y += self.row_h * 0.5
        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- 5. TOTALES ---
        # 👇 SOLUCIÓN AL ERROR 500: Extraemos los datos de forma segura
        total_gravada = getattr(doc_obj, "total_gravada", sale.total_gravada)
        total_igv = getattr(doc_obj, "total_igv", sale.total_igv)
        total_doc = getattr(
            doc_obj, "total", sale.total
        )  # <-- ESTA LÍNEA ESTABA FALLANDO

        c.setFont("Helvetica", 8)
        lbl_tot_x = self.x_der - (20 * mm)

        c.drawRightString(lbl_tot_x, y, "Op. Gravada: S/")
        c.drawRightString(self.x_der, y, f"{total_gravada}")
        y -= self.row_h

        c.drawRightString(lbl_tot_x, y, "IGV: S/")
        c.drawRightString(self.x_der, y, f"{total_igv}")
        y -= self.row_h

        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(lbl_tot_x, y, f"{total_label}: S/")
        c.drawRightString(self.x_der, y, f"{total_doc}")
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h

        # --- 6. MONTO EN LETRAS ---
        try:
            entero = int(total_doc)
            decimal = int(round((float(total_doc) - entero) * 100))
            letras = num2words(entero, lang="es").upper()
            leyenda = f"SON: {letras} Y {decimal:02d}/100 SOLES"
        except:  # noqa: E722
            leyenda = f"SON: {total_doc} SOLES"

        c.setFont("Helvetica", 7)
        c.drawString(self.x_izq, y, leyenda)
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h

        # --- 7. PAGOS ---
        if not is_note and sale.payments.exists():
            c.setFont("Helvetica", 8)
            for p in sale.payments.all():
                m_txt = p.payment_method
                if m_txt == "CASH":
                    m_txt = "EFECTIVO"
                elif m_txt == "CARD":
                    m_txt = "TARJETA"
                elif m_txt == "YAPE":
                    m_txt = "YAPE"

                c.drawString(self.x_izq, y, f"PAGO: {m_txt}")
                c.drawRightString(self.x_der, y, f"S/ {p.amount}")
                y -= self.row_h

            self.drawDottedLine(c, y)
            y -= self.row_h * 1.5

        # --- 8. QR Y PIE DE PÁGINA ---
        c.setFont("Helvetica", 7)
        doc_type_footer = (
            "BOLETA DE VENTA" if sale.invoice_type_code == "03" else "FACTURA"
        )
        if is_note:
            doc_type_footer = "NOTA DE CRÉDITO"

        c.drawCentredString(
            self.x_cen, y, f"Representación impresa de la {doc_type_footer} electrónica"
        )
        y -= self.row_h * 2

        # Generar QR (👇 Se asegura el tipo de documento para evitar otro error 500)
        doc_code = (
            getattr(doc_obj, "note_type", "07") if is_note else sale.invoice_type_code
        )

        qr_data = f"20491934671|{doc_code}|{doc_obj.series}|{doc_obj.number}|{total_igv}|{total_doc}|{doc_obj.date.strftime('%d/%m/%Y')}|{sale.customer.document_type if sale.customer else '-'}|{sale.customer.tax_id if sale.customer else '-'}|"
        qr_code = qr.QrCodeWidget(qr_data)
        qr_code.barWidth = qr_size
        qr_code.barHeight = qr_size
        bounds = qr_code.getBounds()
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        d = Drawing(qr_size, qr_size, transform=[qr_size / w, 0, 0, qr_size / h, 0, 0])
        d.add(qr_code)
        renderPDF.draw(d, c, self.x_cen - (qr_size / 2), y - qr_size)
        y -= qr_size + 5 * mm

        c.setFont("Helvetica", 7)
        c.drawCentredString(self.x_cen, y, "Consulta tu comprobante en:")
        y -= self.row_h
        c.drawCentredString(self.x_cen, y, "facturacion.agacorp.pe")
        y -= self.row_h * 1.5
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(self.x_cen, y, "¡¡GRACIAS POR SU COMPRA!!")
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)

        c.showPage()
        c.save()

    def generate_hourly_report(self, opened_at, hourly_data):
        sorted_hours = sorted(hourly_data.items())

        # 1. Aumentamos la altura base para que no quede como un cuadrito minúsculo
        base_h = 90 * mm
        filas_h = len(sorted_hours) * (self.row_h * 1.8)  # Más espacio entre filas
        alto_total = base_h + filas_h

        c = canvas.Canvas(self.response, pagesize=(self.ancho_pt, alto_total))
        # 2. Empezamos a dibujar más abajo (12mm de margen superior en lugar de 6)
        y = alto_total - (12 * mm)

        # --- CABECERA DEL REPORTE ---
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(self.x_cen, y, "REPORTE POR HORA")
        y -= self.row_h * 1.5
        c.setFont("Helvetica", 8)
        c.drawCentredString(
            self.x_cen, y, f"Apertura: {opened_at.strftime('%d/%m/%Y %H:%M')}"
        )
        y -= self.row_h * 2

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- TÍTULOS DE COLUMNAS ---
        c.setFont("Helvetica-Bold", 7)
        c.drawString(self.x_izq, y, "HORA")
        c.drawRightString(self.x_cen + (4 * mm), y, "CANT")
        c.drawRightString(self.x_der - (15 * mm), y, "NETO")
        c.drawRightString(self.x_der, y, "BRUTO")
        y -= self.row_h * 1

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- FILAS ---
        c.setFont("Helvetica", 7)
        total_tickets = 0
        total_bruto = 0.0
        for time_label, data in sorted_hours:
            c.drawString(self.x_izq, y, time_label)
            c.drawRightString(self.x_cen + (4 * mm), y, str(data["count"]))
            c.drawRightString(self.x_der - (15 * mm), y, f"{data['net']:.2f}")
            c.drawRightString(self.x_der, y, f"{data['gross']:.2f}")

            total_tickets += data["count"]
            total_bruto += data["gross"]
            y -= self.row_h * 1.5

        y -= self.row_h * 0.2
        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- TOTALES FINALES ---
        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, y, "TOTALES:")
        c.drawRightString(self.x_cen + (4 * mm), y, str(total_tickets))
        c.drawRightString(self.x_der, y, f"S/ {total_bruto:.2f}")

        c.showPage()
        c.save()

    def generate_pmix_report(self, pmix_data):
        sorted_pmix = sorted(pmix_data.items(), key=lambda item: item[1], reverse=True)

        base_h = 80 * mm
        filas_h = len(sorted_pmix) * (self.row_h * 1.8)
        alto_total = base_h + filas_h

        c = canvas.Canvas(self.response, pagesize=(self.ancho_pt, alto_total))
        y = alto_total - (12 * mm)  # Margen superior más amplio

        # --- CABECERA ---
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(self.x_cen, y, "PRODUCT MIX (PMIX)")
        y -= self.row_h * 1.5
        c.setFont("Helvetica", 8)
        c.drawCentredString(self.x_cen, y, "Ranking de ventas del turno")
        y -= self.row_h * 2

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- TÍTULOS DE COLUMNAS ---
        c.setFont("Helvetica-Bold", 7)
        c.drawString(self.x_izq, y, "PRODUCTO")
        c.drawRightString(self.x_der, y, "CANTIDAD")
        y -= self.row_h * 1

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- FILAS ---
        c.setFont("Helvetica", 7)
        for name, qty in sorted_pmix:
            display_name = name[:25] + "..." if len(name) > 25 else name
            c.drawString(self.x_izq, y, display_name)
            c.drawRightString(self.x_der, y, f"{qty:.2f}".rstrip("0").rstrip("."))
            y -= self.row_h * 1.5

        y -= self.row_h * 0.2
        self.drawDottedLine(c, y)

        c.showPage()
        c.save()
