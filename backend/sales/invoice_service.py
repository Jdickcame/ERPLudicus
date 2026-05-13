import requests
from django.conf import settings
from num2words import num2words

# Credenciales desde settings (.env)
API_URL = settings.APISPERU_URL
API_TOKEN = settings.APISPERU_TOKEN


class InvoiceService:
    def __init__(self, sale):
        self.sale = sale
        self.branch = sale.branch
        self.customer = sale.customer

        # Para usar en la Nota de Crédito
        self.base_url = API_URL
        self.headers = {
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        }

    def generar_comprobante(self):
        print(
            f"🚀 Iniciando facturación para Venta {self.sale.series}-{self.sale.number}"
        )

        tipo_doc = "01" if self.sale.invoice_type_code == "01" else "03"

        if self.customer:
            client_num = self.customer.tax_id
            client_name = self.customer.name
            if len(client_num) == 11:
                client_type = "6"
            elif len(client_num) == 8:
                client_type = "1"
            else:
                client_type = "0"
            client_address = self.customer.address if self.customer.address else "-"
        else:
            client_num = "00000000"
            client_name = "PUBLICO GENERAL"
            client_type = "0"
            client_address = "-"

        total_venta = float(self.sale.total)
        total_gravada = 0.0
        total_igv = 0.0

        items_payload = []
        for detail in self.sale.details.all():
            precio_final_unitario = float(detail.price)
            cantidad = float(detail.quantity)

            valor_unitario = precio_final_unitario / 1.18
            valor_venta_item = valor_unitario * cantidad
            igv_item = valor_venta_item * 0.18

            total_gravada += valor_venta_item
            total_igv += igv_item

            items_payload.append(
                {
                    "codProducto": str(detail.product.id),
                    "unidad": "NIU",
                    "descripcion": detail.product.name,
                    "cantidad": cantidad,
                    "mtoValorUnitario": round(valor_unitario, 2),
                    "mtoValorVenta": round(valor_venta_item, 2),
                    "mtoBaseIgv": round(valor_venta_item, 2),
                    "porcentajeIgv": 18,
                    "igv": round(igv_item, 2),
                    "tipAfeIgv": "10",
                    "totalImpuestos": round(igv_item, 2),
                    "mtoPrecioUnitario": round(precio_final_unitario, 2),
                }
            )

        mto_entero = int(total_venta)
        mto_decimal = int(round((total_venta - mto_entero) * 100))
        try:
            texto_monto = num2words(mto_entero, lang="es").upper()
        except:  # noqa: E722
            texto_monto = "CERO"

        leyenda_valor = f"SON {texto_monto} CON {mto_decimal:02d}/100 SOLES"

        payload = {
            "ublVersion": "2.1",
            "tipoOperacion": "0101",
            "tipoDoc": tipo_doc,
            "serie": self.sale.series,
            "correlativo": self.sale.number,
            "fechaEmision": self.sale.date.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
            "formaPago": {"moneda": "PEN", "tipo": "Contado"},
            "tipoMoneda": "PEN",
            "client": {
                "tipoDoc": client_type,
                "numDoc": client_num,
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
                "ruc": 20491934671,
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
            "mtoOperGravadas": round(total_gravada, 2),
            "mtoIGV": round(total_igv, 2),
            "totalImpuestos": round(total_igv, 2),
            "valorVenta": round(total_gravada, 2),
            "subTotal": round(total_venta, 2),
            "mtoImpVenta": round(total_venta, 2),
            "details": items_payload,
            "legends": [{"code": "1000", "value": leyenda_valor}],
        }

        try:
            # Enviamos el JSON (Guardamos evidencia de qué mandamos)
            self.sale.json_sent = payload
            response = requests.post(
                f"{API_URL}/invoice/send", json=payload, headers=self.headers
            )
            result = response.json()

            print(f"📦 Respuesta ApisPeru: {result}")

            # Guardamos la respuesta cruda en la base de datos
            self.sale.json_response = result

            if response.status_code == 200:
                print("✅ Facturación Exitosa en ApisPeru")
                self.sale.sunat_status = "ACCEPTED"

                # 1. HASH: Lo sacamos directo del nivel principal
                if "hash" in result:
                    self.sale.sunat_hash = result["hash"]

                if "xml" in result:
                    self.sale.sunat_xml_url = result["xml"]

                # 2. DESCRIPCIÓN: Lo sacamos del sub-diccionario 'sunatResponse'
                sunat_res = result.get("sunatResponse", {})
                if isinstance(sunat_res, dict):
                    self.sale.sunat_description = sunat_res.get(
                        "description", "Aceptado"
                    )
                    if "cdrZip" in sunat_res:
                        self.sale.sunat_cdr_url = sunat_res["cdrZip"]

                # 3. PDF URL (Formato Estándar de ApisPeru)
                pdf_url = (
                    f"{API_URL}/invoice/pdf?"
                    f"ruc=20491934671&serie={self.sale.series}&"
                    f"correlativo={self.sale.number}&tipo={tipo_doc}&"
                    f"format=ticket"
                )
                self.sale.sunat_pdf_url = pdf_url
                print(f"🖨️ PDF Generado: {pdf_url}")

                self.sale.save()
                return {"success": True, "data": result}
            else:
                print(f"❌ Error ApisPeru: {result}")
                self.sale.sunat_status = "REJECTED"
                self.sale.sunat_description = result.get(
                    "message", "Error en estructura XML/JSON"
                )
                self.sale.save()
                return {"success": False, "error": result}

        except Exception as e:
            print(f"❌ Error de Conexión: {e}")
            self.sale.sunat_status = "PENDING"
            self.sale.sunat_description = str(e)
            self.sale.save()
            return {"success": False, "error": str(e)}

    def enviar_nota(self, note):
        sale = note.sale

        data = {
            "ublVersion": "2.1",
            "tipoDoc": note.note_type,
            "serie": note.series,
            "correlativo": note.number,
            "fechaEmision": note.date.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
            "tipDocAfectado": sale.invoice_type_code,
            "numDocfectado": f"{sale.series}-{sale.number}",
            "codMotivo": note.reason_code,
            "desMotivo": note.description,
            "tipoMoneda": "PEN",
            "client": {
                "tipoDoc": sale.customer.document_type if sale.customer else "0",
                "numDoc": sale.customer.tax_id if sale.customer else "00000000",
                "rznSocial": sale.customer.name if sale.customer else "PUBLICO GENERAL",
                "address": {
                    "direccion": sale.customer.address if sale.customer else "-"
                },
            },
            "company": {
                "ruc": "20491934671",
                "razonSocial": "AGA CORP S.A.C.",
                "address": {"direccion": "Cal. Siqueiros Nro 110 - Surquillo"},
            },
            "mtoOperGravadas": float(sale.total_gravada),
            "mtoIGV": float(sale.total_igv),
            "totalImpuestos": float(sale.total_igv),
            "mtoImpVenta": float(sale.total),
            "details": [],
            "legends": [
                {
                    "code": "1000",
                    "value": f"SON: {self._number_to_words(sale.total)}",
                }
            ],
        }

        for detail in sale.details.all():
            precio_unitario = float(detail.subtotal) / float(detail.quantity)
            valor_unitario = precio_unitario / 1.18
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
                    "tipAfeIgv": "10",
                    "totalImpuestos": igv_item,
                    "mtoValorVenta": float(detail.subtotal) / 1.18,
                    "mtoValorUnitario": valor_unitario,
                    "mtoPrecioUnitario": precio_unitario,
                }
            )

        url = f"{self.base_url}/note/send"
        note.json_sent = data

        try:
            r = requests.post(url, headers=self.headers, json=data, timeout=10)
            result = r.json()
            note.json_response = result

            if r.status_code == 200:
                # Guardamos PDF construyendo la ruta estándar
                pdf_url = (
                    f"{API_URL}/invoice/pdf?"
                    f"ruc=20491934671&serie={note.series}&"
                    f"correlativo={note.number}&tipo={note.note_type}&"
                    f"format=ticket"
                )
                note.sunat_pdf_url = pdf_url
                note.save()
                print("✅ Nota enviada correctamente")
            else:
                print(f"❌ Error API: {r.text}")

            return result
        except Exception as e:
            print(f"❌ Error conexión: {e}")
            return None

    def _number_to_words(self, amount):
        from num2words import num2words

        try:
            return num2words(amount, lang="es").upper() + " SOLES"
        except:  # noqa: E722
            return f"{amount} SOLES"
