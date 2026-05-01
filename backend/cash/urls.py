from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CashMovementViewSet, CashRegisterViewSet, CashShiftViewSet

router = DefaultRouter()

# 1. Gestión de Cajas Físicas (Ej: Caja Principal, Caja Barra)
router.register(r"registers", CashRegisterViewSet)

# 2. Gestión de Turnos (Apertura y Cierre de Caja)
# Rutas extra generadas automáticamente:
# GET /api/cash/shifts/current/ -> Ver mi caja actual
# POST /api/cash/shifts/{id}/close/ -> Cerrar caja (Arqueo)
router.register(r"shifts", CashShiftViewSet)

# 3. Movimientos Manuales (Ingresos/Egresos/Gastos)
router.register(r"movements", CashMovementViewSet)

urlpatterns = [
    path("", include(router.urls)),
]
