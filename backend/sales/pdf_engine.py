import os
import textwrap

from django.conf import settings
from django.utils import timezone
from num2words import num2words
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


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

        # Detectar si es cortesía
        is_courtesy = getattr(sale, "is_courtesy", False)
        if is_courtesy:
            title_lbl = "TICKET DE CORTESÍA"

        series_num = f"{doc_obj.series}-{doc_obj.number}"
        date_str = doc_obj.date.strftime("%d/%m/%Y %H:%M:%S")

        items_h = len(items) * (self.row_h * 3) + (self.row_h * 2)
        pagos_h = (
            (len(sale.payments.all()) * self.row_h + self.row_h) if not is_note else 0
        )

        qr_size = self.ancho_util * 0.45 if not is_courtesy else 0
        qr_h = qr_size + (15 * mm) if not is_courtesy else (20 * mm)

        base_h = 170 * mm
        alto_total = base_h + items_h + pagos_h + qr_h

        c = canvas.Canvas(self.response, pagesize=(self.ancho_pt, alto_total))
        y = alto_total - (6 * mm)

        # --- 1. CABECERA ---
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(self.x_cen, y, "GRUPO LUDICUS")
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
        c.setFont("Helvetica-Bold", 11 if is_courtesy else 9)
        c.drawCentredString(self.x_cen, y, title_lbl.upper())
        y -= self.row_h * 1.2
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(self.x_cen, y, series_num)
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- 3. INFO CLIENTE Y AUDITORÍA ---
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

        nom_lines = textwrap.wrap(nom_cli, width=24)[:2]
        for i, line in enumerate(nom_lines):
            if i == 0:
                c.drawString(lbl_x, y, "Cliente:")
            c.drawString(val_x, y, line)
            y -= self.row_h

        c.drawString(lbl_x, y, "RUC/DNI:")
        c.drawString(val_x, y, doc_cli)
        y -= self.row_h

        dir_lines = textwrap.wrap(dir_cli, width=24)[:2]
        for i, line in enumerate(dir_lines):
            if i == 0:
                c.drawString(lbl_x, y, "Dirección:")
            c.drawString(val_x, y, line)
            y -= self.row_h

        if is_courtesy and getattr(sale, "authorized_by", None):
            auth_user = sale.authorized_by
            auth_name = (
                f"{auth_user.first_name} {auth_user.last_name}".strip()
                or auth_user.username
            )
            c.setFont("Helvetica-Bold", 8)
            c.drawString(lbl_x, y, "Autorizado:")
            c.drawString(val_x, y, auth_name[:24])
            c.setFont("Helvetica", 8)
            y -= self.row_h

        if is_note:
            c.drawString(lbl_x, y, "Ref:")
            c.drawString(val_x, y, f"{sale.series}-{sale.number}")
            y -= self.row_h
            c.drawString(lbl_x, y, "Motivo:")
            c.drawString(val_x, y, doc_obj.description[:24])
            y -= self.row_h

        if getattr(sale, "notes", None):
            c.setFont("Helvetica-Bold", 9)
            c.drawString(lbl_x, y, "NOTA:")
            c.drawString(val_x, y, sale.notes[:24])
            y -= self.row_h
            c.setFont("Helvetica", 8)

        forma_pago = "CORTESÍA" if is_courtesy else "CONTADO"
        if not is_courtesy:
            if len(sale.payments.all()) > 1:
                forma_pago = "MIXTO"
            elif (
                sale.payments.exists()
                and sale.payments.first().payment_method != "CASH"
            ):
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
        valor_real_regalos = 0
        for d in items:
            p_unit = float(d.subtotal) / float(d.quantity) if d.quantity > 0 else 0
            prod_name = d.product.name
            valor_real_regalos += float(d.subtotal)

            prod_lines = textwrap.wrap(prod_name, width=18)[:2]

            c.drawString(col_cant, y, f"{d.quantity:.0f}")
            c.drawString(col_desc, y, prod_lines[0])
            c.drawRightString(col_precio, y, f"{p_unit:.2f}")
            c.drawRightString(col_total, y, f"{d.subtotal}")
            y -= self.row_h

            if len(prod_lines) > 1:
                c.drawString(col_desc, y, prod_lines[1])
                y -= self.row_h

        y += self.row_h * 0.5
        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- 5. TOTALES ---
        total_gravada = getattr(doc_obj, "total_gravada", sale.total_gravada)
        total_igv = getattr(doc_obj, "total_igv", sale.total_igv)
        total_doc = getattr(doc_obj, "total", sale.total)

        descuento_global = getattr(
            doc_obj, "discount_amount", getattr(sale, "discount_amount", 0.0)
        )
        descuento_global = float(descuento_global) if descuento_global else 0.0

        c.setFont("Helvetica", 8)
        lbl_tot_x = self.x_der - (20 * mm)

        if is_courtesy:
            c.drawRightString(lbl_tot_x, y, "Valor Real: S/")
            c.drawRightString(self.x_der, y, f"{valor_real_regalos:.2f}")
            y -= self.row_h
            c.drawRightString(lbl_tot_x, y, "Dscto. Autorizado: S/")
            c.drawRightString(self.x_der, y, f"-{valor_real_regalos:.2f}")
            y -= self.row_h
        else:
            if descuento_global > 0:
                subtotal_bruto = float(total_doc) + descuento_global
                c.drawRightString(lbl_tot_x, y, "Subtotal Bruto: S/")
                c.drawRightString(self.x_der, y, f"{subtotal_bruto:.2f}")
                y -= self.row_h
                c.drawRightString(lbl_tot_x, y, "Dscto. Global: S/")
                c.drawRightString(self.x_der, y, f"-{descuento_global:.2f}")
                y -= self.row_h

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
        leyenda_lines = textwrap.wrap(leyenda, width=40)[:2]
        for line in leyenda_lines:
            c.drawString(self.x_izq, y, line)
            y -= self.row_h * 1.2
        y -= self.row_h * 0.3

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
                elif m_txt == "COURTESY":
                    m_txt = "CORTESÍA APROBADA"

                c.drawString(self.x_izq, y, f"PAGO: {m_txt}")
                c.drawRightString(self.x_der, y, f"S/ {p.amount}")
                y -= self.row_h

            self.drawDottedLine(c, y)
            y -= self.row_h * 1.5

        # --- 8. QR Y PIE DE PÁGINA ---
        if not is_courtesy:
            c.setFont("Helvetica", 7)
            doc_type_footer = (
                "BOLETA DE VENTA" if sale.invoice_type_code == "03" else "FACTURA"
            )
            if is_note:
                doc_type_footer = "NOTA DE CRÉDITO"

            c.drawCentredString(
                self.x_cen,
                y,
                f"Representación impresa de la {doc_type_footer} electrónica",
            )
            y -= self.row_h * 2

            # Generar QR Oficial
            doc_code = (
                getattr(doc_obj, "note_type", "07")
                if is_note
                else sale.invoice_type_code
            )

            # 1. Preparar datos exactos para SUNAT
            fecha_qr = doc_obj.date.strftime("%Y-%m-%d")

            if sale.customer:
                tipo_doc_cli = "6" if len(sale.customer.tax_id) == 11 else "1"
                num_doc_cli = sale.customer.tax_id
            else:
                tipo_doc_cli = "0"
                num_doc_cli = "00000000"

            # 2. Obtener el Hash de BD
            hash_sunat = getattr(sale, "sunat_hash", "") or ""

            # 3. Armar la cadena oficial
            qr_data = f"20491934671|{doc_code}|{doc_obj.series}|{doc_obj.number}|{total_igv}|{total_doc}|{fecha_qr}|{tipo_doc_cli}|{num_doc_cli}|{hash_sunat}|"

            qr_code = qr.QrCodeWidget(qr_data)
            qr_code.barWidth = qr_size
            qr_code.barHeight = qr_size
            bounds = qr_code.getBounds()
            w = bounds[2] - bounds[0]
            h = bounds[3] - bounds[1]
            d = Drawing(
                qr_size, qr_size, transform=[qr_size / w, 0, 0, qr_size / h, 0, 0]
            )
            d.add(qr_code)
            renderPDF.draw(d, c, self.x_cen - (qr_size / 2), y - qr_size)
            y -= qr_size + 5 * mm

            c.setFont("Helvetica", 7)
            c.drawCentredString(self.x_cen, y, "Consulta tu comprobante en el")
            y -= self.row_h
            c.drawCentredString(self.x_cen, y, "portal de la SUNAT")
            y -= self.row_h * 1.5

        else:
            c.setFont("Helvetica-Bold", 10)
            c.drawCentredString(self.x_cen, y, "*** NO VÁLIDO PARA SUNAT ***")
            y -= self.row_h * 1.5
            c.setFont("Helvetica", 8)
            c.drawCentredString(self.x_cen, y, "Uso exclusivo de Control Interno")
            y -= self.row_h
            c.drawCentredString(self.x_cen, y, "Sin derecho a crédito fiscal")
            y -= self.row_h * 1.5

        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(
            self.x_cen,
            y,
            "¡¡GRACIAS POR SU COMPRA!!" if not is_courtesy else "LÚDICUS PARK",
        )
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)

        c.showPage()
        c.save()

    def generate_hourly_report(self, opened_at, hourly_data):
        sorted_hours = sorted(hourly_data.items())
        base_h = 90 * mm
        filas_h = len(sorted_hours) * (self.row_h * 1.8)
        alto_total = base_h + filas_h

        c = canvas.Canvas(self.response, pagesize=(self.ancho_pt, alto_total))
        y = alto_total - (12 * mm)

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

        c.setFont("Helvetica-Bold", 7)
        c.drawString(self.x_izq, y, "HORA")
        c.drawRightString(self.x_cen + (4 * mm), y, "CANT")
        c.drawRightString(self.x_der - (15 * mm), y, "NETO")
        c.drawRightString(self.x_der, y, "BRUTO")
        y -= self.row_h * 1

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

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
        y = alto_total - (12 * mm)

        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(self.x_cen, y, "PRODUCT MIX (PMIX)")
        y -= self.row_h * 1.5
        c.setFont("Helvetica", 8)
        c.drawCentredString(self.x_cen, y, "Ranking de ventas del turno")
        y -= self.row_h * 2

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        c.setFont("Helvetica-Bold", 7)
        c.drawString(self.x_izq, y, "PRODUCTO")
        c.drawRightString(self.x_der, y, "CANTIDAD")
        y -= self.row_h * 1

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

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

    def generate_courtesies_report(self, courtesy_pmix, total_costo, opened_at):
        sorted_pmix = sorted(
            courtesy_pmix.items(), key=lambda item: item[1], reverse=True
        )
        base_h = 90 * mm
        filas_h = len(sorted_pmix) * (self.row_h * 1.8)
        alto_total = base_h + filas_h

        c = canvas.Canvas(self.response, pagesize=(self.ancho_pt, alto_total))
        y = alto_total - (12 * mm)

        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(self.x_cen, y, "REPORTE DE CORTESIAS")
        y -= self.row_h * 1.2
        c.setFont("Helvetica", 8)
        c.drawCentredString(self.x_cen, y, "Productos Regalados/Consumo")
        y -= self.row_h * 1.5

        c.setFont("Helvetica", 7)
        c.drawCentredString(
            self.x_cen, y, f"Apertura: {opened_at.strftime('%d/%m/%Y %H:%M')}"
        )
        y -= self.row_h * 2

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        c.setFont("Helvetica-Bold", 7)
        c.drawString(self.x_izq, y, "PRODUCTO")
        c.drawRightString(self.x_der, y, "CANTIDAD")
        y -= self.row_h * 1

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        c.setFont("Helvetica", 7)
        for name, qty in sorted_pmix:
            display_name = name[:25] + "..." if len(name) > 25 else name
            c.drawString(self.x_izq, y, display_name)
            c.drawRightString(self.x_der, y, f"{qty:.2f}".rstrip("0").rstrip("."))
            y -= self.row_h * 1.5

        y -= self.row_h * 0.2
        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, y, "VALOR TOTAL ASUMIDO:")
        c.drawRightString(self.x_der, y, f"S/ {total_costo:.2f}")

        c.showPage()
        c.save()

    def generate_z_report(self, shift, shift_data):
        is_open = shift.status == "OPEN"
        base_h = 90 * mm if is_open else 110 * mm
        alto_total = base_h

        c = canvas.Canvas(self.response, pagesize=(self.ancho_pt, alto_total))
        y = alto_total - (8 * mm)

        c.setFont("Helvetica-Bold", 10)
        title = "LECTURA X (PARCIAL)" if is_open else "REPORTE DE CIERRE Z"
        c.drawCentredString(self.x_cen, y, title)

        y -= self.row_h * 1.5
        c.setFont("Helvetica", 8)
        c.drawCentredString(self.x_cen, y, f"Turno Nro: {shift.id}")
        y -= self.row_h
        c.drawCentredString(
            self.x_cen,
            y,
            f"Caja: {shift.cash_register.name if getattr(shift, 'cash_register', None) else 'General'}",
        )
        y -= self.row_h * 2

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, y, "Cajero:")
        c.setFont("Helvetica", 8)
        c.drawString(
            self.x_izq + (15 * mm),
            y,
            f"{shift.user.get_full_name() or shift.user.username}",
        )
        y -= self.row_h

        def format_date(dt):
            if not dt:
                return "En curso"
            if timezone.is_aware(dt):
                dt = timezone.localtime(dt)
            return dt.strftime("%d/%m/%Y %H:%M")

        opened = format_date(shift.opened_at)
        closed = format_date(shift.closed_at)

        c.drawString(self.x_izq, y, f"Apertura: {opened}")
        y -= self.row_h
        c.drawString(self.x_izq, y, f"Cierre: {closed}")
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- SECCIÓN 1: VALORES SEGÚN SISTEMA ---
        fondo_inicial = float(shift.initial_balance)
        expected_cash_crudo = float(shift_data.get("expected_cash", 0))
        # Extraemos el fondo inicial para mostrar solo las ventas en efectivo
        expected_cash_ventas = expected_cash_crudo - fondo_inicial

        expected_card = float(shift_data.get("expected_card", 0))
        expected_transfer = float(shift_data.get("expected_transfer", 0))
        expected_pago_link = float(shift_data.get("expected_pago_link", 0))

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, y, "VALORES SEGÚN SISTEMA:")
        y -= self.row_h * 1.5
        c.setFont("Helvetica", 8)

        c.drawString(self.x_izq, y, "Fondo Inicial:")
        c.drawRightString(self.x_der, y, f"S/ {fondo_inicial:.2f}")
        y -= self.row_h
        c.drawString(self.x_izq, y, "Efectivo (Ventas):")
        c.drawRightString(self.x_der, y, f"S/ {expected_cash_ventas:.2f}")
        y -= self.row_h
        c.drawString(self.x_izq, y, "Tarjetas/Visas:")
        c.drawRightString(self.x_der, y, f"S/ {expected_card:.2f}")
        y -= self.row_h
        c.drawString(self.x_izq, y, "Transferencias:")
        c.drawRightString(self.x_der, y, f"S/ {expected_transfer:.2f}")
        y -= self.row_h
        c.drawString(self.x_izq, y, "Pago Link:")
        c.drawRightString(self.x_der, y, f"S/ {expected_pago_link:.2f}")
        y -= self.row_h * 1.5

        total_esperado_sin_base = (
            expected_cash_ventas
            + expected_card
            + expected_transfer
            + expected_pago_link
        )
        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, y, "TOTAL ESPERADO:")
        c.drawRightString(self.x_der, y, f"S/ {total_esperado_sin_base:.2f}")
        y -= self.row_h * 1.5

        self.drawDottedLine(c, y)
        y -= self.row_h * 1.5

        # --- SECCIÓN 2: DECLARACIÓN DEL CAJERO ---
        if not is_open:
            c.setFont("Helvetica-Bold", 8)
            c.drawString(self.x_izq, y, "DECLARACIÓN DEL CAJERO:")
            y -= self.row_h * 1.5
            c.setFont("Helvetica", 8)

            # Extraemos el fondo inicial artificial que el frontend envió
            declarado_bruto = float(shift.final_balance_real or 0)
            total_declarado_sin_base = declarado_bruto - fondo_inicial

            c.drawString(self.x_izq, y, "Total Declarado:")
            c.drawRightString(self.x_der, y, f"S/ {total_declarado_sin_base:.2f}")
            y -= self.row_h * 1.5

            diferencia = total_declarado_sin_base - total_esperado_sin_base

            c.setFont("Helvetica-Bold", 8)
            if abs(diferencia) < 0.1:
                c.drawString(self.x_izq, y, "Diferencia:")
                c.drawRightString(self.x_der, y, "CUADRE PERFECTO")
            elif diferencia > 0:
                c.drawString(self.x_izq, y, "SOBRANTE EN CAJA:")
                c.drawRightString(self.x_der, y, f"+ S/ {abs(diferencia):.2f}")
            else:
                c.drawString(self.x_izq, y, "FALTANTE EN CAJA:")
                c.drawRightString(self.x_der, y, f"- S/ {abs(diferencia):.2f}")

            y -= self.row_h * 3
        else:
            y -= self.row_h * 2

        c.line(self.x_cen - (20 * mm), y, self.x_cen + (20 * mm), y)
        y -= self.row_h * 1.2
        c.setFont("Helvetica", 7)
        c.drawCentredString(
            self.x_cen, y, "Firma del Cajero" if not is_open else "Revisión de Arqueo"
        )

        c.showPage()
        c.save()


