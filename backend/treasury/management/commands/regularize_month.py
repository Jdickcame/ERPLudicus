from django.core.management.base import BaseCommand
from django.db import transaction

# 👇 Aquí estaba el error. Ya solo importamos Purchase.
from purchases.models import Purchase

from treasury.models import PaymentTransaction


class Command(BaseCommand):
    help = "Regulariza todas las compras de febrero marcándolas como pagadas con transferencia."

    def handle(self, *args, **kwargs):
        YEAR = 2026
        MONTH = 1

        self.stdout.write(
            self.style.WARNING(
                f"Iniciando regularización de compras de {MONTH}/{YEAR}..."
            )
        )

        # 1. Buscar compras pendientes del mes de febrero
        purchases = Purchase.objects.filter(
            issue_date__year=YEAR, issue_date__month=MONTH, payment_status="PENDING"
        )

        count = purchases.count()
        if count == 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"No hay compras pendientes en {MONTH}/{YEAR} para regularizar."
                )
            )
            return

        try:
            with transaction.atomic():
                for purchase in purchases:
                    # Obtenemos el monto a pagar (priorizando el total_net_pay)
                    amount = purchase.total_net_pay or purchase.total
                    supplier = purchase.supplier
                    doc_ref = f"{purchase.series}-{purchase.number}"

                    # 2. Crear el rastro en el nuevo módulo de Tesorería
                    PaymentTransaction.objects.create(
                        supplier=supplier,
                        transaction_type="PAYMENT",
                        payment_method="TRANSFER",
                        amount=amount,
                        transaction_number="REGULARIZACION",
                        payment_date=purchase.issue_date,
                        description=f"REGULARIZACION - Pago/Liquidación: {doc_ref}",
                    )

                    # 3. Actualizar estado de la compra a Pagado
                    purchase.payment_status = "PAID"
                    purchase.save(update_fields=["payment_status"])

                    # 4. Descontar la deuda del saldo actual del proveedor
                    if amount:
                        supplier.balance -= amount
                        supplier.save(update_fields=["balance"])

                self.stdout.write(
                    self.style.SUCCESS(
                        f"✔️ ¡Éxito! Se han regularizado {count} facturas"
                    )
                )

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Error durante la regularización: {str(e)}")
            )
