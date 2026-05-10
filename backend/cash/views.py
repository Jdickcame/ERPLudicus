from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from cash import serializers

from .models import CashMovement, CashRegister, CashShift
from .serializers import (
    CashMovementSerializer,
    CashRegisterSerializer,
    CashShiftSerializer,
)

User = get_user_model()


class CashRegisterViewSet(viewsets.ModelViewSet):
    queryset = CashRegister.objects.all()
    serializer_class = CashRegisterSerializer
    permission_classes = [IsAuthenticated]


class CashShiftViewSet(viewsets.ModelViewSet):
    queryset = CashShift.objects.all().order_by("-opened_at")
    serializer_class = CashShiftSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # Al crear (Apertura), asignamos usuario y estado OPEN
        serializer.save(user=self.request.user, status="OPEN")

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Devuelve la caja abierta del usuario actual"""
        shift = CashShift.objects.filter(user=request.user, status="OPEN").first()
        if not shift:
            return Response(
                {"detail": "No tienes caja abierta"}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(self.get_serializer(shift).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Cierre de Caja (Arqueo)"""
        shift = self.get_object()

        if shift.status == "CLOSED":
            return Response(
                {"detail": "La caja ya está cerrada"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Obtenemos el monto real que contó el usuario
        real_amount = request.data.get("final_balance_real")
        if real_amount is None:
            return Response(
                {"detail": "Debes enviar el monto real (arqueo)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Calculamos el sistema (Saldo Inicial + Ingresos - Egresos)
        incomes = (
            shift.movements.filter(movement_type="IN").aggregate(Sum("amount"))[
                "amount__sum"
            ]
            or 0
        )
        expenses = (
            shift.movements.filter(movement_type="OUT").aggregate(Sum("amount"))[
                "amount__sum"
            ]
            or 0
        )
        system_amount = shift.initial_balance + incomes - expenses

        # 3. Guardamos y cerramos
        shift.final_balance_system = system_amount
        shift.final_balance_real = real_amount
        shift.difference = float(real_amount) - float(system_amount)
        shift.closed_at = timezone.now()
        shift.status = "CLOSED"
        shift.save()

        return Response(self.get_serializer(shift).data)


class CashMovementViewSet(viewsets.ModelViewSet):
    queryset = CashMovement.objects.all()
    serializer_class = CashMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # 1. Empezamos con todos los movimientos ordenados por fecha (más reciente arriba)
        queryset = CashMovement.objects.all().order_by("-created_at")

        # 2. Buscamos si el frontend nos mandó un "?shift=XX"
        shift_id = self.request.query_params.get("shift")

        # 3. Si mandó ID, filtramos. Si no, devolvemos todo (o nada, según prefieras).
        if shift_id:
            queryset = queryset.filter(shift_id=shift_id)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user

        # 1. Validar que el usuario tenga caja abierta
        shift = CashShift.objects.filter(user=user, status="OPEN").first()
        if not shift:
            raise serializers.ValidationError(
                {"error": "No tienes una caja abierta. Abre caja primero."}
            )

        # 🛑 2. EL GUARDIÁN: Validar permisos de movimiento manual
        # Si el usuario NO es un ADMIN o MANAGER, le exigimos el PIN
        if user.role not in ["ADMIN", "MANAGER"]:
            supervisor_pin = self.request.data.get("supervisor_pin")

            if not supervisor_pin:
                raise serializers.ValidationError(
                    {
                        "error": "No tienes permisos. Se requiere PIN de un Gerente/Admin."
                    }
                )

            # Buscamos un usuario con ese PIN que SÍ sea gerente o admin
            supervisor = User.objects.filter(
                pin=supervisor_pin, role__in=["ADMIN", "MANAGER"]
            ).first()

            if not supervisor:
                raise serializers.ValidationError(
                    {
                        "error": "PIN inválido o el usuario no tiene permisos de gerencia."
                    }
                )

        # ✅ 3. Guardar el movimiento (Se ejecuta solo si pasó el Guardián o si ya era Jefe)
        serializer.save(user=user, shift=shift)
