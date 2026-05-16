import random
import string

# ❌ ¡OJO! Aquí arriba NO debe haber ninguna importación de models.py ❌


def generate_sku(prefix="PROD"):
    """
    Genera un SKU único con el formato: PREFIJO-XXXXXX
    Ej: PROD-A4K92
    """
    # 👇 LA IMPORTACIÓN DEBE ESTAR ESTRICTAMENTE AQUÍ ADENTRO
    from .models import Product

    while True:
        # Generar 6 caracteres aleatorios mayúsculas y números
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        new_sku = f"{prefix}-{suffix}"

        # Verificar que no exista
        if not Product.objects.filter(sku=new_sku).exists():
            return new_sku
