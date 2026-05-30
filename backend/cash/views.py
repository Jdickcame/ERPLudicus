from datetime import date

# 👇 IMPORTACIÓN DE PAGINACIÓN RECUPERADA 👇
from core.pagination import StandardResultsSetPagination
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from sales.pdf_engine import TicketEngine

# Importaciones locales
from .models import CashMovement, CashRegister, CashShift
from .serializers import (
    CashMovementSerializer,
    CashRegisterSerializer,
    CashShiftSerializer,
)

User = get_user_model()


class CashRegisterViewSet(viewsets.ModelViewSet):
    queryset = CashRegister.objects.all()
    serializer_class = CashRegisterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        branch_id = self.request.query_params.get("branch_id")

        # Leemos un parámetro especial para saber si es el admin
        is_admin_config = self.request.query_params.get("all_status") == "true"

        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        # Si NO es el admin configurando, ocultamos las inactivas (para los cajeros)
        if not is_admin_config:
            qs = qs.filter(is_active=True)

        return qs


class CashShiftViewSet(viewsets.ModelViewSet):
    serializer_class = CashShiftSerializer
    permission_classes = [IsAuthenticated]

    # 👇 PAGINACIÓN ACTIVADA 👇
    pagination_class = StandardResultsSetPagination

    queryset = CashShift.objects.all()  # Esto evita el AssertionError

    # 🔥 AQUÍ ESTÁ LA MAGIA DE LOS FILTROS Y LA VELOCIDAD 🔥
    def get_queryset(self):
        # 👇 EL TURBO CORREGIDO (Sin try/except, usando tu nombre real) 👇
        queryset = (
            CashShift.objects.select_related("user", "cash_register")
            .prefetch_related(
                "movements", "sales__payments"
            )  # 👈 ¡AQUÍ ESTÁ EL CAMBIO!
            .order_by("-opened_at")
        )

        # 1. Filtro por Sede (Branch)
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(cash_register__branch_id=branch_id)

        # 2. Filtro por Estado (OPEN o CLOSED)
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        # 3. Filtro por Fechas de Apertura
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        if start_date:
            queryset = queryset.filter(opened_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(opened_at__date__lte=end_date)

        # 4. Filtro por Cajero (Buscador de texto)
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__username__icontains=search)
            )

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        register_id = self.request.data.get("cash_register")

        # 🛑 REGLA 1: Un cajero no puede tener dos turnos abiertos al mismo tiempo
        if CashShift.objects.filter(user=user, status="OPEN").exists():
            raise serializers.ValidationError(
                {
                    "error": "Ya tienes un turno de caja abierto actualmente. Ciérralo antes de abrir otro."
                }
            )

        # 🛑 REGLA 2: Nadie puede usar una caja que ya está abierta
        if CashShift.objects.filter(
            cash_register_id=register_id, status="OPEN"
        ).exists():
            raise serializers.ValidationError(
                {
                    "error": "Esta terminal ya está ocupada por otro cajero. Elige otra o pide que la cierren."
                }
            )

        # ✅ Si pasa las reglas, abrimos la caja (respetando el modo Offline)
        uuid_from_front = self.request.data.get("uuid")
        if uuid_from_front:
            serializer.save(user=user, status="OPEN", uuid=uuid_from_front)
        else:
            serializer.save(user=user, status="OPEN")

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Devuelve la caja abierta del usuario actual"""
        shift = CashShift.objects.filter(user=request.user, status="OPEN").first()
        if not shift:
            return Response(
                {"detail": "No tienes caja abierta"}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(self.get_serializer(shift).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Cierre de Caja (Arqueo)"""
        shift = self.get_object()

        if shift.status == "CLOSED":
            return Response(
                {"detail": "La caja ya está cerrada"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Obtenemos el monto real que contó el usuario
        real_amount = request.data.get("final_balance_real")
        if real_amount is None:
            return Response(
                {"detail": "Debes enviar el monto real (arqueo)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Calculamos el sistema (Saldo Inicial + Ingresos - Egresos)
        incomes = (
            shift.movements.filter(movement_type="IN").aggregate(Sum("amount"))[
                "amount__sum"
            ]
            or 0
        )
        expenses = (
            shift.movements.filter(movement_type="OUT").aggregate(Sum("amount"))[
                "amount__sum"
            ]
            or 0
        )
        system_amount = shift.initial_balance + incomes - expenses

        # 3. Guardamos y cerramos
        shift.final_balance_system = system_amount
        shift.final_balance_real = real_amount
        shift.difference = float(real_amount) - float(system_amount)
        shift.closed_at = timezone.now()
        shift.status = "CLOSED"
        shift.save()

        return Response(self.get_serializer(shift).data)

    @action(detail=True, methods=["get"])
    def report_x(self, request, pk=None):
        """Genera el PDF del Arqueo o Pre-Cierre (Lectura X)"""
        shift = self.get_object()

        # 1. Usamos tu Serializer para los cálculos matemáticos
        shift_data = self.get_serializer(shift).data

        # 2. Creamos la respuesta HTTP tipo PDF
        response = HttpResponse(content_type="application/pdf")
        response["Content-Disposition"] = (
            f'inline; filename="lectura_x_turno_{shift.id}.pdf"'
        )

        # 3. Instanciamos el motor de PDFs (Él automáticamente le pondrá el título "LECTURA X" porque la caja sigue OPEN)
        engine = TicketEngine(response)
        engine.generate_z_report(shift, shift_data)

        return response

    @action(detail=True, methods=["get"])
    def report_z(self, request, pk=None):
        """Genera el PDF del Cierre Final (Reporte Z)"""
        shift = self.get_object()

        # 1. Cálculos matemáticos
        shift_data = self.get_serializer(shift).data

        # 2. Respuesta HTTP
        response = HttpResponse(content_type="application/pdf")
        response["Content-Disposition"] = (
            f'inline; filename="cierre_z_turno_{shift.id}.pdf"'
        )

        # 3. Motor de PDFs (Le pondrá "REPORTE DE CIERRE Z" y calculará sobrantes/faltantes)
        engine = TicketEngine(response)
        engine.generate_z_report(shift, shift_data)

        return response

    @action(detail=False, methods=["get"])
    def daily_monitor(self, request):
        """
        Endpoint exclusivo para el Monitor de Administración.
        Devuelve el resumen de todas las cajas del día y las cortesías.
        """
        user = request.user

        # 1. Seguridad de Hierro: Solo jefes entran aquí
        if user.role not in ["ADMIN", "MANAGER"] and not user.is_superuser:
            return Response(
                {"error": "No tienes permisos para ver el monitor."},
                status=status.HTTP_403_FORBIDDEN,
            )

        branch_id = request.query_params.get("branch_id")
        if not branch_id:
            return Response(
                {"error": "Se requiere el ID de la sede (branch_id)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Obtenemos la fecha de hoy
        today = date.today()

        # 3. Buscamos todas las cajas abiertas o cerradas HOY en esta sede
        shifts = CashShift.objects.filter(
            cash_register__branch_id=branch_id,
            opened_at__year=today.year,
            opened_at__month=today.month,
            opened_at__day=today.day,
        ).order_by("-opened_at")

        # Serializamos para que tu Serializer haga la magia matemática (expected_cash, etc)
        shifts_data = self.get_serializer(shifts, many=True).data

        # 4. Calculamos el dinero físico/digital esperado en las cajas
        global_cash = 0
        global_card = 0
        global_transfer = 0

        for shift in shifts_data:
            global_cash += float(shift.get("expected_cash", 0))
            global_card += float(shift.get("expected_card", 0))
            global_transfer += float(shift.get("expected_transfer", 0))

        # 🌟 NUEVO: 4.5. Calculamos las Ventas Reales (Bruto y Neto) 🌟
        Sale = apps.get_model("sales", "Sale")  # CARGA SEGURA MANTENIDA

        # Filtramos solo ventas pagadas de hoy (ignoramos anuladas y cortesías)
        real_sales = (
            Sale.objects.filter(
                branch_id=branch_id,
                date__year=today.year,
                date__month=today.month,
                date__day=today.day,
            )
            .exclude(status="CANCELED")
            .exclude(Q(invoice_type_code="99") | Q(is_courtesy=True))
        )

        # Usamos la base de datos para sumar todo ultra-rápido
        sales_totals = real_sales.aggregate(
            total_bruto=Sum("total"),
            total_neto=Sum("total_gravada"),
            total_discounts=Sum("discount_amount"),
        )

        global_bruto = sales_totals["total_bruto"] or 0
        global_neto = sales_totals["total_neto"] or 0
        global_discounts = sales_totals["total_discounts"] or 0

        # 5. Calculamos las Cortesías del día
        courtesies = (
            Sale.objects.filter(
                branch_id=branch_id,
                date__year=today.year,
                date__month=today.month,
                date__day=today.day,
            )
            .exclude(status="CANCELED")
            .filter(Q(invoice_type_code="99") | Q(is_courtesy=True))
        )

        total_courtesies_value = 0
        for sale in courtesies:
            if float(sale.total) > 0:
                total_courtesies_value += float(sale.total)
            else:
                for detail in sale.details.all():
                    total_courtesies_value += float(detail.price) * float(
                        detail.quantity
                    )

        # 6. Empaquetamos todo y lo mandamos a React
        return Response(
            {
                "date": today.strftime("%d/%m/%Y"),
                "totals": {
                    "global_bruto": global_bruto,
                    "global_neto": global_neto,
                    "cash": global_cash,
                    "card": global_card,
                    "transfer": global_transfer,
                    "courtesies_value": total_courtesies_value,
                    "courtesies_count": courtesies.count(),
                    "discounts_value": float(global_discounts),
                },
                "shifts": shifts_data,
            }
        )


class CashMovementViewSet(viewsets.ModelViewSet):
    queryset = CashMovement.objects.all()
    serializer_class = CashMovementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = CashMovement.objects.all().order_by("-created_at")
        shift_id = self.request.query_params.get("shift")
        if shift_id:
            queryset = queryset.filter(shift_id=shift_id)
        return queryset

    def perform_create(self, serializer):
        data = (
            serializer.initial_data
            if hasattr(serializer, "initial_data")
            else self.request.data
        )
        user = self.request.user

        # 1. Validar que el usuario tenga caja abierta
        shift = CashShift.objects.filter(user=user, status="OPEN").first()
        if not shift:
            raise serializers.ValidationError(
                {"error": "No tienes una caja abierta. Abre caja primero."}
            )

        # 2. EL GUARDIÁN: Validar permisos de movimiento manual
        supervisor_to_save = None
        # Solo exigimos pin si no es venta automática. (Las ventas las valida el módulo sales)
        if data.get("concept") != "SALE":
            if user.role not in ["ADMIN", "MANAGER"]:
                supervisor_pin = data.get("supervisor_pin")

                if not supervisor_pin:
                    raise serializers.ValidationError(
                        {
                            "error": "No tienes permisos. Se requiere PIN de un Gerente/Admin."
                        }
                    )

                supervisor_to_save = User.objects.filter(
                    pin=supervisor_pin, role__in=["ADMIN", "MANAGER"]
                ).first()

                if not supervisor_to_save:
                    raise serializers.ValidationError(
                        {
                            "error": "PIN inválido o el usuario no tiene permisos de gerencia."
                        }
                    )
            else:
                supervisor_to_save = user  # Si es jefe, él mismo se autoriza

        # 3. Datos Offline (Opcionales)
        offline_uuid = data.get("uuid")
        offline_date = data.get("created_at")

        save_kwargs = {
            "user": user,
            "shift": shift,
            "authorized_by": supervisor_to_save,
        }

        if offline_uuid:
            save_kwargs["uuid"] = offline_uuid
            save_kwargs["is_synced"] = False

        # ✅ 4. Guardar el movimiento
        movement = serializer.save(**save_kwargs)

        # Respetar fecha offline si existe
        if offline_date:
            movement.created_at = offline_date
            movement.save()

    # 🔥 MOTOR DE SINCRONIZACIÓN MASIVA PARA MOVIMIENTOS OFFLINE 🔥
    @action(detail=False, methods=["post"])
    def bulk_sync(self, request):
        movements_data = request.data

        if not isinstance(movements_data, list):
            return Response(
                {"error": "Se esperaba una lista de movimientos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        synced_count = 0
        errors = []

        for index, mov_json in enumerate(movements_data):
            mov_uuid = mov_json.get("uuid")

            # Idempotencia: Evitar duplicar gastos/ingresos
            if mov_uuid and CashMovement.objects.filter(uuid=mov_uuid).exists():
                continue

            serializer = self.get_serializer(data=mov_json)

            try:
                if serializer.is_valid():
                    self.perform_create(serializer)
                    synced_count += 1
                else:
                    errors.append(
                        {"index": index, "uuid": mov_uuid, "errors": serializer.errors}
                    )
            except Exception as e:
                errors.append({"index": index, "uuid": mov_uuid, "errors": str(e)})

        return Response(
            {
                "message": "Sincronización finalizada",
                "synced_count": synced_count,
                "errors": errors,
            },
            status=status.HTTP_200_OK,
        )
