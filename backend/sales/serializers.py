from django.db import transaction
from rest_framework import serializers

from .models import Customer, Sale, SaleDetail, SalePayment


# --- Serializador de Cliente ---
class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"


# --- Serializador de Detalle ---
class SaleDetailSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    unit_cost = serializers.DecimalField(
        max_digits=10, decimal_places=4, read_only=True
    )

    class Meta:
        model = SaleDetail
        fields = [
            "id",
            "product",
            "product_name",
            "quantity",
            "price",
            "subtotal",
            "unit_cost",
        ]


# --- Serializador de Pagos ---
class SalePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalePayment
        fields = ["payment_method", "amount", "reference"]


# --- Serializador de Venta ---
class SaleSerializer(serializers.ModelSerializer):
    details = SaleDetailSerializer(many=True)
    payments = SalePaymentSerializer(many=True)

    # Campos informativos (Read Only)
    client_name = serializers.CharField(source="customer.name", read_only=True)
    user_name = serializers.CharField(source="user.username", read_only=True)

    # Inputs (Write Only)
    # Lo dejamos opcional para que views.py lo inyecte si falta
    branch_id = serializers.IntegerField(write_only=True, required=False)

    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Sale
        fields = [
            "id",
            "branch",
            "branch_id",
            "user",
            "user_name",
            "customer",
            "client_name",
            "date",
            "series",
            "number",  # Estos vendrán calculados desde views.py
            "total",
            "payment_method",
            "status",
            "invoice_type_code",
            "sunat_pdf_url",
            "sunat_xml_url",
            "sunat_cdr_url",
            "details",
            "payments",
        ]
        read_only_fields = ["user", "branch", "date"]
        # NOTA: Quitamos 'series' y 'number' de read_only_fields para poder escribirlos desde el ViewSet

    def create(self, validated_data):
        # 1. Extraemos datos anidados
        details_data = validated_data.pop("details")
        payments_data = validated_data.pop("payments")

        # 2. Extraemos branch_id de manera segura (si viene)
        branch_id = validated_data.pop("branch_id", None)

        # 3. Usuario actual
        user = self.context["request"].user

        # 4. Lógica Cliente Genérico (Si no viene cliente)
        customer = validated_data.get("customer")
        if not customer:
            customer, _ = Customer.objects.get_or_create(
                tax_id="00000000", defaults={"name": "PÚBLICO GENERAL", "address": "-"}
            )
            validated_data["customer"] = customer

        # 5. Calcular Payment Method (Resumen)
        if len(payments_data) > 1:
            validated_data["payment_method"] = "MIXED"
        elif len(payments_data) == 1:
            validated_data["payment_method"] = payments_data[0]["payment_method"]

        # ⚡ TRANSACCIÓN
        with transaction.atomic():
            # A. Crear la Venta (Cabecera)
            # Pasamos todos los validated_data (que ya incluyen series y number desde views.py)
            sale = Sale.objects.create(user=user, branch_id=branch_id, **validated_data)

            # B. Crear Detalles
            for detail in details_data:
                # Calculamos subtotal simple (cantidad * precio)
                # El cálculo de costos e IGV se actualiza luego en views.py
                subtotal = detail["quantity"] * detail["price"]
                SaleDetail.objects.create(sale=sale, subtotal=subtotal, **detail)

            # C. Crear Pagos
            for payment in payments_data:
                SalePayment.objects.create(sale=sale, **payment)

        return sale
