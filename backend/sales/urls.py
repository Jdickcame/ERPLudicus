from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet, SaleViewSet, generate_pdf_view

router = DefaultRouter()
router.register(r"customers", CustomerViewSet)
router.register(r"sales", SaleViewSet, basename="sales")

urlpatterns = [
    path("sales/<int:pk>/print/", generate_pdf_view, name="sale-print"),
    path("", include(router.urls)),
]
