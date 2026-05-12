from django.db import transaction
from inventory.models import Product
from rest_framework import serializers

from .models import (
    Area,
    ExpenseCategory,
    Purchase,
    PurchaseDetail,
    Supplier,
    SupplierTransaction,
)


class AreaBudgetSerializer(serializers.ModelSerializer):
    # Mapeamos los campos nuevos a los nombres viejos que espera tu Frontend
    area_label = serializers.CharField(source="name")
    monthly_limit = serializers.DecimalField(
        source="budget_limit", max_digits=12, decimal_places=2
    )

    class Meta:
        model = Area
        # Incluimos tanto los nombres nuevos como los viejos para compatibilidad total
        fields = ["id", "name", "area_label", "branch", "budget_limit", "monthly_limit"]


# --- 1. Categorías de Gasto ---
class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = "__all__"


# --- 2. Proveedores ---
class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"


# --- 3. Detalle de Compra ---
class PurchaseDetailSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()

    # 👇 ESTA ES LA LÍNEA MÁGICA QUE TE FALTA
    # Permite que el producto sea opcional (para gastos como pintura/luz)
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), required=False, allow_null=True
    )

    # Definimos explícitamente los decimales
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)
    unit_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_value = serializers.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        model = PurchaseDetail
        fields = [
            "id",
            "product",  # Django buscará la definición explícita de arriba
            "product_name",
            "product_sku",
            "description",
            "quantity",
            "unit_value",
            "total_value",
            "tax_percentage",
        ]

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None

    def get_product_sku(self, obj):
        return obj.product.sku if obj.product else None


# --- 4. Compra (Cabecera) ---
class PurchaseSerializer(serializers.ModelSerializer):
    details = PurchaseDetailSerializer(many=True)

    # --- CAMPOS RELACIONADOS (AQUÍ ESTABA EL ERROR) ---
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    supplier_tax_id = serializers.CharField(source="supplier.tax_id", read_only=True)
    supplier_balance = serializers.DecimalField(
        source="supplier.balance", max_digits=12, decimal_places=2, read_only=True
    )

    # ✅ ESTA LÍNEA FALTABA: Le decimos a Django de dónde sacar el nombre de la categoría
    category_name = serializers.CharField(source="category.name", read_only=True)

    branch_id = serializers.IntegerField(write_only=True)

    # Definimos explícitamente los montos
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)

    gravado = serializers.SerializerMethodField()
    no_gravado = serializers.SerializerMethodField()

    # Pago extra
    extra_tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False
    )
    extra_tax_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False
    )
    total_net_pay = serializers.DecimalField(max_digits=12, decimal_places=2)

    perception_amount = serializers.SerializerMethodField()
    retention_amount = serializers.SerializerMethodField()
    detraction_amount = serializers.SerializerMethodField()

    class Meta:
        model = Purchase
        fields = [
            "id",
            "branch_id",
            "supplier",
            "supplier_name",
            "supplier_tax_id",
            "supplier_balance",
            "user",
            "document_type",
            "series",
            "number",
            "issue_date",
            "budget_period",
            "due_date",  # Nuevo
            "registration_date",
            "category",
            "category_name",  # Ahora sí funcionará
            "area",  # Nuevo
            "specific_concept",
            "currency",
            "exchange_rate",
            "total_amount_pen",
            "tax_rate",
            "subtotal",
            "tax_amount",
            "total",
            "extra_tax_type",
            "extra_tax_rate",
            "extra_tax_amount",
            "perception_amount",
            "retention_amount",
            "detraction_amount",
            "total_net_pay",
            "payment_condition",
            "payment_status",  # Nuevo
            "transaction_number",
            "details",
            "cost_type",
            "payment_method",
            "gravado",
            "no_gravado",
        ]
        read_only_fields = ["user", "registration_date"]

    # 👇 NUEVAS FUNCIONES PARA CALCULAR LÍNEA POR LÍNEA
    def get_gravado(self, obj):
        # Sumamos total_value de detalles que SÍ tienen impuestos (IGV > 0)
        return sum(d.total_value for d in obj.details.all() if d.tax_percentage > 0)

    def get_no_gravado(self, obj):
        # Sumamos total_value de detalles INAFECTOS/EXONERADOS (IGV == 0)
        return sum(d.total_value for d in obj.details.all() if d.tax_percentage == 0)

    def get_perception_amount(self, obj):
        return obj.extra_tax_amount if obj.extra_tax_type == "PERCEPTION" else 0

    def get_retention_amount(self, obj):
        return obj.extra_tax_amount if obj.extra_tax_type == "RETENTION" else 0

    def get_detraction_amount(self, obj):
        return obj.extra_tax_amount if obj.extra_tax_type == "DETRACTION" else 0

    def create(self, validated_data):
        details_data = validated_data.pop("details")
        branch_id = validated_data.pop("branch_id")
        user = self.context["request"].user

        # Obtenemos datos para la lógica de saldos
        supplier = validated_data.get("supplier")
        payment_status = validated_data.get("payment_status")
        total_a_pagar = validated_data.get("total_net_pay")

        with transaction.atomic():
            if supplier.balance > 0 and payment_status == "PAID":
                if supplier.balance >= total_a_pagar:
                    supplier.balance -= total_a_pagar
                else:
                    supplier.balance = 0
                supplier.save()
            # -------------------------------------------

            purchase = Purchase.objects.create(
                user=user, branch_id=branch_id, **validated_data
            )

            for detail in details_data:
                PurchaseDetail.objects.create(purchase=purchase, **detail)

        return purchase

    def update(self, instance, validated_data):
        details_data = validated_data.pop("details", None)

        # Actualizamos cabecera
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Si vienen detalles, los reemplazamos (Lógica simple de edición)
        if details_data is not None:
            instance.details.all().delete()
            for detail in details_data:
                PurchaseDetail.objects.create(purchase=instance, **detail)

        return instance


class SupplierTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierTransaction
        fields = "__all__"
