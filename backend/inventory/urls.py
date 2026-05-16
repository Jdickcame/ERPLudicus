from django.urls import include, path
from rest_framework.routers import DefaultRouter

# Importamos TODAS las vistas nuevas
from .views import (
    CategoryViewSet,
    InventoryAdjustmentViewSet,
    KardexViewSet,
    ProductRecipeViewSet,
    ProductViewSet,
    StockViewSet,
    TagViewSet,
    TransferViewSet,
)

# Creamos el enrutador principal
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"tags", TagViewSet, basename="tag")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"recipes", ProductRecipeViewSet, basename="recipe")
router.register(r"stocks", StockViewSet, basename="stock")
router.register(r"adjustments", InventoryAdjustmentViewSet, basename="adjustment")
router.register(r"transfers", TransferViewSet, basename="transfer")
router.register(r"kardex", KardexViewSet, basename="kardex")

urlpatterns = [
    # Incluimos todas las rutas que genera el router automáticamente
    path("", include(router.urls)),
]
