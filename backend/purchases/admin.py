from django.contrib import admin

from .models import ExpenseCategory, Purchase, PurchaseDetail, Supplier


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


admin.site.register(ExpenseCategory)
