from django.conf import settings  # Importar settings para referenciar al usuario
from django.db import models
from django.utils import timezone


class ExchangeRate(models.Model):
    date = models.DateField(verbose_name="Fecha", default=timezone.now, unique=True)
    # Usamos auto_now_add=True para grabar CUANDO se creó este registro específico
    created_at = models.DateTimeField(
        auto_now_add=True, verbose_name="Fecha de Registro"
    )

    # Registramos QUIÉN hizo el cambio (importante para tu requerimiento de seguridad)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Registrado por",
    )

    buy_rate = models.DecimalField(
        max_digits=5, decimal_places=3, verbose_name="Compra"
    )
    sell_rate = models.DecimalField(
        max_digits=5, decimal_places=3, verbose_name="Venta"
    )

    class Meta:
        verbose_name = "Historial Tipo de Cambio"
        verbose_name_plural = "Historial Tipos de Cambio"
        ordering = ["-created_at"]  # El más reciente primero

    def __str__(self):
        return f"{self.created_at.strftime('%d/%m/%Y')} - C:{self.buy_rate} V:{self.sell_rate}"
