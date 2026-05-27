"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

# 👇 NUEVAS IMPORTACIONES PARA MANEJAR ARCHIVOS 👇
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExchangeRateViewSet

router = DefaultRouter()
router.register(r"exchange-rate", ExchangeRateViewSet, basename="exchange-rate")


# Vista de prueba
def test_api(request):
    return JsonResponse({"status": "ok", "message": "API funcionando"})


urlpatterns = [
    path("admin/", admin.site.urls),
    # Ruta de prueba
    path("api/test/", test_api, name="test"),
    path("api/users/", include("users.urls")),  # Rutas de usuarios
    path("api/inventory/", include("inventory.urls")),  # Ruta inventario
    path("api/sales/", include("sales.urls")),  # Ruta de Ventas
    path("api/cash/", include("cash.urls")),
    path("api/purchases/", include("purchases.urls")),  # Ruta de Compras
    path("api/reports/", include("reports.urls")),  # Ruta reportes
    path("api/branches/", include("branches.urls")),  # Ruta sedes
    path("api/treasury/", include("treasury.urls")),
    path("api/", include(router.urls)),
]

# 👇 AGREGA ESTO AL FINAL: Habilita la lectura de archivos físicos en Desarrollo 👇
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
