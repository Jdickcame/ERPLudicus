from decimal import Decimal

from branches.models import Branch
from django.conf import settings
from django.db import models
from django.utils import timezone


class Area(models.Model):
    name = models.CharField(max_length=100)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    budget_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return self.name


# --- 1. PROVEEDOR ---
class Supplier(models.Model):
    name = models.CharField(max_length=200)
    tax_id = models.CharField(max_length=20, unique=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    def __str__(self):
        return f"{self.name} ({self.tax_id})"


# --- 2. CATEGORÍA DE GASTO ---
class ExpenseCategory(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class SupplierTransaction(models.Model):
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_number = models.CharField(max_length=50)  # N° Operación
    created_at = models.DateTimeField(auto_now_add=True)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.transaction_number} - {self.amount}"


# --- 3. COMPRA (CABECERA) ---
class Purchase(models.Model):
    COST_TYPE_CHOICES = [
        ("CF", "Costo Fijo"),
        ("CV", "Costo Variable"),
    ]
    EXTRA_TAX_TYPES = (
        ("NONE", "Ninguno"),
        ("PERCEPTION", "Percepción"),  # Suma al total
        ("RETENTION", "Retención"),  # Resta al pago (pero no al documento)
        ("DETRACTION", "Detracción"),  # Resta al pago (va al Banco)
    )
    DOCUMENT_TYPES = (
        ("FACTURA", "Factura"),
        ("BOLETA", "Boleta"),
        ("RXH", "Recibo por Honorarios"),
        ("NOTA_VENTA", "Nota de Venta"),
        ("NOTA_CREDITO", "Nota de Crédito"),
        ("NOTA_DEBITO", "Nota de Débito"),
        ("TICKET", "Ticket"),
        ("RECIBO_DE_SERVICIOS", "Recibo de Servicios"),
        ("SIN_ESPECIFICAR", "Sin especificar"),
    )
    PAYMENT_METHOD_CHOICES = [
        ("CASH", "Efectivo"),
        ("TRANSFER", "Transferencia"),
    ]
    PAYMENT_CONDITIONS = (
        ("CASH", "Contado"),
        ("CREDIT", "Crédito"),
    )
    PAYMENT_STATUS = (
        ("PAID", "Pagado"),
        ("PENDING", "Pendiente"),
    )
    IGV_RATES = (
        (0.18, "18%"),
        (0.10, "10%"),
        (0.00, "0% (Exonerado/Inafecto)"),
    )
    CURRENCY_CHOICES = [
        ("PEN", "Soles (S/)"),
        ("USD", "Dólares ($)"),
    ]
    # ---------------------------------

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    # Documento
    document_type = models.CharField(
        max_length=20, choices=DOCUMENT_TYPES, default="FACTURA"
    )
    series = models.CharField(max_length=20, blank=True, null=True)
    number = models.CharField(max_length=20, blank=True, null=True)

    # Tipo de costo
    cost_type = models.CharField(
        max_length=2,
        choices=COST_TYPE_CHOICES,
        default="CF",  # Por defecto Costo Variable
        verbose_name="Tipo de Costo",
    )

    # Metodo de pago
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default="TRANSFER",  # Por defecto Transferencia
        verbose_name="Método de Pago",
    )

    # Fechas
    issue_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)  # Vencimiento
    registration_date = models.DateTimeField(auto_now_add=True)
    budget_period = models.DateField(
        verbose_name="Periodo de Presupuesto",
        default=timezone.now,
        help_text="Mes al que se cargará este gasto en el presupuesto",
    )

    # Clasificación
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT)
    area = models.ForeignKey(
        Area,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchases",
        verbose_name="Área",
    )
    specific_concept = models.CharField(max_length=200, blank=True, null=True)

    # Montos
    currency = models.CharField(
        max_length=3, choices=CURRENCY_CHOICES, default="PEN", verbose_name="Moneda"
    )
    exchange_rate = models.DecimalField(
        max_digits=6, decimal_places=3, default=1.000, verbose_name="Tipo de Cambio"
    )
    total_amount_pen = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Total Contable (Soles)",
    )
    tax_rate = models.DecimalField(
        max_digits=5, decimal_places=2, choices=IGV_RATES, default=0.18
    )

    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    # Pagos Extra
    extra_tax_type = models.CharField(
        max_length=20, choices=EXTRA_TAX_TYPES, default="NONE"
    )

    extra_tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)

    extra_tax_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00
    )

    total_net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    # Pagos
    payment_condition = models.CharField(
        max_length=20, choices=PAYMENT_CONDITIONS, default="CASH"
    )
    payment_status = models.CharField(
        max_length=20, choices=PAYMENT_STATUS, default="PAID"
    )
    transaction_number = models.CharField(max_length=50, blank=True, null=True)

    def save(self, *args, **kwargs):
        # 1. Lógica de Periodo
        if not self.budget_period and self.issue_date:
            self.budget_period = self.issue_date

        if self.budget_period:
            # Aseguramos que sea el día 1 del mes
            self.budget_period = self.budget_period.replace(day=1)

        # 2. Lógica de Conversión de Moneda (CORREGIDA)
        if self.currency == "PEN":
            self.exchange_rate = Decimal("1.000")
            self.total_amount_pen = self.total
        else:
            # 👇 AQUÍ ESTABA EL ERROR:
            # Convertimos el tipo de cambio a Decimal antes de multiplicar
            self.total_amount_pen = self.total * Decimal(str(self.exchange_rate))

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.document_type} {self.series}-{self.number}"


# --- 4. DETALLE DE COMPRA ---
class PurchaseDetail(models.Model):
    purchase = models.ForeignKey(
        Purchase, related_name="details", on_delete=models.CASCADE
    )
    product = models.ForeignKey(
        "inventory.Product", on_delete=models.PROTECT, null=True, blank=True
    )

    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit_value = models.DecimalField(max_digits=12, decimal_places=2)
    total_value = models.DecimalField(max_digits=12, decimal_places=2)

    # 👇 AGREGA ESTA LÍNEA AQUÍ
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)

    def __str__(self):
        return f"{self.description} - {self.total_value}"


# --- 5. AJUSTE PRESUPUESTO ---
class AreaMonthlyAdjustment(models.Model):
    area = models.ForeignKey(Area, on_delete=models.CASCADE, related_name="adjustments")
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()

    # El monto puede ser positivo (agregas saldo) o negativo (quitas saldo)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    notes = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Solo puede haber un ajuste por Área/Mes/Año (se actualiza si ya existe)
        unique_together = ("area", "year", "month")

    def __str__(self):
        return f"{self.area.name} - {self.month}/{self.year}: {self.amount}"


# --- 6. LÍMITE ESPECÍFICO POR MES (Para que no se afecten entre ellos) ---
class AreaMonthlyLimit(models.Model):
    area = models.ForeignKey(
        Area, on_delete=models.CASCADE, related_name="monthly_limits"
    )
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = ("area", "year", "month")

    def __str__(self):
        return f"Límite {self.area.name} {self.month}/{self.year}: {self.amount}"
