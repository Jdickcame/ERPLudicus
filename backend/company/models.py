from django.db import models


class Company(models.Model):
    name = models.CharField(max_length=200, default="MI EMPRESA S.A.")
    short_name = models.CharField(max_length=50, default="MI EMPRESA")
    ruc = models.CharField(max_length=11, default="00000000000")
    address = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    class Meta:
        verbose_name = "Empresa"
        verbose_name_plural = "Empresas"

    def __str__(self):
        return self.name
