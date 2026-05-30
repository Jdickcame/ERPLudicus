from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    MyTokenObtainPairView,
    UserViewSet,
    get_user_roles,
    pos_login_view,
    pos_users_list,
    supervisor_auth,
    verify_my_pin,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="users")

urlpatterns = [
    path("", include(router.urls)),
    path("login/", MyTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("pos-login/", pos_login_view, name="pos-login"),
    path("roles/", get_user_roles, name="get_user_roles"),
    path("supervisor-auth/", supervisor_auth, name="supervisor-auth"),
    path("verify-my-pin/", verify_my_pin, name="verify-my-pin"),
    path("pos-users/", pos_users_list, name="pos-users"),
]
