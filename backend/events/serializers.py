from django.db.models import Sum
from rest_framework import serializers

from .models import Event, EventRegistration


class EventSerializer(serializers.ModelSerializer):
    registered_count = serializers.SerializerMethodField()
    total_gross = serializers.SerializerMethodField()
    total_net = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = "__all__"

    def get_registered_count(self, obj):
        return obj.registrations.count()

    def get_total_gross(self, obj):
        # Total Bruto (Suma de los totales de las ventas)
        total = obj.registrations.aggregate(t=Sum("sale__total"))["t"]
        return total or 0.00

    def get_total_net(self, obj):
        # Total Neto (Suma de la base imponible / gravada)
        neto = obj.registrations.aggregate(n=Sum("sale__total_gravada"))["n"]
        return neto or 0.00


class EventRegistrationSerializer(serializers.ModelSerializer):
    client_name = serializers.SerializerMethodField()
    client_doc = serializers.SerializerMethodField()
    ticket_details = serializers.SerializerMethodField()
    payment_method = serializers.SerializerMethodField()

    class Meta:
        model = EventRegistration
        fields = "__all__"

    # 1. Obtenemos el nombre del modelo Customer real
    def get_client_name(self, obj):
        if obj.sale and obj.sale.customer:
            return obj.sale.customer.name
        return "Público General"

    # 2. Obtenemos el DNI del modelo Customer real
    def get_client_doc(self, obj):
        if obj.sale and obj.sale.customer:
            return obj.sale.customer.tax_id
        return "S/N"

    # 3. (Mantenemos tu función de detalles intacta)
    def get_ticket_details(self, obj):
        detalles = obj.sale.details.all()
        resultado = []
        breakdown = obj.redeemed_breakdown or {}

        for d in detalles:
            if d.product.category and d.product.category.name.upper() == "BOLETERÍA":
                prod_id_str = str(d.product.id)
                ya_canjeados = breakdown.get(prod_id_str, 0)

                resultado.append(
                    {
                        "product_id": d.product.id,
                        "product_name": d.product.name,
                        "quantity": int(d.quantity),
                        "redeemed": int(ya_canjeados),
                        "available": int(d.quantity) - int(ya_canjeados),
                    }
                )
        return resultado

    def get_payment_method(self, obj):
        if obj.sale:
            payment = obj.sale.payments.first()
            return payment.payment_method if payment else "N/A"
        return "N/A"
