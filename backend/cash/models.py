from branches.models import Branch
from django.conf import settings
from django.db import models


class CashRegister(models.Model):
    """
    Representa el 'Punto de Venta' físico o lógico.
    Ej: 'Caja Principal', 'Caja Barra', 'Caja Delivery'.
    """

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} - {self.branch.name}"


class CashShift(models.Model):
    """
    Representa un TURNO o SESIÓN de caja.
    Empieza cuando el cajero hace 'Apertura' y termina con el 'Cierre'.
    """

    STATUS_CHOICES = [
        ("OPEN", "Abierta"),
        ("CLOSED", "Cerrada"),
    ]

    cash_register = models.ForeignKey(CashRegister, on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    # Fechas
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # Dinero
    initial_balance = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name="Saldo Inicial"
    )

    # Estos se llenan al cerrar caja:
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
    Cualquier entrada o salida de dinero de la caja.
    Puede ser automática (Ventas) o manual (Gastos, Retiros).
    """

    TYPE_CHOICES = [
        ("IN", "Ingreso"),
        ("OUT", "Egreso"),
    ]

    CONCEPT_CHOICES = [
        ("SALE", "Venta"),  # Automático
        ("EXPENSE", "Gasto/Compra"),  # Manual (Sacas plata para comprar algo)
        ("DEPOSIT", "Ingreso Manual"),  # Manual (Metes cambio)
        ("WITHDRAWAL", "Retiro/Sangría"),  # Manual (El dueño se lleva plata)
    ]

    shift = models.ForeignKey(
        CashShift, related_name="movements", on_delete=models.CASCADE
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    movement_type = models.CharField(max_length=5, choices=TYPE_CHOICES)
    concept = models.CharField(max_length=20, choices=CONCEPT_CHOICES)
    description = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    # Opcional: Vincular a una venta específica si viene de ahí
    related_sale = models.ForeignKey(
        "sales.Sale", null=True, blank=True, on_delete=models.SET_NULL
    )

    def __str__(self):
        return f"{self.get_movement_type_display()} - {self.amount}"
