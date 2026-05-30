from django.db import models


class Branch(models.Model):
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    code = models.CharField(max_length=10, unique=True)
    web_boleta_series = models.CharField(
        max_length=4, default="B099", help_text="Serie para boletas hechas desde la web"
    )
    web_factura_series = models.CharField(
        max_length=4,
        default="F099",
        help_text="Serie para facturas hechas desde la web",
    )

    def __str__(self):
        return self.name
