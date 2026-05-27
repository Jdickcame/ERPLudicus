from django.apps import apps
from rest_framework import serializers

from .models import CashMovement, CashRegister, CashShift


class CashRegisterSerializer(serializers.ModelSerializer):
    next_boleta_number = serializers.SerializerMethodField()
    next_factura_number = serializers.SerializerMethodField()
    next_nota_number = serializers.SerializerMethodField()
    next_ticket_number = serializers.SerializerMethodField()

    class Meta:
        model = CashRegister
        fields = [
            "id",
            "name",
            "boleta_series",
            "factura_series",
            "next_boleta_number",
            "next_factura_number",
            "next_nota_number",
            "next_ticket_number",
            "is_active",
            "allowed_categories",
            "branch",
        ]

    def get_next_boleta_number(self, obj):
        # 👇 CARGA SEGURA DENTRO DE LA FUNCIÓN 👇
        SaleModel = apps.get_model("sales", "Sale")

        last_sale = (
            SaleModel.objects.filter(series=obj.boleta_series)
            .order_by("-number")
            .first()
        )
        if last_sale and last_sale.number.isdigit():
            return int(last_sale.number) + 1
        return 1

    def get_next_factura_number(self, obj):
        # 👇 CARGA SEGURA DENTRO DE LA FUNCIÓN 👇
        SaleModel = apps.get_model("sales", "Sale")

        last_sale = (
            SaleModel.objects.filter(series=obj.factura_series)
            .order_by("-number")
            .first()
        )
        if last_sale and last_sale.number.isdigit():
            return int(last_sale.number) + 1
        return 1

    def get_next_nota_number(self, obj):
        SaleModel = apps.get_model("sales", "Sale")
        serie = getattr(obj, "nota_series", "NV01")
        last_sale = SaleModel.objects.filter(series=serie).order_by("-number").first()
        if last_sale and last_sale.number.isdigit():
            return int(last_sale.number) + 1
        return 1

    def get_next_ticket_number(self, obj):
        SaleModel = apps.get_model("sales", "Sale")
        serie = getattr(obj, "ticket_series", "TK01")
        last_sale = SaleModel.objects.filter(series=serie).order_by("-number").first()
        if last_sale and last_sale.number.isdigit():
            return int(last_sale.number) + 1
        return 1


class CashMovementSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True)
    authorized_by_name = serializers.CharField(
        source="authorized_by.first_name", read_only=True
    )

    class Meta:
        model = CashMovement
        fields = "__all__"
        read_only_fields = ["user", "shift", "authorized_by"]


class CashShiftSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True)
    register_name = serializers.CharField(source="cash_register.name", read_only=True)

    current_balance = serializers.SerializerMethodField()
    expected_cash = serializers.SerializerMethodField()
    expected_card = serializers.SerializerMethodField()
    expected_transfer = serializers.SerializerMethodField()
    expected_pago_link = serializers.SerializerMethodField()  # 👇 NUEVO: Pago Link

    class Meta:
        model = CashShift
        fields = [
            "id",
            "uuid",
            "is_synced",
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
            "expected_pago_link",  # 👇 NUEVO EN LOS CAMPOS
        ]
        read_only_fields = [
            "user",
            "opened_at",
            "closed_at",
            "final_balance_system",
            "difference",
            "status",
        ]

    # Helper para obtener las ventas cacheadas (prefetch_related)
    def _get_cached_sales(self, obj):
        # Usamos try/except suave para evitar errores si cambia el nombre de la relación
        try:
            return obj.sale_set.all()
        except AttributeError:
            try:
                return obj.sales.all()
            except AttributeError:
                return []

    def get_current_balance(self, obj):
        incomes = sum(m.amount for m in obj.movements.all() if m.movement_type == "IN")
        expenses = sum(
            m.amount for m in obj.movements.all() if m.movement_type == "OUT"
        )
        return obj.initial_balance + incomes - expenses

    def get_expected_cash(self, obj):
        sales_cash = sum(
            payment.amount
            for sale in self._get_cached_sales(obj)
            if sale.status == "COMPLETED"
            for payment in sale.payments.all()
            if getattr(payment, "payment_method", None) == "CASH"
        )

        manual_deposits = sum(
            m.amount
            for m in obj.movements.all()
            if m.movement_type == "IN" and m.concept == "DEPOSIT"
        )

        expenses = sum(
            m.amount
            for m in obj.movements.all()
            if m.movement_type == "OUT" and m.concept != "REFUND"
        )

        return obj.initial_balance + sales_cash + manual_deposits - expenses

    def get_expected_card(self, obj):
        return sum(
            payment.amount
            for sale in self._get_cached_sales(obj)
            if sale.status == "COMPLETED"
            for payment in sale.payments.all()
            if getattr(payment, "payment_method", None) == "CARD"
        )

    def get_expected_transfer(self, obj):
        return sum(
            payment.amount
            for sale in self._get_cached_sales(obj)
            if sale.status == "COMPLETED"
            for payment in sale.payments.all()
            if getattr(payment, "payment_method", None) == "TRANSFER"
        )

    # 👇 NUEVA FUNCIÓN MATEMÁTICA PARA PAGO LINK 👇
    def get_expected_pago_link(self, obj):
        return sum(
            payment.amount
            for sale in self._get_cached_sales(obj)
            if sale.status == "COMPLETED"
            for payment in sale.payments.all()
            if getattr(payment, "payment_method", None) == "PAGO_LINK"
        )
