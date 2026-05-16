from django.contrib import admin
from django.db.models import Sum

from .models import (
    Category,
    InventoryAdjustment,
    InventoryAdjustmentDetail,
    Kardex,
    Product,
    ProductRecipe,
    Stock,
    Tag,
    Transfer,
    TransferDetail,
)


# --- 1. CLASIFICACIÓN Y ETIQUETAS ---
@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    search_fields = ("name",)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "color")
    search_fields = ("name",)


# --- 2. PRODUCTOS Y RECETAS ---
class ProductRecipeInline(admin.TabularInline):
    model = ProductRecipe
    fk_name = (
        "finished_product"  # Le dice a Django de qué lado va la relación principal
    )
    extra = 1
    autocomplete_fields = ["ingredient"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "sku",
        "name",
        "area",
        "category",
        "price",
        "get_total_stock",
        "product_type",
        "is_active",
    )
    search_fields = ("name", "sku")
    list_filter = (
        "area",
        "category",
        "product_type",
        "is_sellable",
        "manage_stock",
        "is_active",
    )
    filter_horizontal = (
        "tags",
    )  # Permite elegir etiquetas con un widget bonito de 2 columnas
    inlines = [
        ProductRecipeInline
    ]  # Permite armar la receta en la misma pantalla del producto

    def get_total_stock(self, obj):
        return obj.stocks.aggregate(total=Sum("quantity"))["total"] or 0

    get_total_stock.short_description = "Stock Global"


# --- 3. STOCK (Protegido contra trampa) ---
@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "branch",
        "quantity",
        "min_stock",
        "average_cost",
        "is_active",
        "updated_at",
    )
    list_filter = ("branch", "is_active")
    search_fields = ("product__name", "product__sku")

    # 🔥 SEGURIDAD: Nadie puede editar la cantidad o el costo desde aquí.
    # Si quieren alterar el stock, deben hacer un Ajuste de Inventario o una Compra.
    readonly_fields = ("quantity", "average_cost")


# --- 4. AJUSTES DE INVENTARIO ---
class InventoryAdjustmentDetailInline(admin.TabularInline):
    model = InventoryAdjustmentDetail
    extra = 1
    autocomplete_fields = ["product"]


@admin.register(InventoryAdjustment)
class InventoryAdjustmentAdmin(admin.ModelAdmin):
    list_display = ("id", "type", "branch", "reason", "created_by", "created_at")
    list_filter = ("type", "branch", "created_at")
    inlines = [InventoryAdjustmentDetailInline]
    search_fields = ("reason",)


# --- 5. TRANSFERENCIAS ---
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


# --- 6. KARDEX (Inmutable) ---
@admin.register(Kardex)
class KardexAdmin(admin.ModelAdmin):
    list_display = (
        "date",
        "type",
        "branch",
        "product",
        "quantity",
        "unit_cost",
        "balance_quantity",
    )
    list_filter = ("branch", "type", "date")
    search_fields = (
        "product__name",
        "product__sku",
        "reference_document",
        "description",
    )

    # 🔥 SEGURIDAD EXTREMA: El Kardex es intocable en el Admin
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
