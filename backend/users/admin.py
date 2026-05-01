from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


# Creamos una configuración personalizada para el Admin
class CustomUserAdmin(UserAdmin):
    # Agregamos 'role' y 'branch' a la lista de columnas que ves al principio
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "role",
        "branch",
        "is_staff",
    )

    # Agregamos una nueva sección en el formulario de edición (tus fotos)
    fieldsets = UserAdmin.fieldsets + (
        (
            "Información Personalizada (ERP)",
            {
                "fields": ("role", "branch"),
            },
        ),
    )

    # También permitimos editarlos al crear usuario
    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("role", "branch"),
            },
        ),
    )


# Registramos el usuario con esta nueva configuración
admin.site.register(User, CustomUserAdmin)
