from branches.models import Branch
from django.core.exceptions import ValidationError
from django.db import models
from users.models import User

# from .utils import generate_sku # (Descomenta cuando tengas tu util)


# --- CATEGORY & PRODUCT (Se mantienen igual, están perfectos) ---
class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "Categories"


class Product(models.Model):
    PRODUCT_TYPES = (
        ("STOCKED", "Producto Almacenable (Venta)"),
        ("CONSUMABLE", "Consumible (Uso Interno)"),
        ("SERVICE", "Servicio"),
        ("ASSET", "Activo Fijo"),
    )
    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        Category, related_name="products", on_delete=models.CASCADE
    )
    product_type = models.CharField(
        max_length=20, choices=PRODUCT_TYPES, default="STOCKED"
    )
    sku = models.CharField(max_length=50, unique=True, blank=True)
    is_sellable = models.BooleanField(default=True)
    is_purchasable = models.BooleanField(default=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)  # Precio de Venta Base

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.sku:
            prefix = "VTA" if self.is_sellable else "INT"
            import uuid

            self.sku = f"{prefix}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.sku}] {self.name}"


# --- 1. MODELO STOCK (EL CEREBRO DEL POS) ---
class Stock(models.Model):
    """
    Representa el inventario físico actual en una sede específica.
    El POS consulta ESTA tabla para saber si puede vender.
    """

    product = models.ForeignKey(
        Product, related_name="stocks", on_delete=models.CASCADE
    )
    branch = models.ForeignKey(Branch, related_name="stocks", on_delete=models.CASCADE)

    quantity = models.IntegerField(default=0)

    # 🔥 DATO CRÍTICO: Costo Promedio Ponderado (CPP)
    # Se actualiza automáticamente cada vez que entra mercadería (compra o traspaso).
    # Permite calcular la ganancia real al momento de la venta sin buscar en el historial.
    average_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0.0000)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product", "branch")

    def __str__(self):
        return f"{self.product.name} en {self.branch.name}: {self.quantity} (Costo: {self.average_cost})"


# --- 2. MODELO TRANSFERENCIA (LAS ARTERIAS) ---
class Transfer(models.Model):
    """
    Agrupa el movimiento de salida de una sede y la entrada a otra.
    Garantiza que la mercadería no 'desaparezca' en el aire.
    """

    STATUS_CHOICES = (
        ("PENDING", "Pendiente de Recepción"),
        ("COMPLETED", "Completado / Recibido"),
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

    def clean(self):
        if self.origin_branch == self.destination_branch:
            raise ValidationError("La sede de origen y destino no pueden ser la misma.")


class TransferDetail(models.Model):
    transfer = models.ForeignKey(
        Transfer, related_name="details", on_delete=models.CASCADE
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()

    # Guardamos el costo al momento del envío para valorar la transferencia
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0)


# --- 3. MODELO KARDEX (LA HISTORIA FINANCIERA) ---
class Kardex(models.Model):
    """
    Log inmutable de cada movimiento. NUNCA se edita, solo se crean nuevos registros.
    Sustituye a 'InventoryMovement' pero con esteroides financieros.
    """

    MOVEMENT_TYPES = (
        ("IN_PURCHASE", "Entrada por Compra"),
        ("IN_TRANSFER", "Entrada por Traslado"),
        ("IN_ADJUSTMENT", "Entrada por Ajuste (+ Sobrante)"),
        ("OUT_SALE", "Salida por Venta"),
        ("OUT_TRANSFER", "Salida por Traslado"),
        ("OUT_INTERNAL", "Salida por Consumo Interno"),
        ("OUT_DAMAGE", "Salida por Merma/Daño"),
        ("OUT_ADJUSTMENT", "Salida por Ajuste (- Faltante)"),
    )

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    product = models.ForeignKey(
        Product, related_name="kardex_entries", on_delete=models.CASCADE
    )

    # Fecha y Hora exacta del movimiento
    date = models.DateTimeField(auto_now_add=True)

    # Tipo de movimiento
    type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)

    # Cantidad que entró o salió (+10 o -5)
    quantity = models.IntegerField()

    # 💰 DATOS FINANCIEROS DEL MOVIMIENTO (El "Costo de este movimiento")
    unit_cost = models.DecimalField(
        max_digits=12, decimal_places=4
    )  # A cuánto entró o salió
    total_cost = models.DecimalField(
        max_digits=12, decimal_places=2
    )  # quantity * unit_cost

    # 📸 SNAPSHOT (FOTO) DEL ESTADO DESPUÉS DEL MOVIMIENTO
    # Esto permite reconstruir la historia sin recalcular desde cero.
    balance_quantity = models.IntegerField()  # Cuántos quedaron en Stock
    balance_unit_cost = models.DecimalField(
        max_digits=12, decimal_places=4
    )  # Nuevo Costo Promedio
    balance_total_cost = models.DecimalField(
        max_digits=14, decimal_places=2
    )  # Valor total del inventario

    # Referencias (Opcionales pero recomendadas)
    user = models.ForeignKey(User, on_delete=models.PROTECT)

    # Campos para vincular con otros módulos (evita importaciones circulares usando strings)
    # purchase = models.ForeignKey('purchases.Purchase', null=True, blank=True...)
    # transfer = models.ForeignKey(Transfer, null=True, blank=True...)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.get_type_display()} - {self.product.sku} ({self.quantity})"