class A4Engine:
    def __init__(self, response):
        self.response = response
        self.width, self.height = A4
        self.margin = 15 * mm

        self.x_izq = self.margin
        self.x_der = self.width - self.margin
        self.x_cen = self.width / 2

        self.row_h = 5 * mm

    def draw_header(self, c, doc_obj, title_lbl, is_courtesy):
        y = self.height - self.margin

        logo_path = os.path.join(settings.BASE_DIR, "static", "logo.png")
        text_x = self.x_izq

        if os.path.exists(logo_path):
            logo_w = 35 * mm
            logo_h = 20 * mm
            c.drawImage(
                logo_path,
                self.x_izq,
                y - logo_h + (3 * mm),
                width=logo_w,
                height=logo_h,
                preserveAspectRatio=True,
                mask="auto",
            )
            text_x = self.x_izq + logo_w + (5 * mm)
        else:
            c.setFont("Helvetica-Bold", 16)
            c.drawString(text_x, y, "GRUPO LÚDICUS")
            y -= self.row_h * 1.2

        c.setFont("Helvetica-Bold", 10)
        c.drawString(text_x, y, "AGA CORP S.A.C.")
        y -= self.row_h

        c.setFont("Helvetica", 7)

        # CAJITA DE DIRECCIÓN LIMITADA A 40 CARACTERES
        direccion = "CAL. SIQUEIROS NRO. 110 URB. LA CALERA DE LA MERCED - LIMA - LIMA - SURQUILLO"
        dir_lines = textwrap.wrap(direccion, width=40)
        for line in dir_lines:
            c.drawString(text_x, y, line)
            y -= self.row_h

        c.drawString(text_x, y, "Telf: 943779110 | Email: gerencia@grupoludicus.com")

        final_y = y - (10 * mm)

        box_width = 70 * mm
        box_height = 25 * mm
        box_x = self.x_der - box_width
        box_y = self.height - self.margin - box_height

        c.setLineWidth(1)
        c.setStrokeColor(colors.black)
        c.roundRect(box_x, box_y, box_width, box_height, 3, stroke=1, fill=0)

        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(
            box_x + (box_width / 2), box_y + box_height - (7 * mm), "R.U.C. 20491934671"
        )
        c.line(
            box_x,
            box_y + box_height - (10 * mm),
            box_x + box_width,
            box_y + box_height - (10 * mm),
        )

        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(
            box_x + (box_width / 2), box_y + box_height - (17 * mm), title_lbl.upper()
        )
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(
            box_x + (box_width / 2),
            box_y + (3 * mm),
            f"{doc_obj.series}-{doc_obj.number}",
        )

        return final_y

    def generate(self, doc_obj, title_lbl, items, total_label="TOTAL", is_note=False):
        sale = doc_obj.sale if is_note else doc_obj

        is_courtesy = getattr(sale, "is_courtesy", False)
        if is_courtesy:
            title_lbl = "TICKET DE CORTESÍA"

        c = canvas.Canvas(self.response, pagesize=A4)

        y = self.draw_header(c, doc_obj, title_lbl, is_courtesy)

        y -= 5 * mm

        c.setLineWidth(0.5)
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.roundRect(
            self.x_izq,
            y - (20 * mm),
            self.width - (self.margin * 2),
            20 * mm,
            4,
            stroke=1,
            fill=0,
        )
        c.setStrokeColor(colors.black)

        c.setFont("Helvetica-Bold", 8)
        y -= 3 * mm

        date_str = doc_obj.date.strftime("%d/%m/%Y")
        time_str = doc_obj.date.strftime("%H:%M:%S")

        nom_cli = sale.customer.name if sale.customer else "PÚBLICO GENERAL"
        nom_cli = nom_cli[:48] + "..." if len(nom_cli) > 48 else nom_cli

        doc_cli = sale.customer.tax_id if sale.customer else "-"

        dir_cli = (
            sale.customer.address if (sale.customer and sale.customer.address) else "-"
        )
        dir_cli = dir_cli[:48] + "..." if len(dir_cli) > 48 else dir_cli

        c.drawString(self.x_izq + 5 * mm, y, "CLIENTE:")
        c.setFont("Helvetica", 8)
        c.drawString(self.x_izq + 25 * mm, y, nom_cli)

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_cen + 20 * mm, y, "FECHA EMISIÓN:")
        c.setFont("Helvetica", 8)
        c.drawString(self.x_cen + 50 * mm, y, date_str)
        y -= self.row_h

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq + 5 * mm, y, "RUC / DNI:")
        c.setFont("Helvetica", 8)
        c.drawString(self.x_izq + 25 * mm, y, doc_cli)

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_cen + 20 * mm, y, "HORA EMISIÓN:")
        c.setFont("Helvetica", 8)
        c.drawString(self.x_cen + 50 * mm, y, time_str)
        y -= self.row_h

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq + 5 * mm, y, "DIRECCIÓN:")
        c.setFont("Helvetica", 8)
        c.drawString(self.x_izq + 25 * mm, y, dir_cli)

        forma_pago = "CORTESÍA" if is_courtesy else "CONTADO"
        if not is_courtesy and sale.payments.exists():
            if len(sale.payments.all()) > 1:
                forma_pago = "MIXTO"
            else:
                forma_pago = sale.payments.first().payment_method.replace("_", " ")

        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_cen + 20 * mm, y, "FORMA DE PAGO:")
        c.setFont("Helvetica", 8)
        c.drawString(self.x_cen + 50 * mm, y, forma_pago)

        y -= 10 * mm

        styles = getSampleStyleSheet()
        style_table_text = styles["Normal"]
        style_table_text.fontSize = 8
        style_table_text.leading = 10

        data = [["CANTIDAD", "CÓDIGO", "DESCRIPCIÓN", "V. UNITARIO", "TOTAL"]]

        for d in items:
            p_unit = float(d.subtotal) / float(d.quantity) if d.quantity > 0 else 0
            code = (
                d.product.sku
                if getattr(d.product, "sku", None)
                else f"{d.product.id:04d}"
            )

            prod_name_paragraph = Paragraph(d.product.name, style_table_text)

            data.append(
                [
                    f"{d.quantity:.2f}",
                    code,
                    prod_name_paragraph,
                    f"S/ {p_unit:.2f}",
                    f"S/ {d.subtotal}",
                ]
            )

        t = Table(data, colWidths=[25 * mm, 30 * mm, 85 * mm, 20 * mm, 20 * mm])
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    ("ALIGN", (0, 1), (0, -1), "CENTER"),
                    ("ALIGN", (1, 1), (1, -1), "CENTER"),
                    ("ALIGN", (2, 1), (2, -1), "LEFT"),
                    ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )

        w, h = t.wrap(self.width, self.height)
        y -= h
        t.drawOn(c, self.x_izq, y)

        y -= 8 * mm  # Espacio debajo de la tabla

        total_gravada = getattr(doc_obj, "total_gravada", sale.total_gravada)
        total_igv = getattr(doc_obj, "total_igv", sale.total_igv)
        total_doc = getattr(doc_obj, "total", sale.total)

        descuento_global = getattr(
            doc_obj, "discount_amount", getattr(sale, "discount_amount", 0.0)
        )
        descuento_global = float(descuento_global) if descuento_global else 0.0

        try:
            entero = int(total_doc)
            decimal = int(round((float(total_doc) - entero) * 100))
            letras = num2words(entero, lang="es").upper()
            leyenda = f"SON: {letras} Y {decimal:02d}/100 SOLES"
        except:  # noqa: E722
            leyenda = f"SON: {total_doc} SOLES"

        # 1. Dibujamos la leyenda (Monto en letras)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, y, leyenda)

        # 2. Dibujamos Información Adicional (Estilo APISPERU) debajo de la leyenda
        info_y = y - 10 * mm
        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, info_y, "Información Adicional")

        # Línea separadora sutil
        c.setLineWidth(0.5)
        c.line(self.x_izq, info_y - (2 * mm), self.x_cen - (20 * mm), info_y - (2 * mm))

        info_y -= 6 * mm
        c.setFont("Helvetica-Bold", 8)
        c.drawString(self.x_izq, info_y, "Forma de Pago:")
        c.setFont("Helvetica", 8)
        c.drawString(self.x_izq + 25 * mm, info_y, forma_pago)

        # 3. Dibujamos la Tabla de Totales (Alineada a la derecha)
        totales_data = []

        if descuento_global > 0:
            subtotal_bruto = float(total_doc) + descuento_global
            totales_data.append(["SUBTOTAL BRUTO", f"S/ {subtotal_bruto:.2f}"])
            totales_data.append(["DSCTO. GLOBAL", f"- S/ {descuento_global:.2f}"])

        totales_data.extend(
            [
                ["OP. GRAVADA", f"S/ {total_gravada}"],
                ["I.G.V. (18%)", f"S/ {total_igv}"],
                ["TOTAL A PAGAR", f"S/ {total_doc}"],
            ]
        )

        t_tot = Table(totales_data, colWidths=[35 * mm, 25 * mm])
        t_tot.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ]
            )
        )

        w_tot, h_tot = t_tot.wrap(self.width, self.height)
        # La tabla de totales se dibuja usando 'y', por lo que queda paralela a la leyenda
        t_tot.drawOn(c, self.x_der - 60 * mm, y - h_tot + (3 * mm))

        # --- PIE DE PÁGINA DINÁMICO (Estilo Apisperu) ---
        y_footer = info_y - (15 * mm)  # Se ajusta automáticamente al contenido superior

        if not is_courtesy:
            qr_size = 22 * mm
            doc_code = (
                getattr(doc_obj, "note_type", "07")
                if is_note
                else sale.invoice_type_code
            )
            fecha_qr = doc_obj.date.strftime("%Y-%m-%d")

            if sale.customer:
                tipo_doc_cli = "6" if len(sale.customer.tax_id) == 11 else "1"
                num_doc_cli = sale.customer.tax_id
            else:
                tipo_doc_cli = "0"
                num_doc_cli = "00000000"

            hash_sunat = getattr(sale, "sunat_hash", "") or ""

            qr_data = f"20491934671|{doc_code}|{doc_obj.series}|{doc_obj.number}|{total_igv}|{total_doc}|{fecha_qr}|{tipo_doc_cli}|{num_doc_cli}|{hash_sunat}|"

            qr_code = qr.QrCodeWidget(qr_data)
            qr_code.barWidth = qr_size
            qr_code.barHeight = qr_size
            bounds = qr_code.getBounds()
            w = bounds[2] - bounds[0]
            h = bounds[3] - bounds[1]
            d = Drawing(
                qr_size, qr_size, transform=[qr_size / w, 0, 0, qr_size / h, 0, 0]
            )
            d.add(qr_code)

            # Dibujamos QR a la derecha
            qr_x = self.x_der - qr_size
            qr_y = y_footer - qr_size
            renderPDF.draw(d, c, qr_x, qr_y)

            # Dibujamos cajita de texto a la izquierda
            box_x = self.x_izq
            box_y = qr_y + (2 * mm)
            box_w = self.x_der - qr_size - (10 * mm) - self.x_izq
            box_h = qr_size - (4 * mm)

            c.setLineWidth(0.5)
            c.setStrokeColor(colors.HexColor("#a1a1aa"))
            c.rect(box_x, box_y, box_w, box_h, stroke=1, fill=0)
            c.setStrokeColor(colors.black)

            c.setFont("Helvetica", 7.5)
            doc_type_footer = (
                "BOLETA DE VENTA" if sale.invoice_type_code == "03" else "FACTURA"
            )
            if is_note:
                doc_type_footer = "NOTA DE CRÉDITO"

            text_y_center = box_y + (box_h / 2)
            c.drawString(
                box_x + 3 * mm,
                text_y_center + 1.5 * mm,
                f"Representación impresa de la {doc_type_footer} ELECTRÓNICA. El usuario puede consultar su validez",
            )
            c.drawString(
                box_x + 3 * mm,
                text_y_center - 2.5 * mm,
                "en SUNAT Virtual: www.sunat.gob.pe, en Operaciones sin Clave SOL / Consulta de validez del CPE.",
            )

        else:
            c.setFont("Helvetica-Bold", 12)
            c.drawCentredString(
                self.x_cen, y_footer, "*** NO VÁLIDO PARA SUNAT - USO INTERNO ***"
            )

        c.showPage()
        c.save()
