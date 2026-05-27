import base64
import os

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

# 👇 Importamos correctamente Sale y CreditNote 👇
from sales.models import CreditNote, Sale


def save_text_file(text_content, filename, folder):
    if not text_content:
        return None
    try:
        file_data = str(text_content).encode("utf-8")
        path = os.path.join("facturacion", folder, filename)
        if default_storage.exists(path):
            default_storage.delete(path)
        saved_path = default_storage.save(path, ContentFile(file_data))
        return default_storage.url(saved_path)
    except Exception:
        return None


def save_base64_file(base64_string, filename, folder):
    if not base64_string:
        return None
    try:
        file_data = base64.b64decode(base64_string)
        path = os.path.join("facturacion", folder, filename)
        if default_storage.exists(path):
            default_storage.delete(path)
        saved_path = default_storage.save(path, ContentFile(file_data))
        return default_storage.url(saved_path)
    except Exception:
        return None


class Command(BaseCommand):
    help = "Extrae XML/ZIP antiguos de Ventas y Notas de Credito, crea archivos físicos por dia y limpia la BD."

    def handle(self, *args, **kwargs):
        # ==========================================
        # 1. MIGRACIÓN DE VENTAS (FACTURAS/BOLETAS)
        # ==========================================
        self.stdout.write(
            self.style.WARNING("Iniciando migración de VENTAS antiguas...")
        )
        ventas = Sale.objects.filter(sunat_status="ACCEPTED").iterator(chunk_size=500)
        contador_ventas = 0

        for sale in ventas:
            modificado = False
            # Carpetas por año/mes/día
            folder_path = sale.date.strftime("%Y/%m/%d")
            base_name = f"{sale.series}-{sale.number}"

            if isinstance(sale.json_response, dict):
                xml_raw = sale.json_response.get("xml")
                if xml_raw and "Archivo XML" not in str(xml_raw):
                    sale.sunat_xml_url = save_text_file(
                        xml_raw, f"{base_name}.xml", f"xml/{folder_path}"
                    )
                    sale.json_response["xml"] = "Archivo XML guardado en disco."
                    modificado = True

                sunat_res = sale.json_response.get("sunatResponse", {})
                if isinstance(sunat_res, dict) and "cdrZip" in sunat_res:
                    cdr_raw = sunat_res["cdrZip"]
                    if cdr_raw and "Archivo ZIP" not in str(cdr_raw):
                        sale.sunat_cdr_url = save_base64_file(
                            cdr_raw, f"CDR-{base_name}.zip", f"cdr/{folder_path}"
                        )
                        sale.json_response["sunatResponse"]["cdrZip"] = (
                            "Archivo ZIP guardado en disco."
                        )
                        modificado = True

            if sale.sunat_xml_url and str(sale.sunat_xml_url).startswith("<?xml"):
                sale.sunat_xml_url = save_text_file(
                    sale.sunat_xml_url, f"{base_name}.xml", f"xml/{folder_path}"
                )
                modificado = True

            if sale.sunat_cdr_url and len(str(sale.sunat_cdr_url)) > 255:
                sale.sunat_cdr_url = save_base64_file(
                    sale.sunat_cdr_url, f"CDR-{base_name}.zip", f"cdr/{folder_path}"
                )
                modificado = True

            if modificado:
                sale.save(
                    update_fields=["sunat_xml_url", "sunat_cdr_url", "json_response"]
                )
                contador_ventas += 1

                if contador_ventas % 100 == 0:
                    self.stdout.write(f"Procesadas {contador_ventas} ventas...")

        # ==========================================
        # 2. MIGRACIÓN DE NOTAS DE CRÉDITO
        # ==========================================
        self.stdout.write(
            self.style.WARNING("Iniciando migracion de NOTAS DE CREDITO antiguas...")
        )
        notas = CreditNote.objects.filter(sunat_status="ACCEPTED").iterator(
            chunk_size=500
        )
        contador_notas = 0

        for note in notas:
            modificado = False
            # Carpetas por año/mes/día
            folder_path = note.date.strftime("%Y/%m/%d")
            base_name = f"{note.series}-{note.number}"

            if isinstance(note.json_response, dict):
                xml_raw = note.json_response.get("xml")
                if xml_raw and "Archivo XML" not in str(xml_raw):
                    note.sunat_xml_url = save_text_file(
                        xml_raw, f"{base_name}.xml", f"xml/notas/{folder_path}"
                    )
                    note.json_response["xml"] = "Archivo XML guardado en disco."
                    modificado = True

                sunat_res = note.json_response.get("sunatResponse", {})
                if isinstance(sunat_res, dict) and "cdrZip" in sunat_res:
                    cdr_raw = sunat_res["cdrZip"]
                    if cdr_raw and "Archivo ZIP" not in str(cdr_raw):
                        note.sunat_cdr_url = save_base64_file(
                            cdr_raw, f"CDR-{base_name}.zip", f"cdr/notas/{folder_path}"
                        )
                        note.json_response["sunatResponse"]["cdrZip"] = (
                            "Archivo ZIP guardado en disco."
                        )
                        modificado = True

            if note.sunat_xml_url and str(note.sunat_xml_url).startswith("<?xml"):
                note.sunat_xml_url = save_text_file(
                    note.sunat_xml_url, f"{base_name}.xml", f"xml/notas/{folder_path}"
                )
                modificado = True

            if note.sunat_cdr_url and len(str(note.sunat_cdr_url)) > 255:
                note.sunat_cdr_url = save_base64_file(
                    note.sunat_cdr_url,
                    f"CDR-{base_name}.zip",
                    f"cdr/notas/{folder_path}",
                )
                modificado = True

            if modificado:
                note.save(
                    update_fields=["sunat_xml_url", "sunat_cdr_url", "json_response"]
                )
                contador_notas += 1

                if contador_notas % 50 == 0:
                    self.stdout.write(
                        f"Procesadas {contador_notas} notas de credito..."
                    )

        # ==========================================
        # RESULTADO FINAL
        # ==========================================
        self.stdout.write(
            self.style.SUCCESS(
                f"¡Migracion total completada! \n"
                f"{contador_ventas} Ventas limpiadas.\n"
                f"{contador_notas} Notas de Credito limpiadas."
            )
        )
