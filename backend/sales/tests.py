from decimal import Decimal

from branches.models import Branch
from django.contrib.auth import get_user_model
from django.test import TestCase
from inventory.models import Category, Product

from sales.models import Customer, Sale, SaleDetail

User = get_user_model()


class SalesModelsLogicTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="cajero_test", password="123")
        self.branch = Branch.objects.create(name="Sede Trujillo")
        self.category = Category.objects.create(name="Taquilla")
        self.product = Product.objects.create(
            name="Entrada VIP",
            product_type="STOCKED",
            price=Decimal("50.00"),
            category=self.category,
        )
        self.customer = Customer.objects.create(
            name="Juan Perez", document_type="DNI", tax_id="12345678"
        )

    # PRUEBA 1: Validar metodo save()
    def test_sale_detail_calculates_subtotal_automatically(self):
        sale = Sale.objects.create(
            branch=self.branch, user=self.user, total=Decimal("150.00")
        )

        detail = SaleDetail(
            sale=sale,
            product=self.product,
            quantity=Decimal("3.00"),
            price=Decimal("50.00"),
            subtotal=Decimal("0.00"),
        )
        detail.save()

        # Assert: 3 x 50 = 150
        self.assertEqual(detail.subtotal, Decimal("150.00"))

    # PRUEBA 2: Validar generación del UUID en ventas para modo Offline
    def test_sale_generates_valid_uuid_for_offline_sync(self):
        sale = Sale.objects.create(
            branch=self.branch, user=self.user, total=Decimal("10.00")
        )

        # Validar que se ha generado un string UUID único
        self.assertIsNotNone(sale.uuid)
        self.assertEqual(len(str(sale.uuid)), 36)

    # PRUEBA 3: Validar string format (__str__) cuando hay cliente y cuando no hay (Público General)
    def test_sale_string_representation(self):
        # Venta con cliente
        sale_with_customer = Sale.objects.create(
            branch=self.branch,
            user=self.user,
            customer=self.customer,
            series="B001",
            number="0001",
            total=Decimal("50.00"),
        )
        self.assertEqual(str(sale_with_customer), "B001-0001 | Juan Perez | 50.00")

        # Venta sin cliente
        sale_no_customer = Sale.objects.create(
            branch=self.branch,
            user=self.user,
            series="B001",
            number="0002",
            total=Decimal("50.00"),
        )
        self.assertEqual(str(sale_no_customer), "B001-0002 | Público General | 50.00")
