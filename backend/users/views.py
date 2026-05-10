from core.mixins import BranchAccessMixin
from django.db.models import Q
from django.http import JsonResponse
from rest_framework import status, viewsets  # 👈 Agregamos status
from rest_framework.decorators import api_view, permission_classes  # 👈 Agregamos estos
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import (  # 👈 Agregamos AllowAny
    AllowAny,
    IsAuthenticated,
)
from rest_framework.response import Response  # 👈 Agregamos Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User
from .serializers import MyTokenObtainPairSerializer, UserSerializer


# 1. Vista de Login Personalizada (JWT con datos extra - BACKOFFICE)
class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer


# 2. Vista de Gestión de Usuarios (CRUD BLINDADO)
class UserViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    # 🛡️ FILTRO: Solo mostrar usuarios de la sede seleccionada
    def get_queryset(self):
        queryset = User.objects.all().order_by("id")
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    # 🛡️ CREACIÓN: Asignar automáticamente la sede al crear el usuario
    def perform_create(self, serializer):
        branch_id = self.request.data.get("branch_id")
        if branch_id:
            serializer.save(branch_id=branch_id)
        else:
            serializer.save()


def get_user_roles(request):
    # Convertimos la TextChoices de ROLES del modelo en una lista JSON
    roles_list = [{"value": role.value, "label": role.label} for role in User.Role]
    return JsonResponse(roles_list, safe=False)


# 👇 NUEVO: 3. Login Exclusivo para el Punto de Venta (Con PIN)
@api_view(["POST"])
@permission_classes([AllowAny])
def pos_login_view(request):
    pin = request.data.get("pin")

    if not pin:
        return Response(
            {"error": "Por favor, ingrese un PIN."}, status=status.HTTP_400_BAD_REQUEST
        )

    # Buscamos al usuario por su PIN
    user = User.objects.filter(pin=pin).first()

    if not user:
        return Response(
            {"error": "PIN incorrecto. Intente nuevamente."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {"error": "Su usuario está inactivo."}, status=status.HTTP_403_FORBIDDEN
        )

    # Validamos permisos (Debe ser ADMIN o tener can_view_pos en True)
    if user.role != "ADMIN" and not getattr(user, "can_view_pos", False):
        return Response(
            {"error": "No tiene permisos para acceder al Punto de Venta."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Generamos los tokens JWT manualmente para esta sesión
    refresh = MyTokenObtainPairSerializer.get_token(user)

    # Devolvemos la misma estructura que tu login normal para que el Frontend no se confunda
    return Response(
        {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "role": user.role,
                "branch_id": user.branch_id if user.branch else None,
                "can_authorize_voids": getattr(user, "can_authorize_voids", False),
            },
        },
        status=status.HTTP_200_OK,
    )


def check_supervisor_permission(request):
    """
    Verifica si el usuario actual tiene permisos o si envió un PIN válido de gerente.
    """
    user = request.user

    # 1. Si el usuario logueado YA ES admin/gerente, o tiene el permiso explícito, pasa gratis.
    if (
        user.role in ["ADMIN", "MANAGER"]
        or getattr(user, "can_authorize_voids", False)
        or user.is_superuser
    ):
        return True

    # 2. Si es un Empleado raso, extraemos el PIN que nos mandó React
    pin_enviado = request.data.get("supervisor_pin")

    if not pin_enviado:
        raise PermissionDenied(
            "Acceso denegado: Se requiere PIN de autorización de un supervisor."
        )

    # 3. Buscamos en la BD si existe algún JEFE con ese PIN
    jefe_valido = (
        User.objects.filter(pin=pin_enviado)
        .filter(
            # Tiene que ser ADMIN/MANAGER, o al menos tener 'can_authorize_voids' activado
            Q(role__in=["ADMIN", "MANAGER"]) | Q(can_authorize_voids=True)
        )
        .exists()
    )

    if not jefe_valido:
        raise PermissionDenied(
            "PIN incorrecto o el supervisor no tiene privilegios suficientes."
        )

    return True
