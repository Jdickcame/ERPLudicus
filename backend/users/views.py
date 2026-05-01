from core.mixins import BranchAccessMixin
from django.http import JsonResponse
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User
from .serializers import MyTokenObtainPairSerializer, UserSerializer


# 1. Vista de Login Personalizada (JWT con datos extra)
class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer


# 2. Vista de Gestión de Usuarios (CRUD BLINDADO)
class UserViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    # 🛡️ FILTRO: Solo mostrar usuarios de la sede seleccionada
    def get_queryset(self):
        # Empezamos con todos los usuarios (ordenados por ID o nombre)
        queryset = User.objects.all().order_by("id")

        # Obtenemos el ID de la sede desde la URL (?branch_id=1)
        branch_id = self.request.query_params.get("branch_id")

        if branch_id:
            # Si el frontend manda una sede, filtramos
            # (Asumiendo que tu modelo User tiene un campo 'branch')
            queryset = queryset.filter(branch_id=branch_id)

        return queryset

    # 🛡️ CREACIÓN: Asignar automáticamente la sede al crear el usuario
    def perform_create(self, serializer):
        branch_id = self.request.data.get("branch_id")

        # Si el frontend envió el ID de la sede, lo guardamos en el usuario
        if branch_id:
            # Nota: El serializer se encarga de hashear la contraseña
            serializer.save(branch_id=branch_id)
        else:
            # Si es un superusuario creando un admin global, quizás no tenga sede
            serializer.save()


def get_user_roles(request):
    # Convertimos la tupla de ROLES del modelo en una lista JSON
    # User.ROLES es algo como: (('ADMIN', 'Administrador'), ('MANAGER', 'Gerente')...)
    roles_list = [{"value": role[0], "label": role[1]} for role in User.ROLES]
    return JsonResponse(roles_list, safe=False)
