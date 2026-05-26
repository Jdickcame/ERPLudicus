from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.db.models import Case, ExpressionWrapper, F, FloatField, Sum, When
from django.db.models.functions import Coalesce
from django.utils import timezone
from purchases.models import (
    Area,
    AreaBranchBudget,
    AreaMonthlyAdjustment,
    AreaMonthlyLimit,
    Purchase,
    PurchaseDetail,
    Supplier,
)
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import PaymentTransaction
from .serializers import AreaBudgetSerializer


class TreasuryViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    # 1. ENDPOINT: Pagar facturas (Ex bulk_pay)
    @action(detail=False, methods=["post"])
    def pay_invoices(self, request):
        purchase_ids = request.data.get("purchase_ids", [])
        # 👇 NUEVO: Recibimos cuánto dinero real salió del banco
        amount_paid = Decimal(str(request.data.get("amount_paid", 0)))
        payment_date = request.data.get("payment_date", timezone.now().date())
        payment_method = request.data.get("payment_method", "TRANSFER")
        transaction_number = request.data.get("transaction_number", "")
        observation = request.data.get("observation", "")

        if not purchase_ids:
            return Response(
                {"error": "No has seleccionado ninguna factura"}, status=400
            )

        purchases = Purchase.objects.filter(
            id__in=purchase_ids, payment_status="PENDING"
        )
        if not purchases.exists():
            return Response(
                {"error": "Las facturas ya están pagadas o no existen"}, status=400
            )

        try:
            with transaction.atomic():
                supplier = purchases.first().supplier

                # 1. Cambiar estado de las compras a PAGADO
                for p in purchases:
                    p.payment_status = "PAID"
                    p.save()

                # 2. Descontar SOLO la plata real que salió del banco a la deuda del proveedor
                supplier.balance -= amount_paid
                supplier.save()

                # 3. Registrar el movimiento en Tesorería SOLO si hubo pago real (si no fue 100% cruce de saldo)
                if amount_paid > 0:
                    doc_refs = ", ".join([f"{p.series}-{p.number}" for p in purchases])
                    PaymentTransaction.objects.create(
                        supplier=supplier,
                        transaction_type="PAYMENT",
                        payment_method=payment_method,
                        amount=amount_paid,
                        transaction_number=transaction_number,
                        payment_date=payment_date,
                        description=f"Pago de facturas: {doc_refs} | {observation}",
                    )

                return Response({"message": "Facturas liquidadas exitosamente."})
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    # 2. ENDPOINT: Registrar Adelantos / Saldos a favor (Ex add_balance)
    @action(detail=False, methods=["post"])
    def add_advance(self, request):
        supplier_id = request.data.get("supplier_id")
        amount = request.data.get("amount")
        payment_method = request.data.get("payment_method", "TRANSFER")
        transaction_number = request.data.get("transaction_number", "")
        payment_date = request.data.get("payment_date", timezone.now().date())
        observation = request.data.get("observation", "Anticipo / Saldo a Favor")

        if not supplier_id or not amount:
            return Response({"error": "Faltan datos obligatorios"}, status=400)

        try:
            with transaction.atomic():
                supplier = Supplier.objects.get(id=supplier_id)
                amount_decimal = Decimal(str(amount))

                # Un anticipo es dinero a tu favor, por lo tanto empuja la deuda hacia negativos (-)
                supplier.balance -= amount_decimal
                supplier.save()

                PaymentTransaction.objects.create(
                    supplier=supplier,
                    transaction_type="ADVANCE",
                    payment_method=payment_method,
                    amount=amount_decimal,
                    transaction_number=transaction_number,
                    payment_date=payment_date,
                    description=observation,
                )

                return Response(
                    {
                        "message": "Anticipo registrado con éxito",
                        "new_balance": supplier.balance,
                    }
                )
        except Supplier.DoesNotExist:
            return Response({"error": "Proveedor no encontrado"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    # 3. ENDPOINT: Enviar opciones (choices) al frontend
    @action(detail=False, methods=["get"])
    def choices(self, request):
        def format_opts(choices_list):
            # Filtramos "BALANCE" porque es de uso interno del sistema
            return [{"value": k, "label": v} for k, v in choices_list if k != "BALANCE"]

        return Response(
            {
                "payment_methods": format_opts(PaymentTransaction.PAYMENT_METHODS),
            }
        )


# --- 2. VIEWSET DE PRESUPUESTOS (NUEVA ARQUITECTURA) ---
class AreaBudgetViewSet(viewsets.ModelViewSet):
    serializer_class = AreaBudgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Area.objects.all()
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_configs__branch_id=branch_id).distinct()
        return queryset

    def perform_create(self, serializer):
        area = serializer.save()
        branch_id = self.request.data.get("branch_id")
        budget_limit = self.request.data.get("budget_limit", 0)

        if branch_id:
            from .models import AreaBranchBudget

            AreaBranchBudget.objects.create(
                area=area, branch_id=branch_id, budget_limit=budget_limit
            )

    @action(detail=False, methods=["get"])
    def status(self, request):
        branch_id = request.query_params.get("branch_id")
        month_param = request.query_params.get("month")

        if not branch_id:
            return Response({"error": "Falta branch_id"}, status=400)

        if month_param:
            try:
                target_year, target_month = map(int, month_param.split("-"))
            except:  # noqa: E722
                now = datetime.now()
                target_year, target_month = now.year, now.month
        else:
            now = datetime.now()
            target_year, target_month = now.year, now.month

        branch_budgets = AreaBranchBudget.objects.filter(
            branch_id=branch_id
        ).select_related("area")
        data = []

        for bb in branch_budgets:
            area = bb.area
            monthly_limit_obj = AreaMonthlyLimit.objects.filter(
                area=area, branch_id=branch_id, year=target_year, month=target_month
            ).first()

            if monthly_limit_obj:
                base_limit = float(monthly_limit_obj.amount)
            else:
                base_limit = float(bb.budget_limit)

            adjustment_obj = AreaMonthlyAdjustment.objects.filter(
                area=area, branch_id=branch_id, year=target_year, month=target_month
            ).first()
            extra_budget = float(adjustment_obj.amount) if adjustment_obj else 0.00

            monthly_details = PurchaseDetail.objects.filter(
                purchase__branch_id=branch_id,
                area=area,
                purchase__budget_period__year=target_year,
                purchase__budget_period__month=target_month,
                purchase__payment_status__in=["PAID", "PENDING"],
            )

            cost_in_soles = ExpressionWrapper(
                Case(
                    When(
                        purchase__currency="USD",
                        then=(F("total_value") * (1.0 + F("tax_percentage") / 100.0))
                        * Coalesce(F("purchase__exchange_rate"), 1.0),
                    ),
                    default=F("total_value") * (1.0 + F("tax_percentage") / 100.0),
                    output_field=FloatField(),
                ),
                output_field=FloatField(),
            )

            spent = (
                monthly_details.annotate(line_cost=cost_in_soles).aggregate(
                    s=Sum("line_cost")
                )["s"]
                or 0
            )

            final_limit = base_limit + extra_budget
            spent = float(spent)
            remaining = final_limit - spent

            data.append(
                {
                    "id": area.id,
                    "area": area.id,
                    "area_label": area.name,
                    "limit": final_limit,
                    "base_limit": base_limit,
                    "extra_budget": extra_budget,
                    "spent": spent,
                    "remaining": remaining,
                    "is_negative": remaining < 0,
                    "percentage": (spent / final_limit * 100) if final_limit > 0 else 0,
                    "month": f"{target_year}-{target_month:02d}",
                }
            )

        return Response(data)

    @action(detail=False, methods=["post"])
    def set_limit(self, request):
        area_id = request.data.get("area_id")
        branch_id = request.data.get("branch_id")
        amount = request.data.get("amount")
        month_str = request.data.get("month")

        if not area_id or not branch_id or amount is None or not month_str:
            return Response(
                {"error": "Faltan datos (area_id, branch_id, amount, month)"},
                status=400,
            )

        try:
            year, month = map(int, month_str.split("-"))
            obj, created = AreaMonthlyLimit.objects.update_or_create(
                area_id=area_id,
                branch_id=branch_id,
                year=year,
                month=month,
                defaults={"amount": amount},
            )
            return Response({"message": "Límite mensual actualizado"})
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["post"])
    def rollover(self, request):
        area_id = request.data.get("area_id")
        branch_id = request.data.get("branch_id")
        amount = request.data.get("amount")
        source_month_str = request.data.get("source_month")
        target_month_str = request.data.get("target_month")

        if (
            not area_id
            or not branch_id
            or not amount
            or not source_month_str
            or not target_month_str
        ):
            return Response({"error": "Faltan datos"}, status=400)

        try:
            s_year, s_month = map(int, source_month_str.split("-"))
            t_year, t_month = map(int, target_month_str.split("-"))
            amount = float(amount)

            with transaction.atomic():
                source_adj, _ = AreaMonthlyAdjustment.objects.get_or_create(
                    area_id=area_id,
                    branch_id=branch_id,
                    year=s_year,
                    month=s_month,
                    defaults={"amount": 0},
                )
                source_adj.amount = float(source_adj.amount) - amount
                source_adj.save()

                target_adj, _ = AreaMonthlyAdjustment.objects.get_or_create(
                    area_id=area_id,
                    branch_id=branch_id,
                    year=t_year,
                    month=t_month,
                    defaults={"amount": 0},
                )
                target_adj.amount = float(target_adj.amount) + amount
                target_adj.save()

            return Response({"message": f"Transferencia exitosa: S/ {amount} movidos."})

        except Exception as e:
            return Response({"error": str(e)}, status=500)
