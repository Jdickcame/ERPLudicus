from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExpenseCategoryViewSet,
    PurchaseNoteViewSet,
    PurchaseOrderViewSet,
    PurchaseViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register(r"suppliers", SupplierViewSet, basename="suppliers")
router.register(r"categories", ExpenseCategoryViewSet, basename="categories")
router.register(r"purchases", PurchaseViewSet, basename="purchases")
router.register(r"notes", PurchaseNoteViewSet, basename="purchase-note")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-orders")

urlpatterns = [
    path("", include(router.urls)),
]
