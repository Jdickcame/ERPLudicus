from django.db import models
from django.utils import timezone

# 👇 Importamos el proveedor desde el módulo de Logística/Compras
from purchases.models import Supplier


class PaymentTransaction(models.Model):
    TRANSACTION_TYPES = [
        ("PAYMENT", "Pago de Factura"),
        ("ADVANCE", "Anticipo / Saldo a Favor"),
    ]
    PAYMENT_METHODS = [
        ("CASH", "Efectivo"),
        ("TRANSFER", "Transferencia"),
        ("CHECK", "Cheque"),
        ("BALANCE", "Cruce con Saldo a Favor"),
    ]

    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE, related_name="payments"
    )

    transaction_type = models.CharField(
        max_length=20, choices=TRANSACTION_TYPES, default="PAYMENT"
    )
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHODS, default="TRANSFER"
    )

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_number = models.CharField(max_length=50, blank=True, null=True)
    payment_date = models.DateField(default=timezone.now)

    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_transaction_type_display()} - S/{self.amount}"
