from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["role"] = user.role
        token["username"] = user.username

        # 👇 ESTRUCTURA ORDENADA PARA EL FRONTEND
        token["permissions"] = {
            "users": user.can_view_users,
            # 👇 ¡AQUÍ ESTABA EL FALTANTE!
            # Agregamos 'cash' al token para que el PermissionRoute lo lea
            "cash": user.can_view_cash,
            "sales": {
                "pos": user.can_view_pos,
                "list": user.can_view_sales_list,
            },
            "inventory": {
                "list": user.can_view_products_list,
                "create": user.can_view_products_create,
            },
            "purchases": {
                "create": user.can_view_purchases_create,
                "list": user.can_view_purchases_list,
                "payable": user.can_view_purchases_payable,
                "balances": user.can_view_purchases_balances,
                "suppliers": user.can_view_purchases_suppliers,
                "budgets": user.can_view_purchases_budgets,
            },
        }

        token["branch_id"] = user.branch.id if user.branch else None
        return token


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "pin",
            "branch",
            "branch_name",
            "password",
            # PERMISOS
            "can_view_users",
            # 👇 AGREGAR ESTO TAMBIÉN
            # (Para que puedas editar el permiso desde el Frontend de Usuarios)
            "can_view_cash",
            # Ventas
            "can_view_pos",
            "can_view_sales_list",
            # Inventario
            "can_view_products_list",
            "can_view_products_create",
            # Compras
            "can_view_purchases_create",
            "can_view_purchases_list",
            "can_view_purchases_payable",
            "can_view_purchases_balances",
            "can_view_purchases_suppliers",
            "can_view_purchases_budgets",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        instance = self.Meta.model(**validated_data)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
