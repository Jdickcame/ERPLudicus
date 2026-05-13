from datetime import datetime
from decimal import Decimal

import openpyxl
import requests
from core.mixins import BranchAccessMixin
from django.conf import settings
from django.db import transaction
from django.db.models import Count, ExpressionWrapper, F, FloatField, Min, Sum
from django.http import HttpResponse
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
    PurchaseDetail,
    PurchaseNote,
    Supplier,
    SupplierTransaction,
)
from .serializers import (
    AreaBudgetSerializer,
    ExpenseCategorySerializer,
    PurchaseNoteSerializer,
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
            monthly_details = PurchaseDetail.objects.filter(
                purchase__branch_id=branch_id,
                area=budget,  # Filtramos por el área en el detalle
                purchase__budget_period__year=target_year,
                purchase__budget_period__month=target_month,
                # Evitamos sumar compras anuladas si existen
                purchase__payment_status__in=["PAID", "PENDING"],
            )

            # Sumamos total_value + IGV de cada línea
            cost_with_tax = ExpressionWrapper(
                F("total_value") * (1.0 + F("tax_percentage") / 100.0),
                output_field=FloatField(),
            )

            spent = (
                monthly_details.annotate(line_cost=cost_with_tax).aggregate(
                    s=Sum("line_cost")
                )["s"]
                or 0
            )

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

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    search_fields = ["name", "tax_id"]
    ordering_fields = ["name", "tax_id", "balance", "id"]
    ordering = ["-id"]  # Orden por defecto

    # 🔥 NUEVO: Buscador Inteligente Local + SUNAT/RENIEC
    @action(detail=False, methods=["get"])
    def search_doc(self, request):
        doc_number = request.query_params.get("doc")
        if not doc_number:
            return Response(
                {"error": "Falta enviar el documento"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. BÚSQUEDA LOCAL (Ultra rápida, en tus 400 proveedores)
        supplier = Supplier.objects.filter(tax_id=doc_number).first()
        if supplier:
            return Response(self.get_serializer(supplier).data)

        # 2. BÚSQUEDA EXTERNA EN APISPERU (Si no lo tienes registrado)
        tokenconsul = getattr(settings, "APISPERU_CONSULTA_TOKEN", None)
        if not tokenconsul:
            return Response(
                {"error": "Token de ApisPeru no configurado en el servidor."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            # DNI (8 dígitos)
            if len(doc_number) == 8:
                r = requests.get(
                    f"https://dniruc.apisperu.com/api/v1/dni/{doc_number}?token={tokenconsul}",
                    timeout=4,
                )
                d = r.json()
                if r.status_code == 200 and d.get("nombres"):
                    full_name = f"{d['nombres']} {d['apellidoPaterno']} {d.get('apellidoMaterno', '')}".strip()

                    # 👇 SOLO GUARDAMOS tax_id y name
                    new_s = Supplier.objects.create(tax_id=doc_number, name=full_name)
                    return Response(self.get_serializer(new_s).data)

            # RUC (11 dígitos)
            elif len(doc_number) == 11:
                r = requests.get(
                    f"https://dniruc.apisperu.com/api/v1/ruc/{doc_number}?token={tokenconsul}",
                    timeout=4,
                )
                d = r.json()
                if r.status_code == 200 and d.get("razonSocial"):
                    # Obtenemos la dirección de SUNAT, si viene vacía o con un guion "-", la dejamos en blanco
                    raw_address = d.get("direccion", "")
                    clean_address = raw_address if raw_address != "-" else ""

                    # 👇 AHORA SÍ GUARDAMOS LA DIRECCIÓN OFICIAL
                    new_s = Supplier.objects.create(
                        tax_id=doc_number,
                        name=d["razonSocial"],
                        address=clean_address,  # 👈 Asegúrate de que el campo en tu models.py se llame 'address'
                    )
                    return Response(self.get_serializer(new_s).data)

        except requests.exceptions.Timeout:
            return Response(
                {
                    "error": "El servidor de SUNAT/RENIEC está tardando mucho en responder."
                },
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as e:
            print(f"Error consultando proveedor externo: {e}")
            pass  # Si falla, bajamos al error 404 general

        return Response(
            {"error": "Proveedor no encontrado ni localmente ni en SUNAT."},
            status=status.HTTP_404_NOT_FOUND,
        )

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
                # Buscamos la fecha de vencimiento más antigua
                next_due_date=Min("due_date"),
            )
            # Ordenamos: Primero los que vencen antes (o ya vencieron), luego por deuda mayor
            .order_by("next_due_date", "-total_debt")
        )

        # 3. Paginación manual para el Lazy Loading
        page = int(request.query_params.get("page", 1))
        page_size = 20
        start = (page - 1) * page_size
        end = start + page_size

        data = list(suppliers_debt)
        paginated_data = data[start:end]

        return Response(
            {
                "results": paginated_data,
                "next": True if len(data) > end else False,
                "total_global_debt": sum(item["total_debt"] for item in data),
            }
        )

    @action(detail=True, methods=["get"])
    def pending_invoices(self, request, pk=None):
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
        supplier = self.get_object()
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        # 1. Obtener Compras
        purchases = Purchase.objects.filter(supplier=supplier)
        if start_date:
            purchases = purchases.filter(issue_date__gte=start_date)
        if end_date:
            purchases = purchases.filter(issue_date__lte=end_date)

        purchases_data = [
            {
                "id": p.id,
                "purchase_id": p.id,
                "date": p.issue_date,
                "type": "COMPRA",
                "document": f"{p.document_type} {p.series}-{p.number}",
                "amount": -float(p.total_net_pay),
                "status": p.payment_status,
                "description": "Compra",
            }
            for p in purchases
        ]

        # 2. Obtener Transacciones
        transactions = SupplierTransaction.objects.filter(supplier=supplier)
        if start_date:
            transactions = transactions.filter(created_at__date__gte=start_date)
        if end_date:
            transactions = transactions.filter(created_at__date__lte=end_date)

        transactions_data = [
            {
                "id": t.id,
                "purchase_id": None,
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
        "details__area": ["exact"],
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

    @action(detail=False, methods=["get"])
    def export_excel(self, request):
        # 1. Filtramos las compras usando los mismos filtros de la pantalla y pre-cargamos detalles
        queryset = self.filter_queryset(self.get_queryset()).prefetch_related("details")

        # 2. Creamos el archivo Excel en memoria
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Historial de Compras"

        # 3. Cabeceras
        headers = [
            "Fecha Emisión",
            "Documento",
            "Serie-Número",
            "RUC Proveedor",
            "Razón Social",
            "Moneda",
            "Tipo Costo",
            "Método de Pago",
            "Valor Venta (Subtotal)",
            "Gravado",
            "No Gravado",
            "IGV",
            "Total",
            "Estado Pago",
        ]
        ws.append(headers)

        # 4. Iteramos y llenamos datos
        for p in queryset:
            # Calculamos dinámicamente sumando las líneas
            gravado = sum(
                float(d.total_value) for d in p.details.all() if d.tax_percentage > 0
            )
            no_gravado = sum(
                float(d.total_value) for d in p.details.all() if d.tax_percentage == 0
            )

            ws.append(
                [
                    p.issue_date.strftime("%d/%m/%Y") if p.issue_date else "-",
                    p.get_document_type_display(),
                    f"{p.series}-{p.number}",
                    p.supplier.tax_id if p.supplier else "-",
                    p.supplier.name if p.supplier else "-",
                    p.get_currency_display(),
                    p.get_cost_type_display(),
                    p.get_payment_method_display()
                    if hasattr(p, "get_payment_method_display")
                    else p.payment_method,
                    float(p.subtotal),
                    gravado,
                    no_gravado,
                    float(p.tax_amount),
                    float(p.total),
                    p.get_payment_status_display(),
                ]
            )

        # 5. Devolvemos el archivo como respuesta de descarga
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = (
            'attachment; filename="Historial_Compras.xlsx"'
        )
        wb.save(response)

        return response


# --- 5. VIEWSET DE NOTAS DE COMPRA (CRÉDITO / DÉBITO) ---
class PurchaseNoteViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseNoteSerializer  # <-- Este lo crearemos enseguida
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = PurchaseNote.objects.select_related(
            "purchase", "purchase__supplier"
        ).all()
        # Puedes agregar filtros por proveedor, fecha o sucursal aquí si lo necesitas
        return queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            # 1. Guardamos la Nota
            note = serializer.save(user=self.request.user)
            purchase = note.purchase
            supplier = purchase.supplier

            # 2. IMPACTO FINANCIERO (Cuentas por Pagar)
            # - Nota Crédito (07): Reduce la deuda (Monto a favor nuestro)
            # - Nota Débito (08): Aumenta la deuda (Le debemos más al proveedor)
            if note.note_type == "07":
                supplier.balance -= (
                    note.total_net_pay
                    if hasattr(note, "total_net_pay")
                    else note.total_amount_pen
                )
            elif note.note_type == "08":
                supplier.balance += (
                    note.total_net_pay
                    if hasattr(note, "total_net_pay")
                    else note.total_amount_pen
                )

            supplier.save()

            # 3. IMPACTO EN INVENTARIO (Solo si affects_inventory es True)
            if note.affects_inventory:
                for detail in note.details.all():
                    if not detail.product or detail.product.product_type not in [
                        "STOCKED",
                        "CONSUMABLE",
                    ]:
                        continue

                    stock_record, _ = Stock.objects.get_or_create(
                        branch=purchase.branch,
                        product=detail.product,
                        defaults={"quantity": 0, "average_cost": 0},
                    )

                    # A. Lógica para Nota de Crédito (DEVOLUCIÓN: Sale mercadería del almacén)
                    if note.note_type == "07":
                        # Restamos la cantidad
                        stock_record.quantity -= detail.quantity
                        stock_record.save()

                        # Movimiento de Kardex (Salida por Devolución a Proveedor)
                        Kardex.objects.create(
                            branch=purchase.branch,
                            product=detail.product,
                            date=note.issue_date,
                            type="OUT_RETURN",  # Un tipo que podrías tener en tu Kardex para devoluciones
                            quantity=-detail.quantity,  # Negativo porque sale
                            unit_cost=detail.unit_value,
                            total_cost=detail.quantity * detail.unit_value,
                            balance_quantity=stock_record.quantity,
                            balance_unit_cost=stock_record.average_cost,
                            balance_total_cost=stock_record.quantity
                            * stock_record.average_cost,
                            user=self.request.user,
                            description=f"NC {note.series}-{note.number} | Dev. a Proveedor (Ref: {purchase.series}-{purchase.number})",
                        )

                    # B. Lógica para Nota de Débito (INGRESO EXTRA: Entra mercadería olvidada/extra)
                    elif note.note_type == "08":
                        # Sumamos la cantidad y recalculamos costo promedio (igual que una compra normal)
                        old_total = stock_record.quantity * stock_record.average_cost
                        new_total = detail.quantity * detail.unit_value
                        total_qty = stock_record.quantity + detail.quantity

                        new_avg = (
                            (old_total + new_total) / total_qty
                            if total_qty > 0
                            else detail.unit_value
                        )

                        stock_record.quantity = total_qty
                        stock_record.average_cost = new_avg
                        stock_record.save()

                        # Movimiento de Kardex (Ingreso extra)
                        Kardex.objects.create(
                            branch=purchase.branch,
                            product=detail.product,
                            date=note.issue_date,
                            type="IN_PURCHASE",
                            quantity=detail.quantity,
                            unit_cost=detail.unit_value,
                            total_cost=new_total,
                            balance_quantity=stock_record.quantity,
                            balance_unit_cost=stock_record.average_cost,
                            balance_total_cost=stock_record.quantity
                            * stock_record.average_cost,
                            user=self.request.user,
                            description=f"ND {note.series}-{note.number} | Ingreso Adicional (Ref: {purchase.series}-{purchase.number})",
                        )
