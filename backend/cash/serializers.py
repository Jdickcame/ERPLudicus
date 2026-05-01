from rest_framework import serializers

from .models import CashMovement, CashRegister, CashShift


class CashRegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashRegister
        fields = "__all__"


class CashMovementSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = CashMovement
        fields = "__all__"
        read_only_fields = ["user", "shift", "created_at"]


class CashShiftSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True)
    register_name = serializers.CharField(source="cash_register.name", read_only=True)

    current_balance = serializers.SerializerMethodField()
    expected_cash = serializers.SerializerMethodField()
    expected_card = serializers.SerializerMethodField()
    expected_transfer = serializers.SerializerMethodField()

    class Meta:
        model = CashShift
        fields = [
            "id",
            "cash_register",
            "register_name",
            "user",
            "user_name",
            "opened_at",
            "closed_at",
            "initial_balance",
            "final_balance_system",
            "final_balance_real",
            "difference",
            "status",
            "current_balance",
            "expected_cash",
            "expected_card",
            "expected_transfer",
        ]
        read_only_fields = [
            "user",
            "opened_at",
            "closed_at",
            "final_balance_system",
            "difference",
            "status",
        ]

    # 👇 Helper para sumar montos según el método de pago de la venta
    def _get_total_by_method(self, obj, method):
        return sum(
            m.amount
            for m in obj.movements.filter(movement_type="IN")
            if m.related_sale and m.related_sale.payment_method == method
        )

    def get_current_balance(self, obj):
        incomes = sum(m.amount for m in obj.movements.filter(movement_type="IN"))
        expenses = sum(m.amount for m in obj.movements.filter(movement_type="OUT"))
        return obj.initial_balance + incomes - expenses

    # 1. EFECTIVO (Saldo Inicial + Ventas Efectivo - Gastos)
    def get_expected_cash(self, obj):
        sales_cash = self._get_total_by_method(obj, "CASH")
        expenses = sum(m.amount for m in obj.movements.filter(movement_type="OUT"))
        return obj.initial_balance + sales_cash - expenses

    # 2. VISA / YAPE (Todo lo que sea 'CARD')
    def get_expected_card(self, obj):
        return self._get_total_by_method(obj, "CARD")

    # 3. TRANSFERENCIA
    def get_expected_transfer(self, obj):
        return self._get_total_by_method(obj, "TRANSFER")
