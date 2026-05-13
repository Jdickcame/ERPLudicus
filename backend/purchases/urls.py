from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AreaBudgetViewSet,
    ExpenseCategoryViewSet,
    PurchaseNoteViewSet,
    PurchaseViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register(r"suppliers", SupplierViewSet, basename="suppliers")
router.register(r"categories", ExpenseCategoryViewSet, basename="categories")
router.register(r"purchases", PurchaseViewSet, basename="purchases")
router.register(r"budgets", AreaBudgetViewSet, basename="budgets")
router.register(r"notes", PurchaseNoteViewSet, basename="purchase-note")

urlpatterns = [
    path("", include(router.urls)),
]
