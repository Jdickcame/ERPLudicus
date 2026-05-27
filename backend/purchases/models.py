from decimal import Decimal

from branches.models import Branch
from django.conf import settings
from django.db import models
from django.utils import timezone


class Area(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


# --- PRESUPUESTO BASE POR SEDE ---
class AreaBranchBudget(models.Model):
    area = models.ForeignKey(
        Area, on_delete=models.CASCADE, related_name="branch_configs"
    )
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    budget_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        unique_together = ("area", "branch")

    def __str__(self):
        return f"{self.area.name} - {self.branch.name} (S/ {self.budget_limit})"


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


# =====================================================================
# 🆕 NUEVO MODELO: ÓRDENES DE COMPRA (CABECERA) - PUNTOS 1, 2 Y 3
# =====================================================================
class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ("OPEN", "Abierta"),
        ("PARTIAL", "Parcial"),
        ("CLOSED", "Cerrado"),
        ("CANCELED", "Anulado"),
    ]

    DELIVERY_MODE_CHOICES = [
        ("STORE_PICKUP", "Recojo en Tienda"),
        ("LOCAL_DELIVERY", "Entrega en Local"),
    ]

    branch = models.ForeignKey(
        Branch, on_delete=models.PROTECT, related_name="purchase_orders"
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="purchase_orders"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    # Correlativo único y seguimiento (Punto 2)
    code = models.CharField(max_length=30, unique=True, help_text="Ej: OC-00000001")

    # Datos de la Orden (Punto 2)
    delivery_mode = models.CharField(
        max_length=20, choices=DELIVERY_MODE_CHOICES, default="LOCAL_DELIVERY"
    )
    payment_method = models.CharField(
        max_length=50, help_text="Ej: EFECTIVO, A CUENTA, TRANSFERENCIA"
    )
    payment_term = models.CharField(
        max_length=100, blank=True, null=True, help_text="Plazo de pago, Ej: 15 días"
    )

    # Estados del ciclo de vida (Punto 1)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="OPEN")
    issue_date = models.DateTimeField(default=timezone.now)

    # Totales monetarios aproximados de la cotización
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.code} - {self.supplier.name} ({self.get_status_display()})"


# =====================================================================
# 🆕 NUEVO MODELO: DETALLE DE LA ÓRDEN DE COMPRA - PUNTOS 2, 4 Y 5
# =====================================================================
class PurchaseOrderDetail(models.Model):
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="details"
    )
    product = models.ForeignKey("inventory.Product", on_delete=models.PROTECT)

    # Unidad de medida de proveedor y factor de conversión técnica (Punto 2)
    invoice_unit = models.CharField(
        max_length=50,
        default="UNIDAD",
        help_text="Unidad del proveedor (Ej: Caja, Fardo)",
    )
    units_per_package = models.DecimalField(
        max_digits=14,
        decimal_places=5,
        default=1.00,
        help_text="Conversión a stock base",
    )

    # Control de recepción física (Punto 4)
    quantity_ordered = models.DecimalField(
        max_digits=14, decimal_places=5, verbose_name="Cantidad Solicitada"
    )
    quantity_received = models.DecimalField(
        max_digits=14,
        decimal_places=5,
        default=0.00000,
        verbose_name="Cantidad Recibida",
    )

    # Valores monetarios pactados
    unit_value = models.DecimalField(
        max_digits=14, decimal_places=5, verbose_name="Valor Unitario (Sin Impuesto)"
    )
    total_value = models.DecimalField(
        max_digits=12, decimal_places=2, verbose_name="Total Línea"
    )

    # Identificador estratégico para bonificaciones/regalos a costo cero (Punto 4)
    is_bonus = models.BooleanField(
        default=False, verbose_name="Es Bonificación (Costo Cero)"
    )

    # Propiedad dinámica calculada en tiempo real para el panel (Punto 4)
    @property
    def quantity_pending(self):
        pending = self.quantity_ordered - self.quantity_received
        return pending if pending > 0 else Decimal("0.00")

    @property
    def total_inventory_units_received(self):
        return self.quantity_received * self.units_per_package

    def __str__(self):
        return f"{self.product.name} - Pedido: {self.quantity_ordered} / Recibido: {self.quantity_received}"


