from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EventRegistrationViewSet, EventViewSet

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")
router.register(r"registrations", EventRegistrationViewSet, basename="registration")

urlpatterns = [
    path("", include(router.urls)),
]
