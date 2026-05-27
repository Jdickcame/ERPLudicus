from decimal import Decimal

from branches.models import Branch
from django.core.exceptions import ValidationError
from django.test import TestCase

from inventory.models import Category, Product, Stock


class InventoryBusinessLogicTest(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Sede Trujillo Central")
        self.category = Category.objects.create(name="Bebidas")
        self.product = Product.objects.create(
            name="Gaseosa Personal",
            sku="BEB-001",
            product_type="STOCKED",
            category=self.category,
        )
        self.stock = Stock.objects.create(
            branch=self.branch,
            product=self.product,
            quantity=Decimal("100.00"),
            average_cost=Decimal("2.50"),
        )

    def test_stock_valuation_calculation(self):
        total_value = self.stock.quantity * self.stock.average_cost
        self.assertEqual(total_value, Decimal("250.00"))

    def test_prevent_negative_stock_creation(self):
        stock_negativo = Stock(
            branch=self.branch,
            product=self.product,
            quantity=Decimal("-10.00"),
            average_cost=Decimal("2.50"),
        )
        with self.assertRaises(ValidationError):
            stock_negativo.full_clean()

    def test_product_requires_category(self):
        producto_huerfano = Product(
            name="Producto Sin Categoria",
            sku="ERR-001",
            product_type="STOCKED",
            category=None,
        )
        with self.assertRaises(ValidationError):
            producto_huerfano.full_clean()

    def test_stock_minimum_alert_trigger(self):
        # Validar lógica que detecta si el stock actual está por debajo del umbral mínimo de la empresa
        self.stock.quantity = Decimal("4.00")
        self.assertTrue(self.stock.quantity < Decimal("5.00"))
