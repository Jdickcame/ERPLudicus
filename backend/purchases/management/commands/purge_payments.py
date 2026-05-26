from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce

from purchases.models import Purchase, PurchaseNote, Supplier, SupplierTransaction


class Command(BaseCommand):
    help = "Purga todos los pagos y recalcula la deuda real de los proveedores"

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.WARNING("Iniciando la Gran Purga Contable..."))

        try:
            with transaction.atomic():
                # 1. BORRAR TODAS LAS TRANSACCIONES (PAGOS, ADELANTOS, ETC)
                deleted_txs, _ = SupplierTransaction.objects.all().delete()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✔️ Se eliminaron {deleted_txs} transacciones de pago."
                    )
                )

                # 2. RESETEAR TODAS LAS COMPRAS A "PENDIENTE"
                updated_purchases = Purchase.objects.update(payment_status="PENDING")
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✔️ Se resetearon {updated_purchases} compras a estado PENDING."
                    )
                )

                # 3. RECALCULAR SALDOS DE PROVEEDORES
                suppliers = Supplier.objects.all()
                for supplier in suppliers:
                    # Sumar todas las compras (Deuda)
                    total_purchases = Purchase.objects.filter(
                        supplier=supplier
                    ).aggregate(total=Coalesce(Sum("total_net_pay"), Decimal("0.00")))[
                        "total"
                    ]

                    # Sumar Notas de Débito (Aumenta Deuda)
                    notes_08 = PurchaseNote.objects.filter(
                        purchase__supplier=supplier, note_type="08"
                    ).aggregate(
                        total=Coalesce(Sum("total_amount_pen"), Decimal("0.00"))
                    )["total"]

                    # Sumar Notas de Crédito (Disminuye Deuda)
                    notes_07 = PurchaseNote.objects.filter(
                        purchase__supplier=supplier, note_type="07"
                    ).aggregate(
                        total=Coalesce(Sum("total_amount_pen"), Decimal("0.00"))
                    )["total"]

                    # La matemática real sin pagos: (Compras + ND) - NC
                    real_balance = (total_purchases + notes_08) - notes_07

                    supplier.balance = real_balance
                    supplier.save()

                self.stdout.write(
                    self.style.SUCCESS(
                        f"✔️ Saldos de {suppliers.count()} proveedores recalculados con éxito."
                    )
                )

            self.stdout.write(
                self.style.SUCCESS(
                    "\n🎉 ¡FASE 1 COMPLETADA! Base de datos limpia y lista para la nueva arquitectura."
                )
            )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"❌ Error durante la purga: {str(e)}"))
