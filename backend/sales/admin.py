import traceback  # 👈 NUEVA IMPORTACIÓN

from django.contrib import admin, messages

from .invoice_service import InvoiceService
from .models import CreditNote, Customer, Sale, SaleDetail


class SaleDetailInline(admin.TabularInline):
    model = SaleDetail
    extra = 0


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "total", "date", "user")
    inlines = [SaleDetailInline]


admin.site.register(Customer)


@admin.register(CreditNote)
class CreditNoteAdmin(admin.ModelAdmin):
    list_display = ("series", "number", "date", "sunat_status", "sunat_description")
    list_filter = ("sunat_status",)

    actions = ["reenviar_a_sunat"]

    @admin.action(description="🚀 Reenviar seleccionadas a SUNAT")
    def reenviar_a_sunat(self, request, queryset):
        procesadas = 0
        fallidas = 0

        try:
            for nota in queryset:
                if not nota.sunat_hash or nota.sunat_status != "ACCEPTED":
                    servicio = InvoiceService(nota.sale)
                    servicio.enviar_nota(nota)

                    if nota.sunat_status == "ACCEPTED":
                        procesadas += 1
                    else:
                        fallidas += 1

            if fallidas == 0:
                self.message_user(
                    request,
                    f"¡Éxito! Se enviaron y aceptaron {procesadas} notas en SUNAT.",
                    level=messages.SUCCESS,
                )
            else:
                self.message_user(
                    request,
                    f"Proceso terminado: {procesadas} aceptadas, pero {fallidas} fueron rechazadas por SUNAT. Revisa sus descripciones.",
                    level=messages.WARNING,
                )
        except Exception as e:
            # 👇 ESTO ATRAPARÁ EL ERROR 500 Y LO MOSTRARÁ EN PANTALLA 👇
            error_details = traceback.format_exc()
            mensaje_error = f"🚨 ERROR CRÍTICO: {str(e)}"

            self.message_user(request, mensaje_error, level=messages.ERROR)
            print(error_details)
