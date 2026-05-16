from branches.models import Branch
from django.core.exceptions import ValidationError
from django.db import models
from users.models import User

from .utils import generate_sku


# --- 1. CLASIFICACIÓN ---
class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=20, default="#3B82F6")

    def __str__(self):
        return self.name


# --- 1.5 ÁREAS DE NEGOCIO (Familias para Reportes de Ingresos/Gastos) ---
class Area(models.Model):
    name = models.CharField(
        max_length=100, unique=True, help_text="Ej: Cafetería, Barra, Cocina, Limpieza"
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


# --- 2. CATÁLOGO GLOBAL DE PRODUCTOS ---
class Product(models.Model):
    PRODUCT_TYPES = (
        ("STOCKED", "Producto Almacenable"),
        ("CONSUMABLE", "Materia Prima / Insumo"),
        ("FINISHED", "Producto Terminado (Receta)"),
        ("SERVICE", "Servicio"),
    )

    UOM_CHOICES = (
        ("NIU", "Unidades (NIU)"),
        ("KGM", "Kilogramos (KGM)"),
        ("LTR", "Litros (LTR)"),
        ("MTR", "Metros (MTR)"),
        ("ZZ", "Servicio (ZZ)"),
    )

    name = models.CharField(max_length=200)
    area = models.ForeignKey(
        "purchases.Area",
        related_name="products",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    category = models.ForeignKey(
        Category, related_name="products", on_delete=models.PROTECT
    )
    tags = models.ManyToManyField(Tag, blank=True, related_name="products")

    product_type = models.CharField(
        max_length=20, choices=PRODUCT_TYPES, default="STOCKED"
    )
    unit_of_measure = models.CharField(max_length=5, choices=UOM_CHOICES, default="NIU")
    sku = models.CharField(max_length=50, unique=True, blank=True)

    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    is_active = models.BooleanField(default=True)
    is_sellable = models.BooleanField(default=True)
    is_purchasable = models.BooleanField(default=True)
    manage_stock = models.BooleanField(default=True)
    has_recipe = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # 🔥 REGLA DE NEGOCIO: SOFT DELETE
    # Si alguien intenta hacer product.delete(), solo lo inhabilitamos.
    def delete(self, *args, **kwargs):
        self.is_active = False
        self.save()
        return (
            1,
            {"inventory.Product": 1},
        )  # Simulamos la respuesta de borrado de Django

    def save(self, *args, **kwargs):
        if not self.sku:
            prefix_map = {
                "STOCKED": "PRO",
                "CONSUMABLE": "INS",
                "FINISHED": "TER",
                "SERVICE": "SRV",
            }
            prefix = prefix_map.get(self.product_type, "GEN")
            self.sku = generate_sku(prefix=prefix)

        if self.product_type == "FINISHED":
            self.has_recipe = True
            self.is_purchasable = False
        if self.product_type == "SERVICE":
            self.manage_stock = False
            self.unit_of_measure = "ZZ"

        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.sku}] {self.name}"


# --- 3. RECETA ---
class ProductRecipe(models.Model):
    finished_product = models.ForeignKey(
        Product,
        related_name="recipe_ingredients",
        on_delete=models.CASCADE,
        limit_choices_to={"has_recipe": True},
    )
    ingredient = models.ForeignKey(
        Product,
        related_name="used_in_recipes",
        on_delete=models.PROTECT,
        limit_choices_to={"manage_stock": True},
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=4)

    class Meta:
        unique_together = ("finished_product", "ingredient")


# --- 4. STOCK ACTUAL POR SEDE (El interruptor local) ---
class Stock(models.Model):
    product = models.ForeignKey(
        Product, related_name="stocks", on_delete=models.CASCADE
    )
    branch = models.ForeignKey(Branch, related_name="stocks", on_delete=models.CASCADE)

    # 🔥 REGLA DE NEGOCIO: ¿Se vende en esta sede?
    is_active = models.BooleanField(
        default=True, help_text="Habilita/Deshabilita el producto solo para esta sede"
    )

    quantity = models.DecimalField(max_digits=12, decimal_places=4, default=0.0000)

    # 🔥 REGLA DE NEGOCIO: Stock Mínimo por Sede
    min_stock = models.DecimalField(max_digits=12, decimal_places=4, default=0.0000)

    average_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0.0000)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product", "branch")
        # 🔥 REGLA DE NEGOCIO: Bloqueo en Base de Datos para evitar negativos
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gte=0), name="prevent_negative_stock"
            )
        ]

    def __str__(self):
        return f"{self.quantity} en {self.branch.name} ({self.product.name})"


