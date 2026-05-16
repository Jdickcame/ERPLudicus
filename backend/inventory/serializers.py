from rest_framework import serializers

# Importamos absolutamente todos los modelos que acabamos de crear
from .models import (
    Category,
    InventoryAdjustment,
    InventoryAdjustmentDetail,
    Kardex,
    Product,
    ProductRecipe,
    Stock,
    Tag,
    Transfer,
    TransferDetail,
)


# --- 1. CATEGORÍAS Y ETIQUETAS ---
class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = "__all__"


# --- 2. CATÁLOGO DE PRODUCTOS ---
class ProductSerializer(serializers.ModelSerializer):
    # Nombres legibles para el frontend
    category_name = serializers.CharField(source="category.name", read_only=True)
    area_name = serializers.CharField(source="area.name", read_only=True)
    type_display = serializers.CharField(
        source="get_product_type_display", read_only=True
    )
    uom_display = serializers.CharField(
        source="get_unit_of_measure_display", read_only=True
    )

    # Para leer las etiquetas con sus colores en el frontend (Lectura)
    tags_info = TagSerializer(source="tags", many=True, read_only=True)

    sku = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    last_cost = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "area",
            "area_name",
            "category",
            "category_name",
            "tags",
            "tags_info",
            "product_type",
            "type_display",
            "unit_of_measure",
            "uom_display",
            "price",
            "is_active",
            "is_sellable",
            "is_purchasable",
            "manage_stock",
            "has_recipe",
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
        return last_entry.unit_cost if last_entry else 0


# --- 3. RECETAS (LISTA DE MATERIALES) ---
class ProductRecipeSerializer(serializers.ModelSerializer):
    # Para que en React veas "Pan para Hamburguesa" en vez de solo "ID 5"
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True)
    ingredient_sku = serializers.CharField(source="ingredient.sku", read_only=True)
    ingredient_uom = serializers.CharField(
        source="ingredient.get_unit_of_measure_display", read_only=True
    )

    class Meta:
        model = ProductRecipe
        fields = [
            "id",
            "finished_product",
            "ingredient",
            "ingredient_name",
            "ingredient_sku",
            "ingredient_uom",
            "quantity",
        ]


# --- 4. STOCK ACTUAL (EL CEREBRO DEL POS) ---
class StockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_uom = serializers.CharField(
        source="product.get_unit_of_measure_display", read_only=True
    )
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    category_name = serializers.CharField(
        source="product.category.name", read_only=True
    )

    # Información extra del producto que el POS necesita rápido
    is_sellable = serializers.BooleanField(source="product.is_sellable", read_only=True)
    price = serializers.DecimalField(
        source="product.price", max_digits=10, decimal_places=2, read_only=True
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
            "product_uom",
            "category_name",
            "is_sellable",
            "price",
            "is_active",
            "quantity",
            "min_stock",
            "average_cost",
            "updated_at",
        ]


# --- 5. AJUSTES DE INVENTARIO (MERMAS Y SOBRANTES) ---
class InventoryAdjustmentDetailSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_uom = serializers.CharField(
        source="product.get_unit_of_measure_display", read_only=True
    )

    class Meta:
        model = InventoryAdjustmentDetail
        fields = [
            "id",
            "adjustment",
            "product",
            "product_name",
            "product_sku",
            "product_uom",
            "quantity",
            "unit_cost",
        ]
        read_only_fields = ["adjustment"]


class InventoryAdjustmentSerializer(serializers.ModelSerializer):
    details = InventoryAdjustmentDetailSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )
    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = InventoryAdjustment
        fields = [
            "id",
            "branch",
            "branch_name",
            "type",
            "type_display",
            "reason",
            "created_by",
            "created_by_name",
            "created_at",
            "details",
        ]


# --- 6. TRASLADOS DE ALMACÉN ---
class TransferDetailSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = TransferDetail
        fields = [
            "id",
            "transfer",
            "product",
            "product_name",
            "product_sku",
            "quantity",
            "unit_cost",
        ]
        read_only_fields = ["transfer"]


class TransferSerializer(serializers.ModelSerializer):
    details = TransferDetailSerializer(many=True, read_only=True)
    origin_branch_name = serializers.CharField(
        source="origin_branch.name", read_only=True
    )
    destination_branch_name = serializers.CharField(
        source="destination_branch.name", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )

    class Meta:
        model = Transfer
        fields = [
            "id",
            "origin_branch",
            "origin_branch_name",
            "destination_branch",
            "destination_branch_name",
            "status",
            "status_display",
            "observation",
            "created_by",
            "created_by_name",
            "received_by",
            "created_at",
            "details",
        ]


# --- 7. KARDEX ---
class KardexSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    uom_display = serializers.CharField(
        source="product.get_unit_of_measure_display", read_only=True
    )
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    user_name = serializers.CharField(source="user.username", read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = Kardex
        fields = [
            "id",
            "date",
            "type",
            "type_display",
            "branch",
            "branch_name",
            "product",
            "product_name",
            "uom_display",
            "quantity",
            "unit_cost",
            "total_cost",
            "balance_quantity",
            "balance_unit_cost",
            "balance_total_cost",
            "user",
            "user_name",
            "reference_document",
            "description",
        ]
