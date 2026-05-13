from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CreditNoteViewSet, CustomerViewSet, SaleViewSet

# 👇 IMPORTAMOS LAS VISTAS NUEVAS DEL ARCHIVO NUEVO
from .views_pdf import (
    generate_nc_pdf_view,
    generate_pdf_view,
    print_courtesies_report_view,
    print_hourly_report_view,
    print_pmix_report_view,
)

router = DefaultRouter()
router.register(r"sales", SaleViewSet)
router.register(r"customers", CustomerViewSet)
router.register(r"credit-notes", CreditNoteViewSet)

urlpatterns = [
    path("", include(router.urls)),
    # Rutas apuntando al archivo nuevo views_pdf.py
    path("sales/<int:pk>/print/", generate_pdf_view, name="sale-pdf"),
    path("credit-notes/<int:pk>/print/", generate_nc_pdf_view, name="nc-pdf"),
    path("reports/hourly/print/", print_hourly_report_view, name="print_hourly"),
    path("reports/pmix/print/", print_pmix_report_view, name="print_pmix"),
    path(
        "reports/courtesies/print/",
        print_courtesies_report_view,
        name="print_courtesies_report",
    ),
]
