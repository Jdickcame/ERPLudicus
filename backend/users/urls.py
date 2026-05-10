from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

# 👇 1. Agrega 'pos_login_view' y 'get_user_roles' a tus importaciones
from .views import MyTokenObtainPairView, UserViewSet, get_user_roles, pos_login_view

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="users")  # <--- Registrar ruta

urlpatterns = [
    path("", include(router.urls)),  # <--- Incluir rutas del router
    path("login/", MyTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # 👇 2. NUEVAS RUTAS
    path(
        "pos-login/", pos_login_view, name="pos-login"
    ),  # <--- Login con PIN para el Cajero
    path(
        "roles/", get_user_roles, name="get_user_roles"
    ),  # <--- Lista de roles (ya lo tenías en views)
]
