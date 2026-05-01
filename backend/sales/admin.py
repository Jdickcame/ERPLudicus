from django.contrib import admin

from .models import Customer, Sale, SaleDetail


class SaleDetailInline(admin.TabularInline):
    model = SaleDetail
    extra = 0


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "total", "date", "user")
    inlines = [SaleDetailInline]


admin.site.register(Customer)
