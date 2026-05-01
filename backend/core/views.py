from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from .models import ExchangeRate
from .serializers import ExchangeRateSerializer


# Definimos una clase de paginación flexible
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10  # Por defecto mostrará 10
    page_size_query_param = (
        "page_size"  # Esto permite que el frontend pida más (ej: ?page_size=20)
    )
    max_page_size = 100


# 1. PERMISO PERSONALIZADO (Se mantiene igual)
class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        user_role = getattr(request.user, "role", "")
        return (
            request.user.is_superuser
            or request.user.is_staff
            or str(user_role).upper() == "ADMIN"
        )


# 👇 2. CAMBIO IMPORTANTE: HEREDAMOS DE ModelViewSet
class ExchangeRateViewSet(viewsets.ModelViewSet):
    # Definimos el queryset para que 'list' sepa qué devolver (ordenado por fecha)
    queryset = ExchangeRate.objects.all().order_by("-date")
    serializer_class = ExchangeRateSerializer
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            permission_classes = [IsAdminRole]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    # NOTA: Borramos 'def list' y 'def create'.
    # ModelViewSet ya los trae hechos correctamente (devolviendo listas).

    def perform_create(self, serializer):
        # Guardamos quién lo creó automáticamente
        serializer.save(created_by=self.request.user)

    # 👇 3. LÓGICA DE BÚSQUEDA INTELIGENTE
    @action(detail=False, methods=["get"])
    def get_rate(self, request):
        date_str = request.query_params.get("date")
        if not date_str:
            return Response({"error": "Fecha requerida"}, status=400)

        # Buscamos coincidencia exacta por el campo 'date'
        rate = ExchangeRate.objects.filter(date=date_str).first()

        if rate:
            return Response(ExchangeRateSerializer(rate).data)

        # Si no existe, buscamos el último registrado ANTES de esa fecha (Arrastre)
        last_rate = (
            ExchangeRate.objects.filter(date__lt=date_str).order_by("-date").first()
        )

        if last_rate:
            # Devolvemos el valor anterior pero avisando la fecha original
            data = ExchangeRateSerializer(last_rate).data
            # Opcional: Podrías inyectar la fecha solicitada si quisieras
            return Response(data)

        # Si no hay historia, valores por defecto
        return Response({"buy_rate": "1.000", "sell_rate": "1.000", "date": date_str})