# --- 3. COMPRA (CABECERA MODIFICADA) ---
class Purchase(models.Model):
    COST_TYPE_CHOICES = [
        ("CF", "Costo Fijo"),
        ("CV", "Costo Variable"),
    ]
    EXTRA_TAX_TYPES = (
        ("NONE", "Ninguno"),
        ("PERCEPTION", "Percepción"),
        ("RETENTION", "Retención"),
        ("DETRACTION", "Detracción"),
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
        ("MOVILIDAD", "Movilidad"),
    )
    PAYMENT_STATUS = (
        ("PAID", "Pagado"),
        ("PENDING", "Pendiente"),
    )
    IGV_RATES = (
        (0.18, "18%"),
        (0.10, "10%"),
        (0.105, "10.5%"),
        (0.00, "0% (Exonerado/Inafecto)"),
    )
    CURRENCY_CHOICES = [
        ("PEN", "Soles (S/)"),
        ("USD", "Dólares ($)"),
    ]

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    # 👇 RELACIÓN CLAVE ASOCIADA A LA ÓRDEN DE COMPRA - PUNTO 5 👇
    # Es null=True y blank=True para que puedas registrar gastos directos sin pasar obligatoriamente por una OC.
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchases",
        help_text="Orden de Compra que originó este documento contable",
    )

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
        default="CF",
        verbose_name="Tipo de Costo",
    )

    # Fechas
    issue_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    registration_date = models.DateTimeField(auto_now_add=True)
    budget_period = models.DateField(
        verbose_name="Periodo de Presupuesto",
        default=timezone.now,
        help_text="Mes al que se cargará este gasto en el presupuesto",
    )

    # Clasificación
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
    payment_status = models.CharField(
        max_length=20, choices=PAYMENT_STATUS, default="PENDING"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["supplier", "document_type", "series", "number"],
                name="unique_supplier_purchase_document",
            )
        ]

    def save(self, *args, **kwargs):
        if not self.budget_period and self.issue_date:
            self.budget_period = self.issue_date

        if self.budget_period:
            self.budget_period = self.budget_period.replace(day=1)

        if self.currency == "PEN":
            self.exchange_rate = Decimal("1.000")
            self.total_amount_pen = self.total
        else:
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

    category = models.ForeignKey(
        "ExpenseCategory", on_delete=models.PROTECT, null=True, blank=True
    )
    area = models.ForeignKey("Area", on_delete=models.PROTECT, null=True, blank=True)

    description = models.CharField(max_length=255)

    invoice_unit = models.CharField(
        max_length=50,
        default="UNIDAD",
        blank=True,
        null=True,
        help_text="Unidad de medida según la factura física (Ej: Caja, Fardo)",
    )

    units_per_package = models.DecimalField(
        max_digits=14,
        decimal_places=5,
        default=1.00,
        help_text="Cuántas unidades base vienen en este empaque",
    )

    quantity = models.DecimalField(max_digits=14, decimal_places=5)
    unit_value = models.DecimalField(max_digits=14, decimal_places=5)
    total_value = models.DecimalField(max_digits=12, decimal_places=2)
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)

    @property
    def total_inventory_units(self):
        return self.quantity * self.units_per_package

    def __str__(self):
        return f"{self.description} - {self.total_value}"


# --- 5. AJUSTE PRESUPUESTO ---
class AreaMonthlyAdjustment(models.Model):
    area = models.ForeignKey(Area, on_delete=models.CASCADE, related_name="adjustments")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    notes = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (
            "area",
            "branch",
            "year",
            "month",
        )

    def __str__(self):
        return f"{self.area.name} ({self.branch.name}) - {self.month}/{self.year}: {self.amount}"


