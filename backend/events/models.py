from branches.models import Branch
from django.db import models
from sales.models import Sale


class Event(models.Model):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="events")
    name = models.CharField(max_length=200, help_text="Ej: Día del Niño")
    date = models.DateField(null=True, blank=True)

    # --- MODO CLÁSICO (Eventos Simples) ---
    has_specific_schedule = models.BooleanField(default=False)
    available_schedules = models.JSONField(default=list, blank=True)

    # 👇 --- NUEVO: MODO CARRERA / AVANZADO --- 👇
    is_advanced_registration = models.BooleanField(
        default=False, help_text="Activar para carreras o formularios dinámicos"
    )
    form_schema = models.JSONField(
        default=list, blank=True, help_text="Estructura de las preguntas dinámicas"
    )
    # 👆 ---------------------------------------- 👆

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.branch.name}"


class EventRegistration(models.Model):
    STATUS_CHOICES = [
        ("AVAILABLE", "Disponible"),
        ("REDEEMED", "Canjeado"),
    ]

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="registrations"
    )
    sale = models.OneToOneField(
        Sale, on_delete=models.CASCADE, related_name="event_ticket"
    )

    ticket_code = models.CharField(max_length=20, unique=True, help_text="Ej: E-TRU001")
    schedule_selected = models.CharField(max_length=100, null=True, blank=True)
    operation_number = models.CharField(max_length=100, null=True, blank=True)
    observations = models.TextField(null=True, blank=True)

    # 👇 --- NUEVO: GUARDA LAS RESPUESTAS DEL CORREDOR --- 👇
    attendee_data = models.JSONField(
        default=list, blank=True, help_text="Respuestas al formulario avanzado"
    )
    # 👆 -------------------------------------------------- 👆

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="AVAILABLE"
    )
    total_quantity = models.IntegerField(
        default=1, help_text="Total de entradas compradas"
    )
    redeemed_quantity = models.IntegerField(
        default=0, help_text="Cantidad de personas que ya ingresaron"
    )
    redeemed_breakdown = models.JSONField(default=dict, blank=True)
    redeemed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    advisor = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"{self.ticket_code} - {self.sale.customer_name if hasattr(self.sale, 'customer_name') else 'Cliente'}"
