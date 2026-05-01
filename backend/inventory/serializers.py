from rest_framework import serializers

# 👇 1. IMPORTACIONES CORREGIDAS (Adiós InventoryMovement, Hola Kardex)
from .models import Category, Kardex, Product, Stock


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    # sku es read_only porque se autogenera en el modelo si viene vacío
    sku = serializers.CharField(read_only=True)

    last_cost = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "category",
            "category_name",
            "price",
            "product_type",
            "is_sellable",
            "is_purchasable",
            "created_at",
            "last_cost",
        ]

    def get_last_cost(self, obj):
        # Buscamos el último movimiento de "Entrada por Compra" en el Kardex
        last_entry = (
            Kardex.objects.filter(product=obj, type="IN_PURCHASE")
            .order_by("-date")
            .first()
        )

        # Si existe, retornamos su costo unitario. Si no, 0.
        if last_entry:
            return last_entry.unit_cost
        return 0


# --- STOCK SERIALIZER (Actualizado para POS) ---
class StockSerializer(serializers.ModelSerializer):
    # Campos extra para mostrar nombres en lugar de solo IDs
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    category_name = serializers.CharField(
        source="product.category.name", read_only=True
    )

    class Meta:
        model = Stock
        fields = [
            "id",
            "branch",
            "branch_name",
            "product",
            "product_name",
            "product_sku",
            "category_name",
            "quantity",
            "average_cost",  # 👈 NUEVO: Vital para calcular ganancias en el POS
            "updated_at",
        ]


# --- 👇 NUEVO: KARDEX SERIALIZER (Reemplaza a InventoryMovement) ---
class KardexSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    user_name = serializers.CharField(source="user.username", read_only=True)

    # Formateamos el tipo de movimiento para que se lea bonito en el Frontend
    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = Kardex
        fields = [
            "id",
            "date",
            "type",
            "type_display",  # Ej: "Entrada por Compra"
            "branch",
            "branch_name",
            "product",
            "product_name",
            "quantity",
            "unit_cost",  # A cuánto entró/salió
            "total_cost",  # Costo total del movimiento
            "balance_quantity",  # Cuánto quedó después
            "user_name",
            "description",
        ]
