from django.db import models


class Branch(models.Model):
    name = models.CharField(max_length=100)  # Ej: "Sede Chiclayo"
    address = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    code = models.CharField(max_length=10, unique=True)  # Ej: "CHIX"

    def __str__(self):
        return self.name
