from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    InventoryView,
    KardexViewSet,
    ProductViewSet,
    StockViewSet,
)

router = DefaultRouter()
router.register(r"categories", CategoryViewSet)
router.register(r"products", ProductViewSet)
router.register(r"stocks", StockViewSet, basename="stock")
router.register(r"kardex", KardexViewSet, basename="kardex")  # 👈 Actualizado
router.register(r"operations", InventoryView, basename="inventory-ops")

urlpatterns = [
    path("", include(router.urls)),
]
