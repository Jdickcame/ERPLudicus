import uuid  # 👈 Importante para el modo offline

from branches.models import Branch
from django.conf import settings
from django.db import models

# 👇 IMPORTACIÓN NECESARIA PARA LAS CATEGORÍAS 👇
from inventory.models import Category


class CashRegister(models.Model):
    """
    Representa el 'Punto de Venta' físico o lógico.
    Ej: 'Caja Barra' (Usa B001/F001), 'Caja Delivery' (Usa B002/F002).
    """

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    name = models.CharField(max_length=50)

    # Series independientes por caja
    boleta_series = models.CharField(
        max_length=4, default="B001", help_text="Ej: B001, B002"
    )
    factura_series = models.CharField(
        max_length=4, default="F001", help_text="Ej: F001, F002"
    )

    # 👇 EL CANDADO: Relación con Categorías 👇
    allowed_categories = models.ManyToManyField(
        Category,
        blank=True,
        help_text="Selecciona qué categorías se pueden vender aquí. Si lo dejas vacío, vende todo.",
    )
    # 👆 ----------------------------------- 👆

    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} - {self.branch.name} ({self.boleta_series}/{self.factura_series})"


class CashShift(models.Model):
    """
    Representa un TURNO o SESIÓN de caja.
    """

    STATUS_CHOICES = [
        ("OPEN", "Abierta"),
        ("CLOSED", "Cerrada"),
    ]

    # CAMPOS OFFLINE
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    is_synced = models.BooleanField(default=True)

    cash_register = models.ForeignKey(CashRegister, on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    # Fechas
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # Dinero (Control de la Gaveta Física)
    initial_balance = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name="Saldo Inicial"
    )

    final_balance_system = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Saldo Calculado por Sistema",
    )
    final_balance_real = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Saldo Real (Arqueo)",
    )
    difference = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name="Diferencia (Sobrante/Faltante)",
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="OPEN")

    def __str__(self):
        return f"Caja #{self.id} | {self.user.username} | {self.status}"


class CashMovement(models.Model):
    """
    Cualquier entrada o salida de dinero de la gaveta de efectivo.
    """

    TYPE_CHOICES = [
        ("IN", "Ingreso"),
        ("OUT", "Egreso"),
    ]

    CONCEPT_CHOICES = [
        ("SALE", "Venta Efectivo"),  # Automático
        ("EXPENSE", "Gasto/Compra"),  # Manual (Sacas plata para comprar algo)
        ("DEPOSIT", "Ingreso Manual"),  # Manual (Metes sencillo/sencillo)
        ("WITHDRAWAL", "Retiro/Sangría"),  # Manual (El dueño se lleva efectivo)
        ("REFUND", "Devolución"),  # Automático (Nota de crédito en efectivo)
    ]

    # CAMPOS OFFLINE
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    is_synced = models.BooleanField(default=True)

    shift = models.ForeignKey(
        CashShift, related_name="movements", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_movements",
    )

    # SEGURIDAD TIPO ALOHA: ¿Quién autorizó sacar plata de la caja?
    authorized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="authorized_cash_movements",
        help_text="Usuario supervisor que autorizó el movimiento manual mediante PIN",
    )

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    movement_type = models.CharField(max_length=5, choices=TYPE_CHOICES)
    concept = models.CharField(max_length=20, choices=CONCEPT_CHOICES)
    description = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    related_sale = models.ForeignKey(
        "sales.Sale", null=True, blank=True, on_delete=models.SET_NULL
    )

    def __str__(self):
        return f"{self.get_movement_type_display()} - {self.amount}"
