import base64
import json
import os
import re
from decimal import ROUND_HALF_UP, Decimal

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from num2words import num2words

# Credenciales desde settings (.env)
API_URL = settings.APISPERU_URL
API_TOKEN = settings.APISPERU_TOKEN


# HERRAMIENTA 1: Para guardar el XML
def save_text_file(text_content, filename, folder):
    if not text_content:
        return None
    try:
        # Convertimos el texto a bytes usando UTF-8 para que acepte tildes
        file_data = text_content.encode("utf-8")
        path = os.path.join("facturacion", folder, filename)
        saved_path = default_storage.save(path, ContentFile(file_data))
        return default_storage.url(saved_path)
    except Exception as e:
        print(f"Error guardando archivo XML físico: {e}")
        return None


# HERRAMIENTA 2: Para guardar el CDR ZIP (Base64)
def save_base64_file(base64_string, filename, folder):
    if not base64_string:
        return None
    try:
        file_data = base64.b64decode(base64_string)
        path = os.path.join("facturacion", folder, filename)
        saved_path = default_storage.save(path, ContentFile(file_data))
        return default_storage.url(saved_path)
    except Exception as e:
        print(f"Error guardando archivo ZIP físico: {e}")
        return None


def _decimal_to_float(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def _default_json(obj):
    if isinstance(obj, Decimal):
        return f"__DECIMAL#{obj}#DECIMAL__"
    raise TypeError


def _clean_json_numbers(json_str):
    return re.sub(
        r'"__DECIMAL#(-?\d+(?:\.\d+)?)#DECIMAL__"',
        r"\1",
        json_str,
    )


def _serialize_for_sunat(payload):
    return _clean_json_numbers(json.dumps(payload, default=_default_json))


class InvoiceService:
    def __init__(self, sale=None):
        self.sale = sale
        self.branch = sale.branch if sale else None
        self.customer = sale.customer if sale else None

        self.base_url = API_URL
        self.headers = {
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        }

    def generar_comprobante(self):
        print(f"Iniciando facturacion para Venta {self.sale.series}-{self.sale.number}")

        tipo_doc = "01" if self.sale.invoice_type_code == "01" else "03"

        # --- 1. LÓGICA DE IDENTIFICACIÓN DEL CLIENTE ---
        if self.customer:
            client_num = self.customer.tax_id.strip() if self.customer.tax_id else ""
            client_name = self.customer.name

            doc_mapping = {
                "DNI": "1",
                "RUC": "6",
                "CE": "4",
                "CEE": "4",
                "PASAPORTE": "7",
            }

            if getattr(self.customer, "document_type", None) in doc_mapping:
                client_type = doc_mapping[self.customer.document_type]
            elif len(client_num) == 11:
                client_type = "6"
            elif len(client_num) == 8:
                client_type = "1"
            elif len(client_num) == 9:
                client_type = "4"
            else:
                client_type = "0"

            client_address = self.customer.address if self.customer.address else "-"
        else:
            # Cliente anónimo
            client_num = "00000000"
            client_name = "PUBLICO GENERAL"
            client_type = "0"
            client_address = "-"

        # --- 2. LÓGICA DE CÁLCULO BRUTO Y NETO ---
        total_venta_bruta = Decimal("0.00")
        total_gravada_bruta = Decimal("0.00")
        total_igv_bruto = Decimal("0.00")

        items_payload = []
        for detail in self.sale.details.all():
            precio_final_unitario = Decimal(str(detail.price))
            cantidad = Decimal(str(detail.quantity))
            subtotal_item_con_igv = Decimal(str(detail.subtotal))

            valor_venta_item = (subtotal_item_con_igv / Decimal("1.18")).quantize(
                Decimal("0.00"), rounding=ROUND_HALF_UP
            )

            valor_unitario = valor_venta_item / cantidad

            igv_item = (valor_venta_item * Decimal("0.18")).quantize(
                Decimal("0.00"), rounding=ROUND_HALF_UP
            )

            total_venta_bruta += subtotal_item_con_igv
            total_gravada_bruta += valor_venta_item
            total_igv_bruto += igv_item

            unidad_medida = "ZZ" if detail.product.product_type == "SERVICE" else "NIU"

            items_payload.append(
                {
                    "codProducto": str(detail.product.id),
                    "unidad": unidad_medida,
                    "cantidad": cantidad,
                    "descripcion": detail.product.name,
                    "mtoBaseIgv": valor_venta_item,
                    "porcentajeIgv": 18,
                    "igv": igv_item,
                    "tipAfeIgv": "10",
                    "totalImpuestos": igv_item,
                    "mtoValorVenta": valor_venta_item,
                    "mtoValorUnitario": valor_unitario,
                    "mtoPrecioUnitario": precio_final_unitario,
                }
            )

        descuento_global_con_igv = Decimal(str(self.sale.discount_amount or "0.00"))

        if descuento_global_con_igv > Decimal("0"):
            descuento_base_sin_igv = (
                descuento_global_con_igv / Decimal("1.18")
            ).quantize(Decimal("0.00"), rounding=ROUND_HALF_UP)

            total_venta_neta = total_venta_bruta - descuento_global_con_igv
            total_gravada_neta = total_gravada_bruta - descuento_base_sin_igv
            total_igv_neto = total_venta_neta - total_gravada_neta

            factor_descuento = (
                (descuento_base_sin_igv / total_gravada_bruta)
                if total_gravada_bruta > 0
                else Decimal("0")
            )

            monto_desde_factor = (total_gravada_bruta * factor_descuento).quantize(
                Decimal("0.00"), rounding=ROUND_HALF_UP
            )
        else:
            total_venta_neta = total_venta_bruta
            total_gravada_neta = total_gravada_bruta
            total_igv_neto = total_igv_bruto

        mto_entero = int(total_venta_neta)
        mto_decimal = int((total_venta_neta - Decimal(mto_entero)) * Decimal("100"))
        try:
            texto_monto = num2words(mto_entero, lang="es").upper()
        except:  # noqa: E722
            texto_monto = "CERO"

        leyenda_valor = f"SON {texto_monto} CON {mto_decimal:02d}/100 SOLES"

        # --- 3. ARMADO DEL PAYLOAD ---
        payload = {
            "ublVersion": "2.1",
            "tipoOperacion": "0101",
            "tipoDoc": tipo_doc,
            "serie": self.sale.series,
            "correlativo": str(self.sale.number),
            "fechaEmision": self.sale.date.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
            "formaPago": {"moneda": "PEN", "tipo": "Contado"},
            "tipoMoneda": "PEN",
            "client": {
                "tipoDoc": client_type,
                "numDoc": client_num,
                "rznSocial": client_name,
                "address": {
                    "direccion": client_address,
                    "provincia": "LIMA",
                    "departamento": "LIMA",
                    "distrito": "LIMA",
                    "ubigueo": "150101",
                },
            },
            "company": {
                "ruc": "20491934671",
                "razonSocial": "AGA CORP S.A.C.",
                "nombreComercial": "LUDICUS PARK",
                "address": {
                    "direccion": "CAL. SIQUEIROS NRO. 110 URB. LA CALERA",
                    "provincia": "LIMA",
                    "departamento": "LIMA",
                    "distrito": "SURQUILLO",
                    "ubigueo": "150101",
                },
            },
            "mtoOperGravadas": total_gravada_neta,
            "mtoIGV": total_igv_neto,
            "totalImpuestos": total_igv_neto,
            "valorVenta": total_gravada_neta,
            "subTotal": total_venta_neta,
            "mtoImpVenta": total_venta_neta,
            "details": items_payload,
            "legends": [{"code": "1000", "value": leyenda_valor}],
        }

        # Aplicamos los descuentos SIN IGV
        if descuento_global_con_igv > Decimal("0"):
            payload["descuentos"] = [
                {
                    "codTipo": "02",
                    "montoBase": total_gravada_bruta,
                    "factor": factor_descuento,
                    "monto": monto_desde_factor,
                }
            ]

        # --- 4. ENVÍO Y PROCESAMIENTO DE RESPUESTA ---
        try:
            self.sale.json_sent = json.loads(_serialize_for_sunat(payload))
            payload_json = _serialize_for_sunat(payload)
            response = requests.post(
                f"{API_URL}/invoice/send",
                data=payload_json,
                headers=self.headers,
                timeout=12,
            )

            try:
                result = response.json()
            except:  # noqa: E722
                result = {"message": f"Error de formato HTTP {response.status_code}"}

            audit_result = result.copy()

            if "xml" in audit_result:
                audit_result["xml"] = "Archivo XML guardado en disco."

            if "sunatResponse" in audit_result and isinstance(
                audit_result["sunatResponse"], dict
            ):
                audit_sunat_res = audit_result["sunatResponse"].copy()
                if "cdrZip" in audit_sunat_res:
                    audit_sunat_res["cdrZip"] = "Archivo ZIP guardado en disco."
                audit_result["sunatResponse"] = audit_sunat_res

            self.sale.json_response = audit_result

            # LÓGICA DE RESPUESTA
            if response.status_code == 200:
                sunat_res = result.get("sunatResponse", {})

                if isinstance(sunat_res, dict) and not sunat_res.get("success", True):
                    error_data = sunat_res.get("error", {})
                    err_msg = error_data.get("message", "")

                    if (
                        "registrado previamente" in err_msg.lower()
                        or "ya se encuentra registrado" in err_msg.lower()
                    ):
                        self.sale.sunat_status = "ACCEPTED"
                        self.sale.sunat_description = "Aceptado (Recuperado de SUNAT)"
                    elif "1032" in err_msg:
                        self.sale.sunat_status = "REJECTED"
                        self.sale.sunat_description = (
                            "El comprobante fue RECHAZADO previamente por SUNAT."
                        )
                    else:
                        self.sale.sunat_status = "PENDING"
                        self.sale.sunat_description = (
                            err_msg or "Por verificar en SUNAT"
                        )
                else:
                    cdr_res = (
                        sunat_res.get("cdrResponse", {})
                        if isinstance(sunat_res, dict)
                        else {}
                    )
                    sunat_code = str(cdr_res.get("code", ""))
                    sunat_description = cdr_res.get(
                        "description", "Aceptado sin descripcion"
                    )

                    if sunat_code == "0":
                        self.sale.sunat_status = "ACCEPTED"
                        self.sale.sunat_description = sunat_description

                        if "hash" in result:
                            self.sale.sunat_hash = result["hash"]

                        folder_path = self.sale.date.strftime("%Y/%m/%d")
                        base_name = f"{self.sale.series}-{self.sale.number}"

                        if "xml" in result:
                            self.sale.sunat_xml_url = save_text_file(
                                result["xml"], f"{base_name}.xml", f"xml/{folder_path}"
                            )
                        if "cdrZip" in sunat_res:
                            self.sale.sunat_cdr_url = save_base64_file(
                                sunat_res["cdrZip"],
                                f"CDR-{base_name}.zip",
                                f"cdr/{folder_path}",
                            )
                    else:
                        self.sale.sunat_status = "REJECTED"
                        self.sale.sunat_description = sunat_description
            else:
                err_msg = result.get("message", "")
                if (
                    "registrado previamente" in err_msg.lower()
                    or "ya se encuentra registrado" in err_msg.lower()
                ):
                    self.sale.sunat_status = "ACCEPTED"
                    self.sale.sunat_description = "Aceptado (Validado en SUNAT)"
                elif "1032" in err_msg:
                    self.sale.sunat_status = "REJECTED"
                    self.sale.sunat_description = (
                        "El comprobante fue RECHAZADO previamente por SUNAT."
                    )
                else:
                    self.sale.sunat_status = "PENDING"
                    self.sale.sunat_description = (
                        err_msg or "Error de red. Intente reenviar."
                    )

            if self.sale.sunat_status == "ACCEPTED":
                self.sale.sunat_pdf_url = (
                    f"{API_URL}/invoice/pdf?"
                    f"ruc=20491934671&serie={self.sale.series}&"
                    f"correlativo={self.sale.number}&tipo={tipo_doc}&"
                    f"format=ticket"
                )

            self.sale.save()
            return {"success": self.sale.sunat_status == "ACCEPTED", "data": result}

        except requests.exceptions.Timeout:
            self.sale.sunat_status = "PENDING"
            self.sale.sunat_description = "SUNAT demoro. En cola para verificacion."
            self.sale.save()
            return {"success": False, "error": "Timeout"}

        except Exception as e:
            self.sale.sunat_status = "PENDING"
            self.sale.sunat_description = f"Error: {str(e)[:50]}"
            self.sale.save()
            return {"success": False, "error": str(e)}

    # --- 5. LÓGICA PARA NOTAS DE CRÉDITO Y DÉBITO ---
    def enviar_nota(self, note):
        sale = note.sale

        # ESCUDO PARA TICKETS INTERNOS Y NOTAS DE VENTA
        # Si la venta original no es Factura ("01") ni Boleta ("03")
        if sale.invoice_type_code not in ["01", "03"]:
            note.sunat_status = "NO APLICA"
            note.sunat_description = "Anulación interna (No se envía a SUNAT)"
            note.save()
            return {"success": True, "message": "Ticket anulado internamente en el ERP"}

        doc_mapping = {"DNI": "1", "RUC": "6", "CE": "4", "CEE": "4", "PASAPORTE": "7"}
        tipo_doc_cliente = "0"
        num_doc_cliente = "00000000"
        rzn_social = "PUBLICO GENERAL"
        direccion = "-"

        if sale.customer:
            tipo_doc_cliente = doc_mapping.get(sale.customer.document_type, "0")
            num_doc_cliente = (
                sale.customer.tax_id.strip() if sale.customer.tax_id else "00000000"
            )
            rzn_social = sale.customer.name
            direccion = sale.customer.address if sale.customer.address else "-"

            if tipo_doc_cliente == "0" and num_doc_cliente not in ["00000000", "", "0"]:
                if len(num_doc_cliente) == 11:
                    tipo_doc_cliente = "6"
                elif len(num_doc_cliente) == 8:
                    tipo_doc_cliente = "1"
                elif len(num_doc_cliente) == 9:
                    tipo_doc_cliente = "4"

        # --- 2. LÓGICA MATEMÁTICA ESTRICTA (IGUAL QUE EN LA FACTURA) ---
        total_venta_bruta = Decimal("0.00")
        total_gravada_bruta = Decimal("0.00")
        total_igv_bruto = Decimal("0.00")

        items_payload = []
        for detail in sale.details.all():
            precio_final_unitario = Decimal(str(detail.price))
            cantidad = Decimal(str(detail.quantity))
            subtotal_item_con_igv = Decimal(str(detail.subtotal))

            valor_venta_item = (subtotal_item_con_igv / Decimal("1.18")).quantize(
                Decimal("0.00"), rounding=ROUND_HALF_UP
            )
            valor_unitario = valor_venta_item / cantidad
            igv_item = (valor_venta_item * Decimal("0.18")).quantize(
                Decimal("0.00"), rounding=ROUND_HALF_UP
            )

            total_venta_bruta += subtotal_item_con_igv
            total_gravada_bruta += valor_venta_item
            total_igv_bruto += igv_item

            unidad_medida = "ZZ" if detail.product.product_type == "SERVICE" else "NIU"

            items_payload.append(
                {
                    "codProducto": str(detail.product.id),
                    "unidad": unidad_medida,
                    "cantidad": cantidad,
                    "descripcion": detail.product.name,
                    "mtoBaseIgv": valor_venta_item,
                    "porcentajeIgv": 18,
                    "igv": igv_item,
                    "tipAfeIgv": "10",
                    "totalImpuestos": igv_item,
                    "mtoValorVenta": valor_venta_item,
                    "mtoValorUnitario": valor_unitario,
                    "mtoPrecioUnitario": precio_final_unitario,
                }
            )

        descuento_global_con_igv = Decimal(str(sale.discount_amount or "0.00"))

        if descuento_global_con_igv > Decimal("0"):
            descuento_base_sin_igv = (
                descuento_global_con_igv / Decimal("1.18")
            ).quantize(Decimal("0.00"), rounding=ROUND_HALF_UP)

            total_venta_neta = total_venta_bruta - descuento_global_con_igv
            total_gravada_neta = total_gravada_bruta - descuento_base_sin_igv
            total_igv_neto = total_venta_neta - total_gravada_neta

            factor_descuento = (
                (descuento_base_sin_igv / total_gravada_bruta)
                if total_gravada_bruta > 0
                else Decimal("0")
            )

            monto_desde_factor = (total_gravada_bruta * factor_descuento).quantize(
                Decimal("0.00"), rounding=ROUND_HALF_UP
            )
        else:
            total_venta_neta = total_venta_bruta
            total_gravada_neta = total_gravada_bruta
            total_igv_neto = total_igv_bruto

        # --- ARREGLO DE LEYENDA OBLIGATORIA PARA FACTURAS ---
        mto_entero = int(total_venta_neta)
        mto_decimal = int((total_venta_neta - Decimal(mto_entero)) * Decimal("100"))
        try:
            texto_monto = num2words(mto_entero, lang="es").upper()
        except:  # noqa: E722
            texto_monto = "CERO"

        leyenda_valor = f"SON {texto_monto} CON {mto_decimal:02d}/100 SOLES"

        # --- 3. ARMADO FINAL DEL PAYLOAD DE LA NOTA ---
        data = {
            "ublVersion": "2.1",
            "tipoDoc": note.note_type,
            "serie": note.series,
            "correlativo": str(note.number),
            "fechaEmision": note.date.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
            "tipDocAfectado": sale.invoice_type_code,
            "numDocfectado": f"{sale.series}-{str(sale.number).zfill(8)}",
            "codMotivo": note.reason_code,
            "desMotivo": note.description,
            "tipoMoneda": "PEN",
            "client": {
                "tipoDoc": tipo_doc_cliente,
                "numDoc": num_doc_cliente,
                "rznSocial": rzn_social,
                "address": {
                    "direccion": direccion,
                    "provincia": "LIMA",
                    "departamento": "LIMA",
                    "distrito": "LIMA",
                    "ubigueo": "150101",
                },
            },
            "company": {
                "ruc": "20491934671",
                "razonSocial": "AGA CORP S.A.C.",
                "nombreComercial": "LUDICUS PARK",
                "address": {
                    "direccion": "CAL. SIQUEIROS NRO. 110 URB. LA CALERA",
                    "provincia": "LIMA",
                    "departamento": "LIMA",
                    "distrito": "SURQUILLO",
                    "ubigueo": "150101",
                },
            },
            "mtoOperGravadas": total_gravada_neta,
            "mtoIGV": total_igv_neto,
            "totalImpuestos": total_igv_neto,
            "mtoImpVenta": total_venta_neta,
            "details": items_payload,
            "legends": [
                {
                    "code": "1000",
                    "value": leyenda_valor,
                }
            ],
        }

        # Aseguramos que la nota también lleve los descuentos para que la matemática de la SUNAT cuadre
        if descuento_global_con_igv > Decimal("0"):
            data["descuentos"] = [
                {
                    "codTipo": "02",
                    "montoBase": total_gravada_bruta,
                    "factor": factor_descuento,
                    "monto": monto_desde_factor,
                }
            ]

        url = f"{self.base_url}/note/send"
        note.json_sent = json.loads(_serialize_for_sunat(data))
        data_json = _serialize_for_sunat(data)

        try:
            r = requests.post(url, headers=self.headers, data=data_json, timeout=15)

            try:
                result = r.json()
            except:  # noqa: E722
                result = {"message": f"Error no JSON. Status: {r.status_code}"}

            audit_result = result.copy()

            if "xml" in audit_result:
                audit_result["xml"] = "Archivo XML guardado en disco."

            if "sunatResponse" in audit_result and isinstance(
                audit_result["sunatResponse"], dict
            ):
                audit_sunat_res = audit_result["sunatResponse"].copy()
                if "cdrZip" in audit_sunat_res:
                    audit_sunat_res["cdrZip"] = "Archivo ZIP guardado en disco."
                audit_result["sunatResponse"] = audit_sunat_res

            note.json_response = audit_result

            if r.status_code == 200:
                sunat_res = result.get("sunatResponse", {})

                if isinstance(sunat_res, dict) and not sunat_res.get("success", True):
                    error_data = sunat_res.get("error", {})
                    err_msg = str(error_data.get("message", ""))

                    if (
                        "registrado previamente" in err_msg.lower()
                        or "ya se encuentra registrado" in err_msg.lower()
                    ):
                        note.sunat_status = "ACCEPTED"
                        note.sunat_description = "Aceptada (Recuperado de SUNAT)"
                    elif "1032" in err_msg:
                        note.sunat_status = "REJECTED"
                        note.sunat_description = (
                            "El comprobante fue RECHAZADO previamente por SUNAT."
                        )
                    else:
                        note.sunat_status = "PENDING"
                        note.sunat_description = err_msg or "Por verificar en SUNAT"
                else:
                    cdr_res = (
                        sunat_res.get("cdrResponse", {})
                        if isinstance(sunat_res, dict)
                        else {}
                    )
                    sunat_code = str(cdr_res.get("code", ""))
                    sunat_description = cdr_res.get("description", "Aceptada por SUNAT")

                    if sunat_code == "0":
                        note.sunat_status = "ACCEPTED"
                        note.sunat_description = sunat_description
                        note.sunat_hash = result.get("hash")

                        folder_path = note.date.strftime("%Y/%m/%d")
                        base_name = f"{note.series}-{note.number}"

                        if result.get("xml"):
                            note.sunat_xml_url = save_text_file(
                                result.get("xml"),
                                f"{base_name}.xml",
                                f"xml/notas/{folder_path}",
                            )
                        if sunat_res.get("cdrZip"):
                            note.sunat_cdr_url = save_base64_file(
                                sunat_res.get("cdrZip"),
                                f"CDR-{base_name}.zip",
                                f"cdr/notas/{folder_path}",
                            )
                    else:
                        note.sunat_status = "REJECTED"
                        note.sunat_description = sunat_description

            else:
                err_msg = result.get("message", "")
                if (
                    "registrado previamente" in err_msg.lower()
                    or "ya se encuentra registrado" in err_msg.lower()
                ):
                    note.sunat_status = "ACCEPTED"
                    note.sunat_description = "Aceptada (Validado en SUNAT)"
                elif "1032" in err_msg:
                    note.sunat_status = "REJECTED"
                    note.sunat_description = (
                        "El comprobante fue RECHAZADO previamente por SUNAT."
                    )
                else:
                    note.sunat_status = "PENDING"
                    note.sunat_description = err_msg or f"Error HTTP {r.status_code}"

            if note.sunat_status == "ACCEPTED":
                pdf_url = (
                    f"{API_URL}/invoice/pdf?"
                    f"ruc=20491934671&serie={note.series}&"
                    f"correlativo={note.number}&tipo={note.note_type}&"
                    f"format=ticket"
                )
                note.sunat_pdf_url = pdf_url

        except requests.exceptions.Timeout:
            note.sunat_status = "PENDING"
            note.sunat_description = "SUNAT demoro. En cola para verificacion."

        except Exception as e:
            note.sunat_status = "PENDING"
            note.sunat_description = f"Error: {str(e)[:50]}"

        note.save()
        return result

    def _number_to_words(self, amount):
        from num2words import num2words

        try:
            return num2words(amount, lang="es").upper() + " SOLES"
        except:  # noqa: E722
            return f"{amount} SOLES"
