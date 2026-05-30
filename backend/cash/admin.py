from django.contrib import admin

from .models import CashMovement, CashRegister, CashShift


@admin.register(CashRegister)
class CashRegisterAdmin(admin.ModelAdmin):
    # Mostramos las columnas clave en la lista
    list_display = ("name", "branch", "boleta_series", "factura_series", "is_active")
    # Añadimos filtros laterales por sede y estado
    list_filter = ("branch", "is_active")
    search_fields = ("name",)


@admin.register(CashShift)
class CashShiftAdmin(admin.ModelAdmin):
    list_display = ("id", "cash_register", "user", "status", "opened_at", "closed_at")
    list_filter = ("status", "cash_register__branch")
    search_fields = ("user__username", "user__first_name")
    readonly_fields = ("uuid",)  # Protegemos el UUID para que no lo editen por error


@admin.register(CashMovement)
class CashMovementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "shift",
        "user",
        "movement_type",
        "concept",
        "amount",
        "created_at",
    )
    list_filter = ("movement_type", "concept")
    search_fields = ("description", "user__username")
    readonly_fields = ("uuid",)  # Protegemos el UUID