# --- 5. DOCUMENTO DE AJUSTE (Mermas, etc) ---
class InventoryAdjustment(models.Model):
    ADJUSTMENT_TYPES = (
        ("MERMA_OUT", "Salida por Merma / Daño"),
        ("MERMA_RETURN", "Devolución por Merma (Reingreso)"),
        ("INTERNAL", "Consumo Interno"),
        ("ADJUST_IN", "Ajuste de Entrada (Sobrante)"),
        ("ADJUST_OUT", "Ajuste de Salida (Faltante)"),
        ("INITIAL", "Inventario Inicial"),
    )
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    type = models.CharField(max_length=20, choices=ADJUSTMENT_TYPES)
    reason = models.CharField(max_length=255)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class InventoryAdjustmentDetail(models.Model):
    adjustment = models.ForeignKey(
        InventoryAdjustment, related_name="details", on_delete=models.CASCADE
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=4)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0.0000)


# --- 6. TRASLADOS ENTRE SEDES ---
class Transfer(models.Model):
    STATUS_CHOICES = (
        ("PENDING", "Pendiente"),
        ("COMPLETED", "Completado"),
        ("CANCELLED", "Cancelado"),
    )
    origin_branch = models.ForeignKey(
        Branch, related_name="transfers_sent", on_delete=models.PROTECT
    )
    destination_branch = models.ForeignKey(
        Branch, related_name="transfers_received", on_delete=models.PROTECT
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    observation = models.TextField(blank=True)
    created_by = models.ForeignKey(
        User, related_name="created_transfers", on_delete=models.PROTECT
    )
    received_by = models.ForeignKey(
        User,
        related_name="received_transfers",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class TransferDetail(models.Model):
    transfer = models.ForeignKey(
        Transfer, related_name="details", on_delete=models.CASCADE
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=4)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0)


# --- 7. KARDEX (EL LIBRO MAYOR INMUTABLE) ---
class Kardex(models.Model):
    # 🔥 REGLA DE NEGOCIO: Tipos de Movimiento Exactos
    MOVEMENT_TYPES = (
        ("IN_PURCHASE", "Entrada por Compra"),
        ("IN_ADJUSTMENT", "Ajuste de Entrada"),
        ("IN_TRANSFER", "Transferencia de Entrada"),
        ("IN_RETURN", "Devolución por Merma"),
        ("IN_PRODUCTION", "Entrada por Producción"),
        ("OUT_SALE", "Salida por Venta"),
        ("OUT_MERMA", "Salida por Merma"),
        ("OUT_ADJUSTMENT", "Ajuste de Salida"),
        ("OUT_TRANSFER", "Transferencia de Salida"),
        ("OUT_RECIPE", "Salida por Consumo de Receta"),
        ("OUT_RETURN", "Salida por Devolución a Proveedor"),
    )

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    product = models.ForeignKey(
        Product, related_name="kardex_entries", on_delete=models.CASCADE
    )
    date = models.DateTimeField(auto_now_add=True)
    type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)

    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4)
    total_cost = models.DecimalField(max_digits=12, decimal_places=2)

    balance_quantity = models.DecimalField(max_digits=12, decimal_places=4)
    balance_unit_cost = models.DecimalField(max_digits=12, decimal_places=4)
    balance_total_cost = models.DecimalField(max_digits=14, decimal_places=2)

    user = models.ForeignKey(User, on_delete=models.PROTECT)
    reference_document = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=255, blank=True)

    # 🔥 REGLA DE NEGOCIO: INMUTABILIDAD TOTAL
    def delete(self, *args, **kwargs):
        raise ValidationError(
            "¡ALERTA CRÍTICA! El Kardex es un documento financiero inmutable. Está estrictamente prohibido eliminar registros."
        )

    def __str__(self):
        return f"{self.get_type_display()} - {self.product.sku}"
