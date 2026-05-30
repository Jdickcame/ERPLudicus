from rest_framework import serializers
from rest_framework.validators import UniqueValidator

# Importamos absolutamente todos los modelos que acabamos de crear
from .models import (
    Category,
    InventoryAdjustment,
    InventoryAdjustmentDetail,
    Kardex,
    PhysicalInventory,
    PhysicalInventoryDetail,
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
    category_name = serializers.CharField(source="category.name", read_only=True)
    area_name = serializers.CharField(source="area.name", read_only=True)
    type_display = serializers.CharField(
        source="get_product_type_display", read_only=True
    )
    uom_display = serializers.CharField(
        source="get_unit_of_measure_display", read_only=True
    )

    tags_info = TagSerializer(source="tags", many=True, read_only=True)

    sku = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        validators=[
            UniqueValidator(
                queryset=Product.objects.all(),
                message="Este SKU ya está registrado en otro producto. Ingresa uno diferente o déjalo en blanco para autogenerar.",
            )
        ],
    )
    last_cost = serializers.SerializerMethodField()

    stock = serializers.SerializerMethodField()

    parent_name = serializers.CharField(
        source="parent.name", read_only=True, allow_null=True
    )
    has_variants = serializers.SerializerMethodField()

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
            "colab_price",
            "is_group",
            "parent",
            "parent_name",
            "has_variants",
            "created_at",
            "last_cost",
            "stock",
        ]

    def get_has_variants(self, obj):
        if obj.is_group:
            return obj.variants.filter(is_active=True).exists()
        return False

    def get_last_cost(self, obj):
        last_entry = (
            Kardex.objects.filter(product=obj, type="IN_PURCHASE")
            .order_by("-date")
            .first()
        )
        return float(last_entry.unit_cost) if last_entry else 0

    def get_stock(self, obj):
        request = self.context.get("request")
        branch_id = request.query_params.get("branch_id") if request else None

        if branch_id:
            stock = obj.stocks.filter(branch_id=branch_id).first()
            if stock:
                final_price = stock.selling_price if stock.selling_price else obj.price
                return {
                    "is_enabled": stock.is_active,  # 👈 Nos dice si ya está habilitado en esta sede
                    "stock_id": stock.id,
                    "quantity": float(stock.quantity),
                    "selling_price": float(stock.selling_price)
                    if stock.selling_price
                    else None,
                    "price": float(final_price),
                    "average_cost": float(stock.average_cost),
                }

        # Si no hay branch_id o no está habilitado
        return {
            "is_enabled": False,
            "stock_id": None,
            "quantity": 0,
            "selling_price": None,
            "price": float(obj.price),
            "average_cost": 0,
        }


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

    is_sellable = serializers.BooleanField(source="product.is_sellable", read_only=True)
    is_active_product = serializers.BooleanField(
        source="product.is_active", read_only=True
    )

    # Precio base del producto
    base_price = serializers.DecimalField(
        source="product.price", max_digits=10, decimal_places=2, read_only=True
    )

    # Precio de venta para esta sede (puede ser null, editable)
    selling_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )

    # Precio final que debe usar el POS
    price = serializers.SerializerMethodField()

    manage_stock = serializers.BooleanField(
        source="product.manage_stock", read_only=True
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
            "is_active_product",
            "base_price",
            "selling_price",
            "price",
            "is_active",
            "manage_stock",
            "quantity",
            "min_stock",
            "average_cost",
            "updated_at",
        ]

    def get_price(self, obj):
        # El precio final es: selling_price de la sede o el precio global
        return obj.selling_price if obj.selling_price else obj.product.price


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
    details = InventoryAdjustmentDetailSerializer(many=True)
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
        read_only_fields = ["created_by", "created_at"]

    def create(self, validated_data):
        details_data = validated_data.pop("details")

        # Creamos la cabecera (InventoryAdjustment)
        adjustment = InventoryAdjustment.objects.create(**validated_data)

        # Creamos los detalles iterando la lista que nos mandó React
        for detail in details_data:
            from .models import InventoryAdjustmentDetail  # Importación segura

            InventoryAdjustmentDetail.objects.create(adjustment=adjustment, **detail)

        return adjustment


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
    # 1. Le quitamos el read_only=True para que Django ACEPTE los productos que manda React
    details = TransferDetailSerializer(many=True)

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
        # 2. ESTO SOLUCIONA EL ERROR 400 (Django ya no te exigirá estos datos en el POST)
        read_only_fields = ["created_by", "received_by", "status", "created_at"]

    # 3. Agregamos la función create() para procesar el carrito de productos (Igual que en los ajustes)
    def create(self, validated_data):
        details_data = validated_data.pop("details")

        # Creamos la cabecera del Traslado
        transfer = Transfer.objects.create(**validated_data)

        # Recorremos el carrito y guardamos cada producto adentro de este Traslado
        from .models import TransferDetail

        for detail in details_data:
            TransferDetail.objects.create(transfer=transfer, **detail)

        return transfer


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


# --- 8. SERIALIZADORES DE TOMA DE INVENTARIO ---
class PhysicalInventoryDetailSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    product_uom = serializers.CharField(
        source="product.get_unit_of_measure_display", read_only=True
    )

    class Meta:
        model = PhysicalInventoryDetail
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "product_uom",
            "initial_stock",
            "total_inputs",
            "total_outputs",  # 👈 Las nuevas columnas de tiempo
            "system_stock",
            "unit_cost",
            "physical_stock",
            "difference",
            "action_taken",
            "action_notes",
        ]
        # Estas columnas las calcula Django, el usuario no las toca:
        read_only_fields = [
            "initial_stock",
            "total_inputs",
            "total_outputs",
            "system_stock",
            "unit_cost",
            "difference",
        ]


class PhysicalInventorySerializer(serializers.ModelSerializer):
    details = PhysicalInventoryDetailSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = PhysicalInventory
        fields = [
            "id",
            "branch",
            "branch_name",
            "reference",
            "start_date",
            "end_date",  # 👈 El rango de fechas
            "status",
            "status_display",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
            "closed_at",
            "details",
        ]
        read_only_fields = [
            "reference",
            "status",
            "created_at",
            "closed_at",
            "created_by",
        ]
