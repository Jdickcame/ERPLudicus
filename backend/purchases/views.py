from datetime import datetime
from decimal import Decimal

from core.mixins import BranchAccessMixin
from django.db import transaction
from django.db.models import Count, Min, Sum
from django_filters.rest_framework import DjangoFilterBackend
from inventory.models import Kardex, Stock
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# 👇 IMPORTACIONES CORREGIDAS
# Traemos Product desde inventory (que es donde realmente vive)
from .models import (
    Area,
    AreaMonthlyAdjustment,
    AreaMonthlyLimit,
    ExpenseCategory,
    Purchase,
    Supplier,
    SupplierTransaction,
)
from .serializers import (
    AreaBudgetSerializer,
    ExpenseCategorySerializer,
    PurchaseSerializer,
    SupplierSerializer,
)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


# --- 2. VIEWSET DE PRESUPUESTOS (BLINDADO) ---
class AreaBudgetViewSet(viewsets.ModelViewSet):
    serializer_class = AreaBudgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Consultamos la tabla nueva 'Area'
        queryset = Area.objects.all()
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    def perform_create(self, serializer):
        branch_id = self.request.data.get("branch_id")
        if branch_id:
            serializer.save(branch_id=branch_id)
        else:
            serializer.save()

    # 🛡️ ACCIÓN STATUS: Calcular gastos POR SEDE
    @action(detail=False, methods=["get"])
    def status(self, request):
        branch_id = request.query_params.get("branch_id")
        month_param = request.query_params.get("month")

        if not branch_id:
            return Response({"error": "Falta branch_id"}, status=400)

        # Definir Fecha
        if month_param:
            try:
                target_year, target_month = map(int, month_param.split("-"))
            except:  # noqa: E722
                now = datetime.now()
                target_year, target_month = now.year, now.month
        else:
            now = datetime.now()
            target_year, target_month = now.year, now.month

        budgets = Area.objects.filter(branch_id=branch_id)
        data = []

        for budget in budgets:
            # A. BUSCAR LÍMITE BASE (Prioridad: Mensual > Global)
            monthly_limit_obj = AreaMonthlyLimit.objects.filter(
                area=budget, year=target_year, month=target_month
            ).first()

            if monthly_limit_obj:
                base_limit = float(monthly_limit_obj.amount)
            else:
                base_limit = float(budget.budget_limit)  # Fallback al global

            # B. BUSCAR AJUSTES (Rollover)
            adjustment_obj = AreaMonthlyAdjustment.objects.filter(
                area=budget, year=target_year, month=target_month
            ).first()
            extra_budget = float(adjustment_obj.amount) if adjustment_obj else 0.00

            # C. CALCULAR TOTALES
            monthly_purchases = Purchase.objects.filter(
                branch_id=branch_id,
                area=budget,
                budget_period__year=target_year,
                budget_period__month=target_month,
            )

            spent = monthly_purchases.aggregate(s=Sum("total_net_pay"))["s"] or 0

            final_limit = base_limit + extra_budget
            spent = float(spent)
            remaining = final_limit - spent

            data.append(
                {
                    "id": budget.id,
                    "area": budget.id,
                    "area_label": budget.name,
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
        """
        Guarda el límite para un mes específico.
        """
        area_id = request.data.get("area_id")
        amount = request.data.get("amount")
        month_str = request.data.get("month")  # "YYYY-MM"

        if not area_id or amount is None or not month_str:
            return Response({"error": "Faltan datos"}, status=400)

        try:
            year, month = map(int, month_str.split("-"))
            area = Area.objects.get(id=area_id)

            # Guardamos o actualizamos el límite ESPECÍFICO de ese mes
            obj, created = AreaMonthlyLimit.objects.update_or_create(
                area=area, year=year, month=month, defaults={"amount": amount}
            )

            # Opcional: Si quieres que este sea también el nuevo "default" para el futuro,
            # descomenta la siguiente línea:
            # area.budget_limit = amount; area.save()

            return Response({"message": "Límite mensual actualizado"})
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["post"])
    def rollover(self, request):
        """
        Transfiere presupuesto de un mes (origen) a otro (destino).
        Resta del origen y Suma al destino.
        """
        area_id = request.data.get("area_id")
        amount = request.data.get("amount")
        source_month_str = request.data.get("source_month")  # Ej: "2026-02"
        target_month_str = request.data.get("target_month")  # Ej: "2026-03"

        if not area_id or not amount or not source_month_str or not target_month_str:
            return Response({"error": "Faltan datos"}, status=400)

        try:
            # Parsear fechas
            s_year, s_month = map(int, source_month_str.split("-"))
            t_year, t_month = map(int, target_month_str.split("-"))
            amount = float(amount)

            area = Area.objects.get(id=area_id)

            with transaction.atomic():
                # 1. RESTAR del mes de Origen (Para cerrar el mes)
                source_adj, _ = AreaMonthlyAdjustment.objects.get_or_create(
                    area=area, year=s_year, month=s_month, defaults={"amount": 0}
                )
                source_adj.amount = float(source_adj.amount) - amount
                source_adj.save()

                # 2. SUMAR al mes de Destino
                target_adj, _ = AreaMonthlyAdjustment.objects.get_or_create(
                    area=area, year=t_year, month=t_month, defaults={"amount": 0}
                )
                target_adj.amount = float(target_adj.amount) + amount
                target_adj.save()

            return Response(
                {
                    "message": f"Transferencia exitosa: S/ {amount} movidos de {source_month_str} a {target_month_str}."
                }
            )

        except Area.DoesNotExist:
            return Response({"error": "El área no existe"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=500)


# --- 3. OTRAS VISTAS ---


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]


class SupplierViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["post"])
    def add_balance(self, request, pk=None):
        supplier = self.get_object()
        amount = request.data.get("amount")
        operation_num = request.data.get("transaction_number")

        if not amount or not operation_num:
            return Response(
                {"error": "Monto y N° Operación son obligatorios"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                SupplierTransaction.objects.create(
                    supplier=supplier,
                    amount=amount,
                    transaction_number=operation_num,
                    description="Recarga de Saldo / Adelanto",
                )

                supplier.balance += Decimal(str(amount))
                supplier.save()

            return Response(
                {"status": "Saldo actualizado", "new_balance": supplier.balance}
            )
        except Exception as e:
            print("Error en add_balance:", str(e))
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def with_debt(self, request):
        branch_id = request.query_params.get("branch_id")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        # 1. Filtramos solo las pendientes de la sede
        pending_purchases = Purchase.objects.filter(
            payment_status="PENDING", branch_id=branch_id
        )

        if start_date:
            pending_purchases = pending_purchases.filter(issue_date__gte=start_date)
        if end_date:
            pending_purchases = pending_purchases.filter(issue_date__lte=end_date)

        # 2. Agrupamos por proveedor
        suppliers_debt = (
            pending_purchases.values("supplier", "supplier__name", "supplier__tax_id")
            .annotate(
                total_debt=Sum("total_net_pay"),
                count=Count("id"),
                # 👇 ESTA ES LA CLAVE: Buscamos la fecha de vencimiento más antigua
                next_due_date=Min("due_date"),
            )
            # Ordenamos: Primero los que vencen antes (o ya vencieron), luego por deuda mayor
            .order_by("next_due_date", "-total_debt")
        )

        # 3. Paginación manual para el Lazy Loading (Opcional, pero recomendado si tienes muchos)
        page = int(request.query_params.get("page", 1))
        page_size = 20  # Mismos 20 que en tu frontend
        start = (page - 1) * page_size
        end = start + page_size

        # Convertimos QuerySet a lista para poder paginar si es una lista de diccionarios
        data = list(suppliers_debt)
        paginated_data = data[start:end]

        return Response(
            {
                "results": paginated_data,
                "next": True
                if len(data) > end
                else False,  # Bandera simple para saber si hay más
                "total_global_debt": sum(
                    item["total_debt"] for item in data
                ),  # Total global para la tarjeta de arriba
            }
        )

    @action(detail=True, methods=["get"])
    def pending_invoices(self, request, pk=None):
        """
        Devuelve el detalle de las facturas pendientes de UN proveedor específico.
        """
        invoices = (
            Purchase.objects.filter(supplier_id=pk, payment_status="PENDING")
            .values(
                "id",
                "series",
                "number",
                "issue_date",
                "due_date",
                "total_net_pay",
                "currency",
                "document_type",
            )
            .order_by("issue_date")
        )

        return Response(invoices)

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        """
        Devuelve el Estado de Cuenta unificado (Compras + Pagos)
        ordenado cronológicamente para el Lazy Loading.
        """
        supplier = self.get_object()

        # Filtros de fecha
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        # 1. Obtener Compras
        purchases = Purchase.objects.filter(supplier=supplier)
        if start_date:
            purchases = purchases.filter(issue_date__gte=start_date)  # noqa: E701
        if end_date:
            purchases = purchases.filter(issue_date__lte=end_date)  # noqa: E701

        purchases_data = [
            {
                "id": p.id,
                "purchase_id": p.id,  # 👈 ESTA ES LA CLAVE QUE FALTABA PARA EL OJITO
                "date": p.issue_date,
                "type": "COMPRA",
                "document": f"{p.document_type} {p.series}-{p.number}",
                # Usamos total_net_pay si esa es tu lógica de deuda real, perfecto.
                "amount": -float(p.total_net_pay),
                "status": p.payment_status,
                "description": "Compra",
            }
            for p in purchases
        ]

        # 2. Obtener Transacciones
        transactions = SupplierTransaction.objects.filter(supplier=supplier)
        if start_date:
            transactions = transactions.filter(created_at__date__gte=start_date)  # noqa: E701
        if end_date:
            transactions = transactions.filter(created_at__date__lte=end_date)  # noqa: E701

        transactions_data = [
            {
                "id": t.id,
                "purchase_id": None,  # 👈 En pagos va vacío
                "date": t.created_at.date(),
                "type": "PAGO",
                "document": t.transaction_number,
                "amount": float(t.amount),
                "status": "COMPLETED",
                "description": t.description,
            }
            for t in transactions
        ]

        # 3. Unificar y Ordenar
        full_statement = purchases_data + transactions_data

        # Tip: Convertir a str para ordenar funciona, pero es mejor asegurar consistencia si hay fechas nulas (aunque no debería).
        full_statement.sort(key=lambda x: str(x["date"]), reverse=True)

        # 4. Paginación Manual
        page = int(request.query_params.get("page", 1))
        page_size = 20
        start = (page - 1) * page_size
        end = start + page_size

        total_items = len(full_statement)
        paginated_data = full_statement[start:end]

        return Response(
            {
                "results": paginated_data,
                "count": total_items,
                "total_pages": (total_items // page_size)
                + (1 if total_items % page_size > 0 else 0),
                "current_balance": supplier.balance,
            }
        )


# --- 4. VIEWSET DE COMPRAS (CRUD COMPLETO CON STOCK) ---
class PurchaseViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    filterset_fields = {
        "branch": ["exact"],
        "area": ["exact"],
        "budget_period": ["year", "month", "exact"],
        "payment_status": ["exact"],
        "supplier": ["exact"],
        "cost_type": ["exact"],
        "currency": ["exact"],
    }

    search_fields = ["series", "number", "supplier__name", "supplier__tax_id"]
    ordering_fields = ["issue_date", "total_net_pay", "cost_type", "payment_status"]

    def get_queryset(self):
        # Optimización: traemos supplier y branch de una vez
        queryset = (
            Purchase.objects.select_related("supplier", "branch")
            .all()
            .order_by("-issue_date")
        )
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    # ---------------------------------------------------------
    # 🔥 LÓGICA DE CREACIÓN: GASTO vs. INVENTARIO + KARDEX
    # ---------------------------------------------------------
    def perform_create(self, serializer):
        with transaction.atomic():
            # 1. Guardar la Cabecera de Compra
            purchase = serializer.save()

            # 2. Procesar cada detalle (línea de la factura)
            for detail in purchase.details.all():
                # 🛑 CASO A: GASTO PURO (Pintura, Servicio, etc.)
                # Si no tiene producto seleccionado O es un servicio/activo
                if not detail.product or detail.product.product_type in [
                    "SERVICE",
                    "ASSET",
                ]:
                    continue  # No mueve stock, solo contabilidad

                # ✅ CASO B: MERCADERÍA (Hot Dog, Gaseosa)
                # Si es un producto STOCKED o CONSUMABLE

                # A. Buscar o Crear Stock en esta Sede
                stock_record, created = Stock.objects.get_or_create(
                    branch=purchase.branch,
                    product=detail.product,
                    defaults={"quantity": 0, "average_cost": 0},
                )

                # B. 🧮 CÁLCULO DE COSTO PROMEDIO PONDERADO (CPP)
                old_total_value = stock_record.quantity * stock_record.average_cost
                # Usamos unit_price (que suele ser sin impuestos si tu sistema es neto) o unit_value
                # Asumimos que 'unit_value' en el detalle es el costo unitario
                new_entry_cost = detail.unit_value
                new_entry_total = detail.quantity * new_entry_cost

                total_new_quantity = stock_record.quantity + detail.quantity

                if total_new_quantity > 0:
                    # Fórmula: (Valor Viejo + Valor Nuevo) / Cantidad Total
                    new_average_cost = (
                        old_total_value + new_entry_total
                    ) / total_new_quantity
                else:
                    new_average_cost = new_entry_cost

                # C. Actualizar Stock Físico y Costo
                stock_record.quantity = total_new_quantity
                stock_record.average_cost = new_average_cost
                stock_record.save()

                # D. 📝 REGISTRAR EN KARDEX
                Kardex.objects.create(
                    branch=purchase.branch,
                    product=detail.product,
                    date=purchase.issue_date,  # Usamos la fecha de emisión del documento
                    type="IN_PURCHASE",
                    quantity=detail.quantity,
                    # Datos Financieros del Movimiento
                    unit_cost=new_entry_cost,
                    total_cost=new_entry_total,
                    # Snapshot (Foto del saldo después del movimiento)
                    balance_quantity=stock_record.quantity,
                    balance_unit_cost=stock_record.average_cost,
                    balance_total_cost=stock_record.quantity
                    * stock_record.average_cost,
                    user=self.request.user,
                    description=f"Compra {purchase.series}-{purchase.number} | {purchase.supplier.name}",
                )

    # ---------------------------------------------------------
    # 🔥 LÓGICA DE ELIMINACIÓN: REVERTIR KARDEX Y STOCK
    # ---------------------------------------------------------
    def perform_destroy(self, instance):
        with transaction.atomic():
            # 1. Revertir Stock y Kardex por cada detalle
            for detail in instance.details.all():
                if detail.product and detail.product.product_type in [
                    "STOCKED",
                    "CONSUMABLE",
                ]:
                    try:
                        stock_record = Stock.objects.get(
                            branch=instance.branch, product=detail.product
                        )

                        # Restamos la cantidad (No recalculamos costo promedio hacia atrás porque es complejo,
                        # simplemente asumimos que sale al costo actual o mantenemos el costo.
                        # Lo más sano es solo ajustar cantidad).
                        stock_record.quantity -= detail.quantity
                        stock_record.save()

                        # Creamos un contra-movimiento en Kardex para dejar huella de la anulación
                        Kardex.objects.create(
                            branch=instance.branch,
                            product=detail.product,
                            type="OUT_ADJUSTMENT",  # O un tipo específico ANULACION_COMPRA
                            quantity=-detail.quantity,
                            unit_cost=detail.unit_value,
                            total_cost=detail.quantity * detail.unit_value,
                            balance_quantity=stock_record.quantity,
                            balance_unit_cost=stock_record.average_cost,
                            balance_total_cost=stock_record.quantity
                            * stock_record.average_cost,
                            user=self.request.user,
                            description=f"ANULACIÓN Compra {instance.series}-{instance.number}",
                        )
                    except Stock.DoesNotExist:
                        pass

            # 2. Revertir Saldo Proveedor (si estaba pagado)
            if instance.payment_status == "PAID" and instance.supplier:
                instance.supplier.balance += instance.total_net_pay
                instance.supplier.save()

                # Registrar transacción de devolución de saldo
                SupplierTransaction.objects.create(
                    supplier=instance.supplier,
                    amount=instance.total_net_pay,  # Positivo porque vuelve la deuda (o el saldo a favor se anula)
                    # Aquí la lógica depende: si ya pagué, el proveedor me debe plata (saldo a favor).
                    transaction_number=f"REV-{instance.series}-{instance.number}",
                    description=f"Reversión por eliminación de compra {instance.series}-{instance.number}",
                )

            # 3. Borrar la compra
            instance.delete()

    # ---------------------------------------------------------
    # 🔥 LÓGICA DE EDICIÓN: REVERTIR Y RE-APLICAR
    # ---------------------------------------------------------
    def perform_update(self, serializer):
        """
        Editar una compra que afecta inventario es peligroso.
        Estrategia simplificada:
        1. Revertir efectos de la compra vieja (restar stock).
        2. Guardar cambios.
        3. Aplicar efectos de la compra nueva (sumar stock, nuevo costo).
        """
        with transaction.atomic():
            old_purchase = self.get_object()

            # A. Revertir Inventario Viejo (Simplificado: Solo resta cantidad)
            for detail in old_purchase.details.all():
                if detail.product and detail.product.product_type in [
                    "STOCKED",
                    "CONSUMABLE",
                ]:
                    try:
                        stk = Stock.objects.get(
                            branch=old_purchase.branch, product=detail.product
                        )
                        stk.quantity -= detail.quantity
                        stk.save()
                        # Nota: No borramos el Kardex viejo para mantener auditoría,
                        # pero idealmente se debería marcar como anulado.
                    except Stock.DoesNotExist:
                        pass

            # B. Revertir Saldo Proveedor Viejo
            if old_purchase.payment_status == "PAID" and old_purchase.supplier:
                old_purchase.supplier.balance += old_purchase.total_net_pay
                old_purchase.supplier.save()

            # C. Guardar Nueva Compra
            new_purchase = serializer.save()

            # D. Aplicar Inventario Nuevo (Lógica idéntica a create)
            for detail in new_purchase.details.all():
                if detail.product and detail.product.product_type in [
                    "STOCKED",
                    "CONSUMABLE",
                ]:
                    stock_record, _ = Stock.objects.get_or_create(
                        branch=new_purchase.branch,
                        product=detail.product,
                        defaults={"quantity": 0, "average_cost": 0},
                    )

                    # Recálculo de CPP (Como si entrara de nuevo)
                    current_val = stock_record.quantity * stock_record.average_cost
                    entry_val = detail.quantity * detail.unit_value
                    new_qty = stock_record.quantity + detail.quantity

                    if new_qty > 0:
                        new_avg = (current_val + entry_val) / new_qty
                    else:
                        new_avg = detail.unit_value

                    stock_record.quantity = new_qty
                    stock_record.average_cost = new_avg
                    stock_record.save()

                    # Nuevo Kardex (Corrección)
                    Kardex.objects.create(
                        branch=new_purchase.branch,
                        product=detail.product,
                        date=new_purchase.issue_date,
                        type="IN_ADJUSTMENT",  # Marcamos como ajuste por edición
                        quantity=detail.quantity,
                        unit_cost=detail.unit_value,
                        total_cost=entry_val,
                        balance_quantity=stock_record.quantity,
                        balance_unit_cost=stock_record.average_cost,
                        balance_total_cost=stock_record.quantity
                        * stock_record.average_cost,
                        user=self.request.user,
                        description=f"Edición Compra {new_purchase.series}-{new_purchase.number}",
                    )

            # E. Aplicar Nuevo Saldo Proveedor
            if new_purchase.payment_status == "PAID" and new_purchase.supplier:
                new_purchase.supplier.balance -= new_purchase.total_net_pay
                new_purchase.supplier.save()

    # --- Acciones Extra (Choices, Bulk Pay) se mantienen igual ---
    @action(detail=False, methods=["get"])
    def choices(self, request):
        def format_opts(choices):
            return [{"value": k, "label": v} for k, v in choices]

        branch_id = request.query_params.get("branch_id")
        areas_qs = Area.objects.all()
        if branch_id:
            areas_qs = areas_qs.filter(branch_id=branch_id)
        areas_options = [{"value": a.id, "label": a.name} for a in areas_qs]

        return Response(
            {
                "document_types": format_opts(Purchase.DOCUMENT_TYPES),
                "payment_conditions": format_opts(Purchase.PAYMENT_CONDITIONS),
                "payment_status": format_opts(Purchase.PAYMENT_STATUS),
                "igv_rates": format_opts(Purchase.IGV_RATES),
                "cost_types": format_opts(Purchase.COST_TYPE_CHOICES),
                "payment_methods": format_opts(Purchase.PAYMENT_METHOD_CHOICES),
                "areas": areas_options,
            }
        )

    @action(detail=False, methods=["post"])
    def bulk_pay(self, request):
        purchase_ids = request.data.get("purchase_ids", [])
        payment_date = request.data.get("payment_date")
        payment_method = request.data.get("payment_method")
        transaction_number = request.data.get("transaction_number")
        observation = request.data.get("observation", "")

        if not purchase_ids:
            return Response({"error": "No has seleccionado ninguna compra"}, status=400)

        purchases = Purchase.objects.filter(
            id__in=purchase_ids, payment_status="PENDING"
        )
        count = 0
        total_paid = 0

        try:
            with transaction.atomic():
                for purchase in purchases:
                    purchase.payment_status = "PAID"
                    purchase.payment_date = payment_date
                    purchase.payment_method = payment_method
                    purchase.save()

                    if purchase.supplier:
                        supplier = purchase.supplier
                        supplier.balance -= purchase.total_net_pay
                        supplier.save()
                        SupplierTransaction.objects.create(
                            supplier=supplier,
                            amount=-purchase.total_net_pay,
                            transaction_number=transaction_number,
                            description=f"Pago Masivo: {purchase.document_type} {purchase.series}-{purchase.number} | {observation}",
                        )
                    count += 1
                    total_paid += purchase.total_net_pay

            return Response(
                {
                    "message": f"Se liquidaron {count} documentos.",
                    "total_paid": total_paid,
                }
            )
        except Exception as e:
            return Response({"error": str(e)}, status=500)
