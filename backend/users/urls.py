from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import MyTokenObtainPairView, UserViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="users")  # <--- Registrar ruta

urlpatterns = [
    path("", include(router.urls)),  # <--- Incluir rutas del router
    path("login/", MyTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
