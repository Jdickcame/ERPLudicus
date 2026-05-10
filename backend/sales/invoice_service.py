import requests
from django.conf import settings
from num2words import num2words  # Recuerda: pip install num2words

# Credenciales desde settings (.env)
API_URL = settings.APISPERU_URL
API_TOKEN = settings.APISPERU_TOKEN


class InvoiceService:
    def __init__(self, sale):
        self.sale = sale
        self.branch = sale.branch
        self.customer = sale.customer

    def generar_comprobante(self):
        print(
            f"🚀 Iniciando facturación para Venta {self.sale.series}-{self.sale.number}"
        )

        # 1. Definir Tipo Documento
        # 01 = Factura, 03 = Boleta
        tipo_doc = "01" if self.sale.invoice_type_code == "01" else "03"

        # 2. Datos del Cliente
        if self.customer:
            client_num = self.customer.tax_id
            client_name = self.customer.name

            # Determinar tipo de documento según largo
            if len(client_num) == 11:
                client_type = "6"  # RUC
            elif len(client_num) == 8:
                client_type = "1"  # DNI
            else:
                client_type = "0"  # Otros

            client_address = self.customer.address if self.customer.address else "-"
        else:
            # Cliente Genérico (Público General)
            client_num = "00000000"
            client_name = "PUBLICO GENERAL"
            client_type = "0"
            client_address = "-"

        # 3. Cálculos Matemáticos para el JSON
        total_venta = float(self.sale.total)  # Ej: 118.00
        total_gravada = 0.0
        total_igv = 0.0

        items_payload = []
        for detail in self.sale.details.all():
            # TUS PRECIOS EN DB INCLUYEN IGV (Ej: Precio Final S/ 59.00)
            precio_final_unitario = float(detail.price)  # 59.00
            cantidad = float(detail.quantity)  # 2

            # Valor Unitario (Sin IGV) -> 59 / 1.18 = 50.00
            valor_unitario = precio_final_unitario / 1.18

            # Valor Venta del Item (Subtotal Sin IGV) -> 50 * 2 = 100.00
            valor_venta_item = valor_unitario * cantidad

            # IGV del Item -> 100 * 0.18 = 18.00
            igv_item = valor_venta_item * 0.18

            # Acumulamos para la cabecera
            total_gravada += valor_venta_item
            total_igv += igv_item

            items_payload.append(
                {
                    "codProducto": str(detail.product.id),
                    "unidad": "NIU",  # NIU = Unidades
                    "descripcion": detail.product.name,
                    "cantidad": cantidad,
                    # Desglose según tu documentación:
                    "mtoValorUnitario": round(valor_unitario, 2),  # 50.00
                    "mtoValorVenta": round(valor_venta_item, 2),  # 100.00
                    "mtoBaseIgv": round(valor_venta_item, 2),  # 100.00
                    "porcentajeIgv": 18,
                    "igv": round(igv_item, 2),  # 18.00
                    "tipAfeIgv": "10",  # 10 = Gravado - Operación Onerosa
                    "totalImpuestos": round(igv_item, 2),
                    "mtoPrecioUnitario": round(precio_final_unitario, 2),  # 59.00
                }
            )

        # 4. Generar Leyenda (Monto en Letras)
        # Ej: "SON CIENTO DIECIOCHO CON 00/100 SOLES"
        mto_entero = int(total_venta)
        mto_decimal = int(round((total_venta - mto_entero) * 100))
        try:
            texto_monto = num2words(mto_entero, lang="es").upper()
        except:  # noqa: E722
            texto_monto = "CERO"

        leyenda_valor = f"SON {texto_monto} CON {mto_decimal:02d}/100 SOLES"

        # 5. CONSTRUCCIÓN DEL JSON FINAL (Estructura ApisPeru Exacta)
        payload = {
            "ublVersion": "2.1",
            "tipoOperacion": "0101",  # Venta Interna
            "tipoDoc": tipo_doc,
            "serie": self.sale.series,
            "correlativo": self.sale.number,
            "fechaEmision": self.sale.date.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
            "formaPago": {"moneda": "PEN", "tipo": "Contado"},
            "tipoMoneda": "PEN",
            "client": {
                "tipoDoc": client_type,
                "numDoc": client_num,  # ApisPeru acepta string, mejor para evitar que borre ceros
                "rznSocial": client_name,
                "address": {
                    "direccion": client_address,
                    "ubigueo": "150101",
                    "departamento": "LIMA",
                    "provincia": "LIMA",
                    "distrito": "LIMA",
                },
            },
            "company": {
                "ruc": 20491934671,  # TU RUC
                "razonSocial": "AGA CORP S.A.C.",
                "nombreComercial": "AGA CORP",
                "address": {
                    "direccion": "CAL. SIQUEIROS NRO. 110 URB. LA CALERA",
                    "ubigueo": "150101",
                    "departamento": "LIMA",
                    "provincia": "LIMA",
                    "distrito": "SURQUILLO",
                },
            },
            # TOTALES CABECERA (Según tu documentación)
            "mtoOperGravadas": round(total_gravada, 2),
            "mtoIGV": round(total_igv, 2),
            "totalImpuestos": round(total_igv, 2),
            "valorVenta": round(total_gravada, 2),
            # Totales Finales
            "subTotal": round(total_venta, 2),  # Valor Venta + Impuestos
            "mtoImpVenta": round(total_venta, 2),  # Importe Total a Pagar
            "details": items_payload,
            "legends": [{"code": "1000", "value": leyenda_valor}],
        }

        # 6. ENVIAR A APISPERU
        headers = {
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        }

        try:
            # Enviamos a /invoice/send
            response = requests.post(
                f"{API_URL}/invoice/send", json=payload, headers=headers
            )
            result = response.json()

            # Log para debug
            print(f"📦 Respuesta ApisPeru: {result}")

            if response.status_code == 200:
                print("✅ Facturación Exitosa en ApisPeru")
                self.sale.sunat_status = "ACCEPTED"

                # 1. XML
                xml_val = result.get("xml")
                if isinstance(xml_val, str):
                    self.sale.sunat_xml_url = xml_val
                elif isinstance(xml_val, dict):
                    self.sale.sunat_xml_url = xml_val.get("url")

                # 2. CDR
                cdr_val = result.get("cdr")
                if isinstance(cdr_val, str):
                    self.sale.sunat_cdr_url = cdr_val
                elif isinstance(cdr_val, dict):
                    self.sale.sunat_cdr_url = cdr_val.get("url")

                # 3. PDF (AQUÍ ESTÁ LA MAGIA 🪄)
                # Intentamos leerlo de la respuesta
                pdf_val = result.get("pdf")
                pdf_url = None

                if isinstance(pdf_val, dict):
                    pdf_url = (
                        pdf_val.get("url_ticket")
                        or pdf_val.get("url_a4")
                        or pdf_val.get("url")
                    )
                elif isinstance(pdf_val, str):
                    pdf_url = pdf_val

                # SI LA API NO LO DEVUELVE, LO CONSTRUIMOS (Formato Estándar de ApisPeru)
                if not pdf_url:
                    pdf_url = (
                        f"{API_URL}/invoice/pdf?"
                        f"ruc=20491934671&serie={self.sale.series}&"
                        f"correlativo={self.sale.number}&tipo={tipo_doc}&"
                        f"format=ticket"
                        # YA NO AGREGUES EL TOKEN AQUÍ
                    )
                self.sale.sunat_pdf_url = pdf_url
                print(f"🖨️ PDF Generado: {self.sale.sunat_pdf_url}")

                self.sale.save()
                return {"success": True, "data": result}
            else:
                print(f"❌ Error ApisPeru: {result}")
                self.sale.sunat_status = "REJECTED"
                self.sale.sunat_description = result.get("message", "Error desconocido")
                self.sale.save()
                return {"success": False, "error": result}

        except Exception as e:
            print(f"❌ Error de Conexión: {e}")
            return {"success": False, "error": str(e)}

    def enviar_nota(self, note):
        sale = note.sale

        # Mapeo de campos según tu JSON de ejemplo
        data = {
            "ublVersion": "2.1",
            "tipoDoc": note.note_type,  # 07 (Crédito) o 08 (Débito)
            "serie": note.series,
            "correlativo": note.number,
            "fechaEmision": note.date.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
            # Datos de referencia (A quién anula)
            "tipDocAfectado": sale.invoice_type_code,  # 01 (Factura) o 03 (Boleta)
            "numDocfectado": f"{sale.series}-{sale.number}",  # Según tu JSON es "numDocfectado" (sic)
            "codMotivo": note.reason_code,
            "desMotivo": note.description,
            "tipoMoneda": "PEN",
            # Cliente (Igual que la venta original)
            "client": {
                "tipoDoc": sale.customer.document_type
                if sale.customer
                else "0",  # 0 = Sin Doc (Varios)
                "numDoc": sale.customer.tax_id if sale.customer else "00000000",
                "rznSocial": sale.customer.name if sale.customer else "PUBLICO GENERAL",
                "address": {
                    "direccion": sale.customer.address if sale.customer else "-"
                },
            },
            # Empresa (ApisPeru suele jalar esto del token, pero lo mandamos por si acaso)
            "company": {
                "ruc": "20491934671",
                "razonSocial": "AGA CORP S.A.C.",
                "address": {"direccion": "Cal. Siqueiros Nro 110 - Surquillo"},
            },
            # Montos (Si es anulación total, copiamos los de la venta)
            "mtoOperGravadas": float(sale.total_gravada),
            "mtoIGV": float(sale.total_igv),
            "totalImpuestos": float(sale.total_igv),
            "mtoImpVenta": float(sale.total),
            "details": [],
            "legends": [
                {
                    "code": "1000",
                    "value": f"SON: {self._number_to_words(sale.total)}",  # Usamos un helper o texto fijo
                }
            ],
        }

        # Detalles
        for detail in sale.details.all():
            # Cálculos unitarios inversos
            precio_unitario = float(detail.subtotal) / float(
                detail.quantity
            )  # Incluye IGV
            valor_unitario = precio_unitario / 1.18  # Sin IGV
            igv_item = float(detail.subtotal) - (float(detail.subtotal) / 1.18)

            data["details"].append(
                {
                    "codProducto": detail.product.sku or "GEN",
                    "unidad": "NIU",
                    "cantidad": float(detail.quantity),
                    "descripcion": detail.product.name,
                    "mtoBaseIgv": float(detail.subtotal) / 1.18,
                    "porcentajeIgv": 18,
                    "igv": igv_item,
                    "tipAfeIgv": "10",  # Gravado - Operación Onerosa
                    "totalImpuestos": igv_item,
                    "mtoValorVenta": float(detail.subtotal) / 1.18,
                    "mtoValorUnitario": valor_unitario,
                    "mtoPrecioUnitario": precio_unitario,
                }
            )

        # Envío al endpoint correcto
        url = f"{self.base_url}/note/send"
        note.json_sent = data

        try:
            r = requests.post(url, headers=self.headers, json=data, timeout=10)
            note.json_response = r.json()

            if r.status_code == 200:
                # Guardamos PDF si viene
                note.sunat_pdf_url = r.json().get("links", {}).get("pdf")
                note.save()
                print("✅ Nota enviada correctamente")
            else:
                print(f"❌ Error API: {r.text}")

            return r.json()
        except Exception as e:
            print(f"❌ Error conexión: {e}")
            return None

    def _number_to_words(self, amount):
        from num2words import num2words

        try:
            return num2words(amount, lang="es").upper() + " SOLES"
        except:  # noqa: E722
            return f"{amount} SOLES"
