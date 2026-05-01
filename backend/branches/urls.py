from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BranchViewSet

router = DefaultRouter()
router.register(r"", BranchViewSet)  # La ruta base será /api/branches/

urlpatterns = [
    path("", include(router.urls)),
]
