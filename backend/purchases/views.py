from decimal import Decimal

import openpyxl
import requests
from core.mixins import BranchAccessMixin
from django.conf import settings
from django.db import transaction
from django.db.models import (
    Count,
    Min,
    Sum,
)
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from inventory.models import Kardex, Stock
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    Area,
    ExpenseCategory,
    Purchase,
    PurchaseNote,
    Supplier,
)
from .serializers import (
    ExpenseCategorySerializer,
    PurchaseNoteSerializer,
    PurchaseSerializer,
    SupplierSerializer,
)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


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
    ordering = ["-id"]

    @action(detail=False, methods=["get"])
    def search_doc(self, request):
        doc_number = request.query_params.get("doc")
        if not doc_number:
            return Response(
                {"error": "Falta enviar el documento"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        supplier = Supplier.objects.filter(tax_id=doc_number).first()
        if supplier:
            return Response(self.get_serializer(supplier).data)

        tokenconsul = getattr(settings, "APISPERU_CONSULTA_TOKEN", None)
        if not tokenconsul:
            return Response(
                {"error": "Token no configurado"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            if len(doc_number) == 8:
                r = requests.get(
                    f"https://dniruc.apisperu.com/api/v1/dni/{doc_number}?token={tokenconsul}",
                    timeout=4,
                )
                d = r.json()
                if r.status_code == 200 and d.get("nombres"):
                    full_name = f"{d['nombres']} {d['apellidoPaterno']} {d.get('apellidoMaterno', '')}".strip()
                    new_s = Supplier.objects.create(tax_id=doc_number, name=full_name)
                    return Response(self.get_serializer(new_s).data)

            elif len(doc_number) == 11:
                r = requests.get(
                    f"https://dniruc.apisperu.com/api/v1/ruc/{doc_number}?token={tokenconsul}",
                    timeout=4,
                )
                d = r.json()
                if r.status_code == 200 and d.get("razonSocial"):
                    raw_address = d.get("direccion", "")
                    clean_address = raw_address if raw_address != "-" else ""
                    new_s = Supplier.objects.create(
                        tax_id=doc_number,
                        name=d["razonSocial"],
                        address=clean_address,
                    )
                    return Response(self.get_serializer(new_s).data)
        except Exception as e:
            print(f"Error externo: {e}")
            pass

        return Response(
            {"error": "Proveedor no encontrado."}, status=status.HTTP_404_NOT_FOUND
        )

    @action(detail=False, methods=["get"])
    def with_debt(self, request):
        branch_id = request.query_params.get("branch_id")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        pending_purchases = Purchase.objects.filter(
            payment_status="PENDING", branch_id=branch_id
        )

        if start_date:
            pending_purchases = pending_purchases.filter(issue_date__gte=start_date)
        if end_date:
            pending_purchases = pending_purchases.filter(issue_date__lte=end_date)

        suppliers_debt = (
            pending_purchases.values("supplier", "supplier__name", "supplier__tax_id")
            .annotate(
                total_debt=Sum("total_net_pay"),
                count=Count("id"),
                next_due_date=Min("due_date"),
            )
            .order_by("next_due_date", "-total_debt")
        )

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

        # 1. COMPRAS
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
                "document": f"{p.get_document_type_display()} {p.series}-{p.number}",
                "amount": -float(p.total_net_pay),
                "status": p.payment_status,
                "description": "Compra",
            }
            for p in purchases
        ]

        # 2. NOTAS DE CRÉDITO Y DÉBITO
        notes = PurchaseNote.objects.filter(purchase__supplier=supplier)
        if start_date:
            notes = notes.filter(issue_date__gte=start_date)
        if end_date:
            notes = notes.filter(issue_date__lte=end_date)

        notes_data = []
        for n in notes:
            is_credit = n.note_type == "07"
            amount = (
                float(n.total_amount_pen) if is_credit else -float(n.total_amount_pen)
            )
            notes_data.append(
                {
                    "id": n.id,
                    "purchase_id": n.purchase.id,
                    "date": n.issue_date,
                    "type": "NOTA_CREDITO" if is_credit else "NOTA_DEBITO",
                    "document": f"{n.get_note_type_display()} {n.series}-{n.number}",
                    "amount": amount,
                    "status": "COMPLETED",
                    "description": n.reason,
                }
            )

        full_statement = purchases_data + notes_data
        full_statement.sort(key=lambda x: str(x["date"]), reverse=True)

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

    @action(detail=True, methods=["post"])
    def sync_balance(self, request, pk=None):
        supplier = self.get_object()

        total_purchases = Purchase.objects.filter(supplier=supplier).aggregate(
            total=Sum("total_net_pay")
        )["total"] or Decimal("0.00")

        notes_08 = PurchaseNote.objects.filter(
            purchase__supplier=supplier, note_type="08"
        ).aggregate(total=Sum("total_amount_pen"))["total"] or Decimal("0.00")

        # Pagos temporalmente en cero, hasta que conectemos la app Treasury
        total_payments = Decimal("0.00")

        notes_07 = PurchaseNote.objects.filter(
            purchase__supplier=supplier, note_type="07"
        ).aggregate(total=Sum("total_amount_pen"))["total"] or Decimal("0.00")

        real_balance = (total_purchases + notes_08) - (total_payments + notes_07)

        supplier.balance = real_balance
        supplier.save()

        return Response(
            {
                "message": "Saldo auditado y corregido exitosamente",
                "new_balance": supplier.balance,
            }
        )


# --- 4. VIEWSET DE COMPRAS ---
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
        queryset = (
            Purchase.objects.select_related("supplier", "branch")
            .all()
            .order_by("-issue_date")
        )
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset.distinct()

    def create(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, "copy") else request.data
        doc_type = data.get("document_type")
        branch_id = data.get("branch_id")

        if doc_type == "SIN_ESPECIFICAR" and branch_id:
            try:
                serie_auto = f"{int(branch_id):04d}"
            except (ValueError, TypeError):
                serie_auto = "0001"

            ultimo = (
                Purchase.objects.filter(
                    document_type="SIN_ESPECIFICAR", series=serie_auto
                )
                .order_by("-number")
                .first()
            )
            if ultimo and ultimo.number and ultimo.number.isdigit():
                numero_auto = str(int(ultimo.number) + 1).zfill(8)
            else:
                numero_auto = "00000001"

            data["series"] = serie_auto
            data["number"] = numero_auto

        supplier_id = data.get("supplier")
        doc_type_final = data.get("document_type")
        serie_final = data.get("series")
        numero_final = data.get("number")

        if supplier_id and doc_type_final and serie_final and numero_final:
            serie_limpia = str(serie_final).strip().upper()
            numero_limpio = str(numero_final).strip().zfill(8)

            data["series"] = serie_limpia
            data["number"] = numero_limpio

            existe_duplicado = Purchase.objects.filter(
                supplier_id=supplier_id,
                document_type=doc_type_final,
                series=serie_limpia,
                number=numero_limpio,
            ).exists()

            if existe_duplicado:
                return Response(
                    {
                        "error": f"Ya tienes registrada una {doc_type_final} con la serie {serie_limpia}-{numero_limpio} para este proveedor."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )

    def perform_create(self, serializer):
        with transaction.atomic():
            purchase = serializer.save()

            for detail in purchase.details.all():
                if not detail.product or detail.product.product_type in [
                    "SERVICE",
                    "ASSET",
                ]:
                    continue

                stock_record, created = Stock.objects.get_or_create(
                    branch=purchase.branch,
                    product=detail.product,
                    defaults={"quantity": 0, "average_cost": 0},
                )

                old_total_value = stock_record.quantity * stock_record.average_cost
                new_entry_cost = detail.unit_value
                new_entry_total = detail.quantity * new_entry_cost
                total_new_quantity = stock_record.quantity + detail.quantity

                if total_new_quantity > 0:
                    new_average_cost = (
                        old_total_value + new_entry_total
                    ) / total_new_quantity
                else:
                    new_average_cost = new_entry_cost

                stock_record.quantity = total_new_quantity
                stock_record.average_cost = new_average_cost
                stock_record.save()

                Kardex.objects.create(
                    branch=purchase.branch,
                    product=detail.product,
                    date=purchase.issue_date,
                    type="IN_PURCHASE",
                    quantity=detail.quantity,
                    unit_cost=new_entry_cost,
                    total_cost=new_entry_total,
                    balance_quantity=stock_record.quantity,
                    balance_unit_cost=stock_record.average_cost,
                    balance_total_cost=stock_record.quantity
                    * stock_record.average_cost,
                    user=self.request.user,
                    description=f"Compra {purchase.series}-{purchase.number} | {purchase.supplier.name}",
                )

            # Las compras ahora siempre nacen en PENDING, sumamos a la deuda y listo.
            if purchase.supplier:
                purchase.supplier.balance += purchase.total_net_pay
                purchase.supplier.save()

    def perform_destroy(self, instance):
        with transaction.atomic():
            for detail in instance.details.all():
                if detail.product and detail.product.product_type in [
                    "STOCKED",
                    "CONSUMABLE",
                ]:
                    try:
                        stock_record = Stock.objects.get(
                            branch=instance.branch, product=detail.product
                        )
                        stock_record.quantity -= detail.quantity
                        stock_record.save()

                        Kardex.objects.create(
                            branch=instance.branch,
                            product=detail.product,
                            type="OUT_ADJUSTMENT",
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

            if instance.payment_status == "PENDING" and instance.supplier:
                instance.supplier.balance -= instance.total_net_pay
                instance.supplier.save()

            instance.delete()

    def perform_update(self, serializer):
        with transaction.atomic():
            old_purchase = self.get_object()

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
                    except Stock.DoesNotExist:
                        pass

            if old_purchase.payment_status == "PENDING" and old_purchase.supplier:
                old_purchase.supplier.balance -= old_purchase.total_net_pay
                old_purchase.supplier.save()

            new_purchase = serializer.save()

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

                    current_val = stock_record.quantity * stock_record.average_cost
                    entry_val = detail.quantity * detail.unit_value
                    new_qty = stock_record.quantity + detail.quantity

                    new_avg = (
                        (current_val + entry_val) / new_qty
                        if new_qty > 0
                        else detail.unit_value
                    )

                    stock_record.quantity = new_qty
                    stock_record.average_cost = new_avg
                    stock_record.save()

                    Kardex.objects.create(
                        branch=new_purchase.branch,
                        product=detail.product,
                        date=new_purchase.issue_date,
                        type="IN_ADJUSTMENT",
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

            if new_purchase.payment_status == "PENDING" and new_purchase.supplier:
                new_purchase.supplier.balance += new_purchase.total_net_pay
                new_purchase.supplier.save()

    @action(detail=False, methods=["get"])
    def choices(self, request):
        def format_opts(choices):
            return [{"value": k, "label": v} for k, v in choices]

        branch_id = request.query_params.get("branch_id")
        areas_qs = Area.objects.all()

        if branch_id:
            areas_qs = areas_qs.filter(branch_configs__branch_id=branch_id).distinct()

        areas_options = [{"value": a.id, "label": a.name} for a in areas_qs]

        return Response(
            {
                "document_types": format_opts(Purchase.DOCUMENT_TYPES),
                "payment_status": format_opts(Purchase.PAYMENT_STATUS),
                "igv_rates": format_opts(Purchase.IGV_RATES),
                "cost_types": format_opts(Purchase.COST_TYPE_CHOICES),
                "areas": areas_options,
            }
        )

    @action(detail=False, methods=["get"])
    def next_sequence(self, request):
        doc_type = request.query_params.get("document_type")
        branch_id = request.query_params.get("branch_id")

        if doc_type == "SIN_ESPECIFICAR" and branch_id:
            try:
                serie_auto = f"{int(branch_id):04d}"
            except (ValueError, TypeError):
                serie_auto = "0001"

            ultimo = (
                Purchase.objects.filter(
                    document_type="SIN_ESPECIFICAR", series=serie_auto
                )
                .order_by("-number")
                .first()
            )
            if ultimo and ultimo.number and ultimo.number.isdigit():
                numero_auto = str(int(ultimo.number) + 1).zfill(8)
            else:
                numero_auto = "00000001"
            return Response({"series": serie_auto, "number": numero_auto})

        return Response({"series": "", "number": ""})

    @action(detail=False, methods=["get"])
    def export_excel(self, request):
        queryset = self.filter_queryset(self.get_queryset()).prefetch_related("details")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Historial de Compras"
        headers = [
            "Fecha Emisión",
            "Documento",
            "Serie-Número",
            "RUC Proveedor",
            "Razón Social",
            "Moneda",
            "Tipo Costo",
            "Valor Venta (Subtotal)",
            "Gravado",
            "No Gravado",
            "IGV",
            "Total",
            "Estado Pago",
        ]
        ws.append(headers)

        for p in queryset:
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
                    float(p.subtotal),
                    gravado,
                    no_gravado,
                    float(p.tax_amount),
                    float(p.total),
                    p.get_payment_status_display(),
                ]
            )

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
    serializer_class = PurchaseNoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PurchaseNote.objects.select_related(
            "purchase", "purchase__supplier"
        ).all()

    def perform_create(self, serializer):
        with transaction.atomic():
            note = serializer.save(user=self.request.user)
            purchase = note.purchase
            supplier = purchase.supplier

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

                    if note.note_type == "07":
                        stock_record.quantity -= detail.quantity
                        stock_record.save()
                        Kardex.objects.create(
                            branch=purchase.branch,
                            product=detail.product,
                            date=note.issue_date,
                            type="OUT_RETURN",
                            quantity=-detail.quantity,
                            unit_cost=detail.unit_value,
                            total_cost=detail.quantity * detail.unit_value,
                            balance_quantity=stock_record.quantity,
                            balance_unit_cost=stock_record.average_cost,
                            balance_total_cost=stock_record.quantity
                            * stock_record.average_cost,
                            user=self.request.user,
                            description=f"NC {note.series}-{note.number} | Dev. a Proveedor (Ref: {purchase.series}-{purchase.number})",
                        )
                    elif note.note_type == "08":
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