# --- 6. LÍMITE ESPECÍFICO POR MES ---
class AreaMonthlyLimit(models.Model):
    area = models.ForeignKey(
        Area, on_delete=models.CASCADE, related_name="monthly_limits"
    )
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = (
            "area",
            "branch",
            "year",
            "month",
        )

    def __str__(self):
        return f"Límite {self.area.name} ({self.branch.name}) {self.month}/{self.year}: {self.amount}"


# --- 7. NOTAS DE COMPRA (CRÉDITO / DÉBITO) ---
class PurchaseNote(models.Model):
    NOTE_TYPES = (
        ("07", "Nota de Crédito"),
        ("08", "Nota de Débito"),
    )

    purchase = models.ForeignKey(
        Purchase, on_delete=models.PROTECT, related_name="notes"
    )
    note_type = models.CharField(max_length=2, choices=NOTE_TYPES, default="07")
    series = models.CharField(max_length=20)
    number = models.CharField(max_length=20)
    issue_date = models.DateField(default=timezone.now)
    reason = models.CharField(max_length=255, default="Devolución / Descuento")

    affects_inventory = models.BooleanField(
        default=True,
        help_text="Marcar si esta nota implica devolver o ingresar productos físicos al almacén.",
    )

    currency = models.CharField(
        max_length=3, choices=Purchase.CURRENCY_CHOICES, default="PEN"
    )
    exchange_rate = models.DecimalField(max_digits=6, decimal_places=3, default=1.000)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_amount_pen = models.DecimalField(
        max_digits=12, decimal_places=2, default=0.00
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.currency == "PEN":
            self.exchange_rate = Decimal("1.000")
            self.total_amount_pen = self.total
        else:
            self.total_amount_pen = self.total * Decimal(str(self.exchange_rate))
        super().save(*args, **kwargs)

    def __str__(self):
        tipo = "NC" if self.note_type == "07" else "ND"
        return f"{tipo} {self.series}-{self.number} (Ref: {self.purchase.series}-{self.purchase.number})"


class PurchaseNoteDetail(models.Model):
    note = models.ForeignKey(
        PurchaseNote, related_name="details", on_delete=models.CASCADE
    )
    product = models.ForeignKey(
        "inventory.Product", on_delete=models.PROTECT, null=True, blank=True
    )
    category = models.ForeignKey(
        "ExpenseCategory", on_delete=models.PROTECT, null=True, blank=True
    )
    area = models.ForeignKey("Area", on_delete=models.PROTECT, null=True, blank=True)

    description = models.CharField(max_length=255)
    invoice_unit = models.CharField(
        max_length=50, default="UNIDAD", blank=True, null=True
    )

    units_per_package = models.DecimalField(
        max_digits=14, decimal_places=5, default=1.00
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=5, default=0.00)
    unit_value = models.DecimalField(max_digits=14, decimal_places=5, default=0.00)

    total_value = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)

    def __str__(self):
        return f"{self.quantity} x {self.description} (Nota {self.note.id})"


# --- 8. PRECIOS POR PROVEEDOR ---
class SupplierProductPrice(models.Model):
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE, related_name="product_prices"
    )
    product = models.ForeignKey(
        "inventory.Product", on_delete=models.CASCADE, related_name="supplier_prices"
    )

    unit_price = models.DecimalField(
        max_digits=14, decimal_places=5, help_text="Último precio de compra registrado"
    )

    last_purchase_date = models.DateField(
        null=True, blank=True, help_text="Fecha de la última compra a este precio"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("supplier", "product")
        verbose_name = "Precio por Proveedor"
        verbose_name_plural = "Precios por Proveedor"

    def __str__(self):
        return f"{self.supplier.name} - {self.product.name}: S/ {self.unit_price}"
