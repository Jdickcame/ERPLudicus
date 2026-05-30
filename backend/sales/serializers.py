from django.db import transaction
from rest_framework import serializers

from .models import CreditNote, Customer, Sale, SaleDetail, SalePayment


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


class CreditNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditNote
        fields = "__all__"
        read_only_fields = [
            "series",
            "number",
            "date",
            "json_sent",
            "json_response",
            "sunat_pdf_url",
        ]


class OfflineCustomerField(serializers.Field):
    def to_internal_value(self, data):
        # Al guardar (POST): Deja pasar el ID negativo sin hacer validaciones estrictas
        if data in [None, "", "null"]:
            return None
        return int(data)

    def to_representation(self, value):
        # Al leer el historial (GET): Convierte el objeto Customer a un número para que no crashee
        if hasattr(value, "id"):
            return value.id
        return value


# --- Serializador de Venta ---
class SaleSerializer(serializers.ModelSerializer):
    details = SaleDetailSerializer(many=True)
    payments = SalePaymentSerializer(many=True)

    # 👇 VARIABLES ANTIGUAS (Las mantenemos por retrocompatibilidad temporal) 👇
    client_name = serializers.CharField(source="customer.name", read_only=True)
    client_doc = serializers.CharField(source="customer.tax_id", read_only=True)

    # 👇 NUEVAS VARIABLES (Para que tu Historial y Ticket impriman el DNI perfecto) 👇
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_document = serializers.CharField(source="customer.tax_id", read_only=True)

    user_name = serializers.CharField(source="user.username", read_only=True)

    discount_authorized_by_name = serializers.CharField(
        source="discount_authorized_by.username", read_only=True
    )

    branch_id = serializers.IntegerField(write_only=True, required=False)
    discount_authorized_by_id = serializers.IntegerField(
        write_only=True, required=False, allow_null=True
    )

    # 🌟 EL TRUCO MAESTRO: Usamos IntegerField para engañar a la validación
    # y permitir que el ID negativo (-1718304928) llegue vivo a tu views.py 🌟
    customer = OfflineCustomerField(required=False, allow_null=True)

    credit_notes = CreditNoteSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "uuid",
            "branch",
            "branch_id",
            "user",
            "user_name",
            "customer",
            "client_name",
            "client_doc",
            "customer_name",  # <--- Añadido
            "customer_document",  # <--- Añadido
            "date",
            "series",
            "number",
            "total",
            "payment_method",
            "status",
            "discount_amount",
            "discount_reason",
            "discount_authorized_by",
            "discount_authorized_by_id",
            "discount_authorized_by_name",
            "invoice_type_code",
            "sunat_status",
            "sunat_description",
            "sunat_hash",
            "sunat_pdf_url",
            "sunat_xml_url",
            "sunat_cdr_url",
            "details",
            "payments",
            "credit_notes",
            "notes",
            "is_courtesy",
        ]
        read_only_fields = ["user", "branch", "date", "discount_authorized_by"]

    def create(self, validated_data):
        # 1. Extraemos datos anidados
        details_data = validated_data.pop("details")
        payments_data = validated_data.pop("payments")

        branch_id = validated_data.pop("branch_id", None)
        discount_authorized_by_id = validated_data.pop(
            "discount_authorized_by_id", None
        )

        if discount_authorized_by_id:
            validated_data["discount_authorized_by_id"] = discount_authorized_by_id

        user = self.context["request"].user

        # 🛡️ RED DE SEGURIDAD: Transformar el Integer en Objeto
        # Por si una venta normal entra directo sin pasar por el "Portero Inteligente"
        customer_data = validated_data.get("customer")
        if isinstance(customer_data, int):
            customer_obj = Customer.objects.filter(id=customer_data).first()
            validated_data["customer"] = customer_obj

        # Lógica Cliente Genérico (Si no viene cliente)
        if not validated_data.get("customer"):
            customer, _ = Customer.objects.get_or_create(
                tax_id="00000000", defaults={"name": "PÚBLICO GENERAL", "address": "-"}
            )
            validated_data["customer"] = customer

        # Calcular Payment Method
        if len(payments_data) > 1:
            validated_data["payment_method"] = "MIXED"
        elif len(payments_data) == 1:
            validated_data["payment_method"] = payments_data[0]["payment_method"]

        # ⚡ TRANSACCIÓN
        with transaction.atomic():
            sale = Sale.objects.create(user=user, branch_id=branch_id, **validated_data)

            for detail in details_data:
                subtotal = detail["quantity"] * detail["price"]
                SaleDetail.objects.create(sale=sale, subtotal=subtotal, **detail)

            for payment in payments_data:
                SalePayment.objects.create(sale=sale, **payment)

        return sale
