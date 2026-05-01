from django.contrib import admin
from django.db.models import Sum

# 👇 1. IMPORTACIONES ACTUALIZADAS
# Quitamos 'InventoryMovement' porque ya no existe en models.py
# Agregamos 'Kardex', 'Transfer' y 'TransferDetail'
from .models import Category, Kardex, Product, Stock, Transfer, TransferDetail


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "created_at")
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    # ✅ MANTENEMOS TU LÓGICA ORIGINAL
    list_display = (
        "name",
        "sku",
        "category",
        "price",
        "get_total_stock",  # Tu campo calculado
        "product_type",
        "is_sellable",
    )
    search_fields = ("name", "sku")
    list_filter = ("category", "product_type", "is_sellable")

    # Tu función para sumar stock de todas las sedes
    def get_total_stock(self, obj):
        return obj.stocks.aggregate(total=Sum("quantity"))["total"] or 0

    get_total_stock.short_description = "Stock Global"


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    # Agregamos 'average_cost' para que veas el costo promedio ponderado
    list_display = ("product", "branch", "quantity", "average_cost", "updated_at")
    list_filter = ("branch",)
    search_fields = ("product__name",)


# 👇 2. NUEVO ADMIN PARA KARDEX (Reemplaza a InventoryMovement)
@admin.register(Kardex)
class KardexAdmin(admin.ModelAdmin):
    list_display = (
        "date",
        "type",
        "branch",
        "product",
        "quantity",
        "unit_cost",
        "balance_quantity",  # El saldo final después del movimiento
    )
    list_filter = ("branch", "type", "date")
    search_fields = ("product__name", "description")
    # El Kardex es un registro contable, mejor que sea solo lectura en el admin
    readonly_fields = (
        "date",
        "balance_quantity",
        "balance_unit_cost",
        "balance_total_cost",
    )


# 👇 3. NUEVO ADMIN PARA TRANSFERENCIAS (Para mover entre sedes)
class TransferDetailInline(admin.TabularInline):
    model = TransferDetail
    extra = 1
    autocomplete_fields = ["product"]


@admin.register(Transfer)
class TransferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "origin_branch",
        "destination_branch",
        "status",
        "created_by",
        "created_at",
    )
    list_filter = ("status", "origin_branch", "destination_branch")
    inlines = [TransferDetailInline]
    search_fields = ("observation",)
