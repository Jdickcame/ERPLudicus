from django.contrib import admin

from .models import ExpenseCategory, Purchase, PurchaseDetail, Supplier, SupplierProductPrice


# Esto permite ver los items dentro de la compra
class PurchaseDetailInline(admin.TabularInline):
    model = PurchaseDetail
    extra = 1


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    inlines = [PurchaseDetailInline]
    list_display = (
        "series",
        "number",
        "supplier",
        "issue_date",
        "total",
        "payment_status",
    )
    list_filter = ("payment_status", "branch", "document_type")
    date_hierarchy = "issue_date"


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "tax_id")
    search_fields = ("name", "tax_id")


@admin.register(SupplierProductPrice)
class SupplierProductPriceAdmin(admin.ModelAdmin):
    list_display = ("supplier", "product", "unit_price", "last_purchase_date")
    list_filter = ("supplier",)
    search_fields = ("product__name", "supplier__name")


admin.site.register(ExpenseCategory)
