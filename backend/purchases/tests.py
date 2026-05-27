import datetime
from decimal import Decimal

from branches.models import Branch
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from inventory.models import Category, Product

from purchases.models import Purchase, PurchaseOrder, PurchaseOrderDetail, Supplier

User = get_user_model()


class PurchaseModelsLogicTest(TestCase):
    def setUp(self):
        # 1. Arrange: Preparación exacta de modelos
        self.user = User.objects.create_user(username="admin_test", password="123")
        self.branch = Branch.objects.create(name="Sede Trujillo")
        self.supplier = Supplier.objects.create(
            name="Distribuidora", tax_id="20000000001"
        )
        self.category = Category.objects.create(name="Abarrotes")
        self.product = Product.objects.create(
            name="Galletas", product_type="STOCKED", category=self.category
        )

    # PRUEBA 1: Testear lógica de conversión de moneda
    def test_purchase_currency_exchange_calculation(self):
        purchase_usd = Purchase.objects.create(
            branch=self.branch,
            supplier=self.supplier,
            user=self.user,
            document_type="FACTURA",
            series="F001",
            number="000123",
            issue_date="2026-05-23",
            currency="USD",
            exchange_rate=Decimal("3.850"),
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("18.00"),
            total=Decimal("118.00"),
        )
        # Assert: Tu método save() debió multiplicar 118.00 x 3.850
        self.assertEqual(purchase_usd.total_amount_pen, Decimal("454.30"))

    # PRUEBA 2: Testear tu lógica del budget_period (Debe setearse al día 1 del mes)
    def test_purchase_budget_period_normalization(self):
        fecha_emision = datetime.date(2026, 5, 23)
        purchase = Purchase.objects.create(
            branch=self.branch,
            supplier=self.supplier,
            user=self.user,
            document_type="FACTURA",
            series="F002",
            number="000124",
            issue_date=fecha_emision,
            budget_period=fecha_emision,
            total=Decimal("100.00"),
            subtotal=Decimal("84.75"),
            tax_amount=Decimal("15.25"),
        )
        # Assert: Tu save() debió forzar el día al 1 (2026-05-01)
        self.assertEqual(purchase.budget_period, datetime.date(2026, 5, 1))

    # PRUEBA 3: Testear la restricción de documentos duplicados por proveedor
    def test_unique_supplier_purchase_document_constraint(self):
        # Creamos la primera factura
        Purchase.objects.create(
            branch=self.branch,
            supplier=self.supplier,
            user=self.user,
            document_type="FACTURA",
            series="F001",
            number="999999",
            issue_date="2026-05-23",
            subtotal=Decimal("10"),
            tax_amount=Decimal("1"),
            total=Decimal("11"),
        )
        # Intentamos crear la misma factura exacta (Mismo proveedor, tipo, serie y número)
        with self.assertRaises(IntegrityError):
            Purchase.objects.create(
                branch=self.branch,
                supplier=self.supplier,
                user=self.user,
                document_type="FACTURA",
                series="F001",
                number="999999",
                issue_date="2026-05-24",
                subtotal=Decimal("20"),
                tax_amount=Decimal("2"),
                total=Decimal("22"),
            )

    # PRUEBA 4: Testear tus @property en PurchaseOrderDetail
    def test_purchase_order_detail_properties(self):
        order = PurchaseOrder.objects.create(
            branch=self.branch, supplier=self.supplier, user=self.user, code="OC-001"
        )
        detail = PurchaseOrderDetail.objects.create(
            purchase_order=order,
            product=self.product,
            units_per_package=Decimal("12.00"),  # Vienen 12 galletas por caja
            quantity_ordered=Decimal("10.00"),  # Pedimos 10 cajas
            quantity_received=Decimal("4.00"),  # Solo llegaron 4
            unit_value=Decimal("5.00"),
            total_value=Decimal("50.00"),
        )
        # Asserts: Validar cálculos matemáticos
        self.assertEqual(detail.quantity_pending, Decimal("6.00"))  # 10 - 4
        self.assertEqual(
            detail.total_inventory_units_received, Decimal("48.00")
        )  # 4 * 12
