# 👇 Importamos las tablas desde Compras para no romper la BD
from purchases.models import Area
from rest_framework import serializers

from .models import PaymentTransaction


class PaymentTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTransaction
        fields = "__all__"


class AreaBudgetSerializer(serializers.ModelSerializer):
    # Ya que 'Area' ahora es global, solo enviamos su ID y su Nombre al frontend.
    # Mantenemos 'area_label' por si tu frontend lo sigue usando en algún lado.
    area_label = serializers.CharField(source="name", read_only=True)

    class Meta:
        model = Area
        # 💥 Quitamos 'branch', 'budget_limit' y 'monthly_limit' porque ya no viven aquí.
        fields = ["id", "name", "area_label"]
