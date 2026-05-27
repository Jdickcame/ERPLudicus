from branches.models import Branch
from django.conf import settings
from django.db import models
from inventory.models import Product

# 1. MOVEMOS LAS CONSTANTES AFUERA PARA EVITAR ERRORES DE REFERENCIA
PAYMENT_METHODS = [
    ("CASH", "Efectivo"),
    ("CARD", "Visa / Yape"),
    ("TRANSFER", "Transferencia"),
    ("MIXED", "Pago Mixto"),
    (
        "COURTESY",
        "Cortesía (Costo Cero)",
    ),
]

DOCUMENT_TYPE_CHOICES = [
    ("DNI", "DNI"),
    ("RUC", "RUC"),
]

STATUS_CHOICES = [
    ("COMPLETED", "Completada"),
    ("CANCELED", "Anulada"),
]

INVOICE_STATUS_CHOICES = [
    ("PENDING", "Pendiente"),
    ("SENT", "Enviado"),
    ("ACCEPTED", "Aceptado"),
    ("REJECTED", "Rechazado"),
]


class Customer(models.Model):
    name = models.CharField(max_length=200, verbose_name="Nombre / Razón Social")
    document_type = models.CharField(
        max_length=10, choices=DOCUMENT_TYPE_CHOICES, default="DNI"
    )
    tax_id = models.CharField(
        max_length=20, unique=True, verbose_name="Documento (DNI/RUC)"
    )
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.tax_id})"


class Sale(models.Model):
    # --- RELACIONES ---
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    notes = models.CharField(max_length=255, blank=True, null=True)

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    is_synced = models.BooleanField(
        default=True
    )  # True si se hizo online, False si vino del modo Offline

    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, null=True, blank=True
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales_made"
    )

    authorized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="authorized_courtesies",
    )

    is_courtesy = models.BooleanField(default=False)

    # --- DATOS GENERALES ---
    date = models.DateTimeField(auto_now_add=True)
    series = models.CharField(max_length=4, default="B001")
    number = models.CharField(max_length=8, default="00000000")

    # --- TOTALES ---
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Este campo queda como referencia rápida (Resumen)
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHODS, default="CASH"
    )

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="COMPLETED"
    )

    # ======================================================================
    # 🔹 CAMPOS FACTURACIÓN ELECTRÓNICA (SUNAT)
    # ======================================================================
    total_gravada = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_igv = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_exonerada = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_inafecta = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # 01: Factura, 03: Boleta, 07: Nota Crédito, 99: Ticket Interno (Lo usaremos para Cortesías)
    invoice_type_code = models.CharField(max_length=2, default="03")

    sunat_status = models.CharField(
        max_length=20,
        choices=INVOICE_STATUS_CHOICES,
        default="PENDING",
    )
    sunat_response_code = models.CharField(max_length=10, null=True, blank=True)
    sunat_description = models.TextField(null=True, blank=True)
    sunat_hash = models.CharField(max_length=255, null=True, blank=True)
    sunat_xml_url = models.TextField(null=True, blank=True)
    sunat_cdr_url = models.TextField(null=True, blank=True)
    sunat_pdf_url = models.TextField(null=True, blank=True)

    json_sent = models.JSONField(null=True, blank=True)

    def __str__(self):
        client_name = self.customer.name if self.customer else "Público General"
        return f"{self.series}-{self.number} | {client_name} | {self.total}"


class SalePayment(models.Model):
    sale = models.ForeignKey(Sale, related_name="payments", on_delete=models.CASCADE)

    # Usamos la constante global PAYMENT_METHODS
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reference = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"{self.payment_method}: {self.amount}"


class SaleDetail(models.Model):
    sale = models.ForeignKey(Sale, related_name="details", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)

    def save(self, *args, **kwargs):
        # Convertimos a float para calcular y luego Django lo guarda como Decimal
        self.subtotal = self.quantity * self.price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"


class CreditNote(models.Model):
    # Tipos de Nota según SUNAT
    TYPE_CHOICES = [
        ("07", "NOTA DE CRÉDITO"),
        ("08", "NOTA DE DÉBITO"),
    ]

    # Motivos comunes de Nota de Crédito (Catálogo 09 SUNAT)
    MOTIVOS = [
        ("01", "ANULACION DE LA OPERACION"),
        ("07", "DEVOLUCION POR ITEM"),
        ("13", "CORRECCION POR ERROR EN LA DESCRIPCION"),
    ]

    sale = models.ForeignKey(
        Sale, on_delete=models.PROTECT, related_name="credit_notes"
    )

    # Serie: FC01 (para Facturas) o BC01 (para Boletas)
    series = models.CharField(max_length=4)
    number = models.CharField(max_length=8)

    note_type = models.CharField(
        max_length=2, choices=TYPE_CHOICES, default="07"
    )  # 07=Crédito
    reason_code = models.CharField(max_length=2, choices=MOTIVOS, default="01")
    description = models.CharField(max_length=255, default="ANULACION DE LA OPERACION")

    date = models.DateTimeField(auto_now_add=True)

    # Auditoría API
    json_sent = models.JSONField(null=True, blank=True)
    json_response = models.JSONField(null=True, blank=True)

    sunat_status = models.CharField(max_length=20, null=True, blank=True)
    sunat_description = models.TextField(
        null=True, blank=True
    )  # Este está perfecto (TextField no tiene límite)

    sunat_hash = models.TextField(null=True, blank=True)
    sunat_xml_url = models.TextField(null=True, blank=True)
    sunat_cdr_url = models.TextField(null=True, blank=True)
    sunat_pdf_url = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"{self.series}-{self.number}"
