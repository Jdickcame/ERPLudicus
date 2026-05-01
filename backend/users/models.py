from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Administrador"
        MANAGER = "MANAGER", "Gerente"
        EMPLOYEE = "EMPLOYEE", "Empleado"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPLOYEE)

    # 👇 NUEVO: Relación con la Sede
    # Usamos 'branches.Branch' (string) para evitar líos si branches importa users
    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    # 1. USUARIOS
    can_view_users = models.BooleanField(
        default=False, verbose_name="Usuarios: Gestión"
    )

    # 2. VENTAS (Desglosado)
    can_view_pos = models.BooleanField(
        default=False, verbose_name="Ventas: Punto de Venta"
    )
    can_view_sales_list = models.BooleanField(
        default=False, verbose_name="Ventas: Historial"
    )

    can_view_cash = models.BooleanField(default=False, verbose_name="Ver Caja")

    # 3. INVENTARIO (Desglosado)
    can_view_products_list = models.BooleanField(
        default=False, verbose_name="Inventario: Lista"
    )
    can_view_products_create = models.BooleanField(
        default=False, verbose_name="Inventario: Nuevo Producto"
    )

    # 4. COMPRAS (Desglosado Total)
    can_view_purchases_create = models.BooleanField(
        default=False, verbose_name="Compras: Nueva"
    )
    can_view_purchases_list = models.BooleanField(
        default=False, verbose_name="Compras: Historial"
    )
    can_view_purchases_payable = models.BooleanField(
        default=False, verbose_name="Compras: Por Pagar"
    )
    can_view_purchases_balances = models.BooleanField(
        default=False, verbose_name="Compras: Saldos"
    )
    can_view_purchases_suppliers = models.BooleanField(
        default=False, verbose_name="Compras: Proveedores"
    )
    can_view_purchases_budgets = models.BooleanField(
        default=False, verbose_name="Compras: Presupuestos"
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    # ADMIN: Activa todo automáticamente
    def save(self, *args, **kwargs):
        if self.role == "ADMIN":
            for field in self._meta.fields:
                if field.name.startswith("can_view_"):
                    setattr(self, field.name, True)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.get_role_display()})"
