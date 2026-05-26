from django.urls import include, path
from rest_framework.routers import DefaultRouter

# 👇 Importamos las dos clases
from .views import AreaBudgetViewSet, TreasuryViewSet

router = DefaultRouter()
router.register(r"operations", TreasuryViewSet, basename="treasury_operations")
# 👇 El cerebro de presupuestos ahora vive en esta URL
router.register(r"budgets", AreaBudgetViewSet, basename="treasury_budgets")

urlpatterns = [
    path("", include(router.urls)),
]
