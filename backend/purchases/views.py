import io
import os
from decimal import Decimal

import openpyxl
import requests
from core.mixins import BranchAccessMixin
from django.conf import settings
from django.db import transaction
from django.db.models import (
    Count,
    F,
    Min,
    Q,
    Sum,
)
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from inventory.models import Kardex, Stock
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from treasury.models import PaymentTransaction

from .models import (
    Area,
    ExpenseCategory,
    Purchase,
    PurchaseNote,
    PurchaseOrder,
    PurchaseOrderDetail,
    Supplier,
)
from .serializers import (
    ExpenseCategorySerializer,
    PurchaseNoteSerializer,
    PurchaseOrderSerializer,
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

    def get_queryset(self):
        # 1. AQUÍ SOLO CALCULAMOS LA FECHA (Ya no ordenamos)
        qs = Supplier.objects.annotate(
            next_due_date=Min(
                "purchase__due_date", filter=Q(purchase__payment_status="PENDING")
            )
        )
        return qs

    def filter_queryset(self, queryset):
        # 2. Dejamos que DRF aplique la búsqueda normal (ej. buscar por RUC)
        qs = super().filter_queryset(queryset)

        # 3. AQUÍ APLICAMOS LA MAGIA (Después de DRF)
        ordering = self.request.query_params.get("ordering")

        if ordering == "next_due_date":
            # Fechas más urgentes arriba, los que no deben nada al fondo
            qs = qs.order_by(F("next_due_date").asc(nulls_last=True))
        elif ordering == "-next_due_date":
            # Fechas lejanas arriba, los que no deben nada al fondo
            qs = qs.order_by(F("next_due_date").desc(nulls_last=True))
        elif ordering:
            # Si ordenan por Nombre o Saldo, orden normal
            qs = qs.order_by(ordering)
        else:
            # Orden por defecto al entrar a la pantalla
            qs = qs.order_by(F("next_due_date").asc(nulls_last=True))

        return qs

    @action(detail=False, methods=["get"])
    def search_doc(self, request):
        doc_number = request.query_params.get("doc")
        if not doc_number:
            return Response({"error": "Falta el numero de documento"}, status=400)

        # 1. BÚSQUEDA LOCAL
        s = Supplier.objects.filter(tax_id=doc_number).first()
        if s:
            return Response({"exists_local": True, "data": self.get_serializer(s).data})

        # 2. DETERMINAR EL TIPO DE DOCUMENTO
        doc_type = None
        if len(doc_number) == 8:
            doc_type = "DNI"
        elif len(doc_number) == 9:
            doc_type = "CEE"
        elif len(doc_number) == 11:
            doc_type = "RUC"

        if not doc_type:
            return Response(
                {"error": "Longitud invalida (DNI=8, CE=9, RUC=11)"}, status=400
            )

        supplier_data = None

        # 3. INTENTO 1: APISPERU (Solo soporta DNI y RUC)
        if doc_type in ["DNI", "RUC"]:
            token_apisperu = getattr(settings, "APISPERU_CONSULTA_TOKEN", "")
            try:
                if doc_type == "DNI":
                    r = requests.get(
                        f"https://dniruc.apisperu.com/api/v1/dni/{doc_number}?token={token_apisperu}",
                        timeout=5,
                    )
                    d = r.json()
                    if r.status_code == 200 and d.get("nombres"):
                        supplier_data = {
                            "name": f"{d.get('nombres', '')} {d.get('apellidoPaterno', '')} {d.get('apellidoMaterno', '')}".strip(),
                            "document_type": "DNI",
                            "tax_id": doc_number,
                            "address": "PERU",
                        }
                elif doc_type == "RUC":
                    r = requests.get(
                        f"https://dniruc.apisperu.com/api/v1/ruc/{doc_number}?token={token_apisperu}",
                        timeout=5,
                    )
                    d = r.json()
                    if r.status_code == 200 and d.get("razonSocial"):
                        supplier_data = {
                            "name": d.get("razonSocial", ""),
                            "document_type": "RUC",
                            "tax_id": doc_number,
                            "address": d.get("direccion", "PERU"),
                        }
            except Exception as e:
                print(f"ApisPeru fallo o demoro ({e}). Saltando a Factiliza...")

        # 4. INTENTO 2: FACTILIZA (DNI, RUC y CEE)
        if not supplier_data:
            print("Consultando API de respaldo (Factiliza) para Proveedores...")
            token_factiliza = getattr(settings, "FACTILIZA_TOKEN", "")
            headers = {"Authorization": f"Bearer {token_factiliza}"}

            try:
                if doc_type == "DNI":
                    r = requests.get(
                        f"https://api.factiliza.com/v1/dni/info/{doc_number}",
                        headers=headers,
                        timeout=5,
                    )
                    resp = r.json()
                    if r.status_code == 200:
                        data = resp.get("data", resp)
                        nombres = data.get("nombres")

                        if nombres:
                            name_str = f"{data.get('nombres', '')} {data.get('apellido_paterno', '')} {data.get('apellido_materno', '')}".strip()
                            supplier_data = {
                                "name": name_str,
                                "document_type": "DNI",
                                "tax_id": doc_number,
                                "address": data.get(
                                    "direccion_completa", data.get("direccion", "PERU")
                                ),
                            }

                elif doc_type == "RUC":
                    r = requests.get(
                        f"https://api.factiliza.com/v1/ruc/info/{doc_number}",
                        headers=headers,
                        timeout=5,
                    )
                    resp = r.json()
                    if r.status_code == 200:
                        data = resp.get("data", resp)
                        razon_social = data.get("nombre_o_razon_social") or data.get(
                            "razon_social"
                        )

                        if razon_social:
                            supplier_data = {
                                "name": str(razon_social).strip(),
                                "document_type": "RUC",
                                "tax_id": doc_number,
                                "address": data.get(
                                    "direccion_completa", data.get("direccion", "PERU")
                                ),
                            }

                elif doc_type == "CEE":
                    r = requests.get(
                        f"https://api.factiliza.com/v1/cee/info/{doc_number}",
                        headers=headers,
                        timeout=5,
                    )
                    resp = r.json()
                    if r.status_code == 200 and resp.get("message") == "Exito":
                        data = resp.get("data", resp)
                        nombres = data.get("nombres")

                        if nombres:
                            name_str = f"{data.get('nombres', '')} {data.get('apellido_paterno', '')} {data.get('apellido_materno', '')}".strip()
                            supplier_data = {
                                "name": name_str,
                                "document_type": "CE",
                                "tax_id": doc_number,
                                "address": "PERU",
                            }
            except Exception as e:
                print(f"Factiliza fallo o crasheo: {e}")

        # 5. RETORNAR RESULTADOS AL FRONTEND
        if supplier_data and supplier_data.get("name"):
            # OJO: Devolvemos 'exists_local': False para que el Frontend pre-llene el formulario y lo guarde
            return Response({"exists_local": False, "data": supplier_data}, status=200)

        return Response(
            {
                "error": "No se encontraron datos en SUNAT/RENIEC/MIGRACIONES. Por favor, ingrese los datos manualmente."
            },
            status=404,
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

        # 👇 NUEVO: 3. PAGOS Y ADELANTOS (Desde Tesorería)
        transactions = PaymentTransaction.objects.filter(supplier=supplier)
        if start_date:
            transactions = transactions.filter(payment_date__gte=start_date)
        if end_date:
            transactions = transactions.filter(payment_date__lte=end_date)

        transactions_data = [
            {
                "id": t.id,
                "purchase_id": None,
                "date": t.payment_date,
                "type": "ADELANTO" if t.transaction_type == "ADVANCE" else "PAGO",
                "document": t.transaction_number or "-",
                "amount": float(t.amount),  # Positivo porque reduce la deuda
                "status": "COMPLETED",
                "description": t.description,
            }
            for t in transactions
        ]

        full_statement = purchases_data + notes_data + transactions_data
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
        total_payments = PaymentTransaction.objects.filter(supplier=supplier).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")

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


class SmartPurchaseSearchFilter(filters.SearchFilter):
    def filter_queryset(self, request, queryset, view):
        search_query = request.query_params.get(self.search_param, "")

        # Si el usuario escribió un guion (Búsqueda inteligente Serie-Número)
        if search_query and "-" in search_query:
            partes = search_query.split("-", 1)
            serie_buscada = partes[0].strip()
            numero_buscado = partes[1].strip()

            return queryset.filter(
                (
                    Q(series__icontains=serie_buscada)
                    & Q(number__icontains=numero_buscado)
                )
                | Q(supplier__name__icontains=search_query)
                | Q(supplier__tax_id__icontains=search_query)
            )

        # Si no hay guion (Ej: busca "Belmark" o "00011219"), usa el buscador normal
        return super().filter_queryset(request, queryset, view)


# --- 4. VIEWSET DE COMPRAS ---
class PurchaseViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    filter_backends = [
        DjangoFilterBackend,
        SmartPurchaseSearchFilter,
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
        # 👇 Volvemos a dejar el queryset limpio, sin la lógica de búsqueda aquí
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

            if purchase.purchase_order:
                oc = purchase.purchase_order
                oc.status = "CLOSED"
                oc.save()

                # Opcional: Actualizar el balance del proveedor si no pagó en efectivo
                if purchase.payment_status == "PENDING" and purchase.supplier:
                    purchase.supplier.balance += purchase.total_net_pay
                    purchase.supplier.save()

                return  # Cortamos la ejecución aquí. NO ingresamos stock duplicado.

            for detail in purchase.details.all():
                if not detail.product or detail.product.product_type in [
                    "SERVICE",
                    "ASSET",
                ]:
                    continue

                # 👇 MAGIA DE CONVERSIÓN DE UNIDADES 👇
                # Multiplicamos la cantidad (ej: 2) por las unidades por empaque (ej: 24)
                # El inventario SIEMPRE maneja unidades base.
                real_quantity = detail.quantity * detail.units_per_package

                # El costo total se mantiene igual (S/ 60.00)
                new_entry_total = detail.quantity * detail.unit_value

                # El nuevo costo unitario real para el almacén (60 / 48 = S/ 1.25)
                # Protegemos contra división por cero
                real_unit_cost = (
                    new_entry_total / real_quantity
                    if real_quantity > 0
                    else Decimal("0.00")
                )
                # 👆 FIN MAGIA 👆

                stock_record, created = Stock.objects.get_or_create(
                    branch=purchase.branch,
                    product=detail.product,
                    defaults={"quantity": 0, "average_cost": 0},
                )

                old_total_value = stock_record.quantity * stock_record.average_cost

                # Sumamos las unidades REALES (48 botellas, no 2 cajas)
                total_new_quantity = stock_record.quantity + real_quantity

                if total_new_quantity > 0:
                    new_average_cost = (
                        old_total_value + new_entry_total
                    ) / total_new_quantity
                else:
                    new_average_cost = real_unit_cost

                stock_record.quantity = total_new_quantity
                stock_record.average_cost = new_average_cost
                stock_record.save()

                Kardex.objects.create(
                    branch=purchase.branch,
                    product=detail.product,
                    date=purchase.issue_date,
                    type="IN_PURCHASE",
                    quantity=real_quantity,  # Guardamos 48 en el Kardex
                    unit_cost=real_unit_cost,  # Costo por botella
                    total_cost=new_entry_total,
                    balance_quantity=stock_record.quantity,
                    balance_unit_cost=stock_record.average_cost,
                    balance_total_cost=stock_record.quantity
                    * stock_record.average_cost,
                    user=self.request.user,
                    # Dejamos claro en el historial cómo se hizo la conversión
                    description=f"Compra {purchase.series}-{purchase.number} | {purchase.supplier.name} | {detail.quantity} {detail.invoice_unit}(s)",
                )

            # Las compras ahora siempre nacen en PENDING, sumamos a la deuda y listo.
            if purchase.supplier:
                purchase.supplier.balance += purchase.total_net_pay
                purchase.supplier.save()

    def perform_destroy(self, instance):
        with transaction.atomic():
            # Si la factura vino de una OC, simplemente reabrimos la OC.
            # El inventario físico sigue en el almacén (solo hemos roto el documento tributario).
            if instance.purchase_order:
                oc = instance.purchase_order
                oc.status = "PARTIAL"  # La regresamos a parcial para que puedan anexar la factura correcta
                oc.save()
            else:
                # Lógica original de reversión de inventario para compras directas
                for detail in instance.details.all():
                    if detail.product and detail.product.product_type in [
                        "STOCKED",
                        "CONSUMABLE",
                    ]:
                        try:
                            # Multiplicamos para saber cuánto debemos quitar
                            real_quantity = detail.quantity * detail.units_per_package

                            stock_record = Stock.objects.get(
                                branch=instance.branch, product=detail.product
                            )
                            stock_record.quantity -= real_quantity
                            stock_record.save()

                            # El costo que devolvemos es el real por unidad
                            real_unit_cost = (
                                (detail.quantity * detail.unit_value) / real_quantity
                                if real_quantity > 0
                                else Decimal("0.00")
                            )

                            Kardex.objects.create(
                                branch=instance.branch,
                                product=detail.product,
                                type="OUT_ADJUSTMENT",
                                quantity=-real_quantity,  # Restamos las 48
                                unit_cost=real_unit_cost,
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

            # 1. Revertimos la compra vieja (Multiplicando por su factor)
            for detail in old_purchase.details.all():
                if detail.product and detail.product.product_type in [
                    "STOCKED",
                    "CONSUMABLE",
                ]:
                    try:
                        real_old_qty = detail.quantity * detail.units_per_package
                        stk = Stock.objects.get(
                            branch=old_purchase.branch, product=detail.product
                        )
                        stk.quantity -= real_old_qty
                        stk.save()
                    except Stock.DoesNotExist:
                        pass

            if old_purchase.payment_status == "PENDING" and old_purchase.supplier:
                old_purchase.supplier.balance -= old_purchase.total_net_pay
                old_purchase.supplier.save()

            # 2. Guardamos la nueva compra
            new_purchase = serializer.save()

            # 3. Ingresamos los nuevos detalles (Multiplicando por el nuevo factor)
            for detail in new_purchase.details.all():
                if detail.product and detail.product.product_type in [
                    "STOCKED",
                    "CONSUMABLE",
                ]:
                    real_quantity = detail.quantity * detail.units_per_package
                    new_entry_total = detail.quantity * detail.unit_value
                    real_unit_cost = (
                        new_entry_total / real_quantity
                        if real_quantity > 0
                        else Decimal("0.00")
                    )

                    stock_record, _ = Stock.objects.get_or_create(
                        branch=new_purchase.branch,
                        product=detail.product,
                        defaults={"quantity": 0, "average_cost": 0},
                    )

                    current_val = stock_record.quantity * stock_record.average_cost
                    new_qty = stock_record.quantity + real_quantity

                    new_avg = (
                        (current_val + new_entry_total) / new_qty
                        if new_qty > 0
                        else real_unit_cost
                    )

                    stock_record.quantity = new_qty
                    stock_record.average_cost = new_avg
                    stock_record.save()

                    Kardex.objects.create(
                        branch=new_purchase.branch,
                        product=detail.product,
                        date=new_purchase.issue_date,
                        type="IN_ADJUSTMENT",
                        quantity=real_quantity,
                        unit_cost=real_unit_cost,
                        total_cost=new_entry_total,
                        balance_quantity=stock_record.quantity,
                        balance_unit_cost=stock_record.average_cost,
                        balance_total_cost=stock_record.quantity
                        * stock_record.average_cost,
                        user=self.request.user,
                        description=f"Edición Compra {new_purchase.series}-{new_purchase.number} | {detail.quantity} {detail.invoice_unit}(s)",
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

                    # 👇 MAGIA DE CONVERSIÓN PARA LAS NOTAS 👇
                    real_quantity = detail.quantity * detail.units_per_package
                    real_unit_cost = (
                        (detail.quantity * detail.unit_value) / real_quantity
                        if real_quantity > 0
                        else Decimal("0.00")
                    )

                    stock_record, _ = Stock.objects.get_or_create(
                        branch=purchase.branch,
                        product=detail.product,
                        defaults={"quantity": 0, "average_cost": 0},
                    )

                    if (
                        note.note_type == "07"
                    ):  # NOTA DE CRÉDITO (Devolución, SALE del stock)
                        stock_record.quantity -= (
                            real_quantity  # 👈 Restamos la cantidad real (Ej: 24)
                        )
                        stock_record.save()
                        Kardex.objects.create(
                            branch=purchase.branch,
                            product=detail.product,
                            date=note.issue_date,
                            type="OUT_RETURN",
                            quantity=-real_quantity,  # 👈 Kardex en negativo
                            unit_cost=real_unit_cost,
                            total_cost=detail.quantity * detail.unit_value,
                            balance_quantity=stock_record.quantity,
                            balance_unit_cost=stock_record.average_cost,
                            balance_total_cost=stock_record.quantity
                            * stock_record.average_cost,
                            user=self.request.user,
                            description=f"NC {note.series}-{note.number} | Dev. a Proveedor (Ref: {purchase.series}-{purchase.number})",
                        )
                    elif (
                        note.note_type == "08"
                    ):  # NOTA DE DÉBITO (Ajuste, ENTRA al stock)
                        old_total = stock_record.quantity * stock_record.average_cost
                        new_total = detail.quantity * detail.unit_value
                        total_qty = (
                            stock_record.quantity + real_quantity
                        )  # 👈 Sumamos cantidad real
                        new_avg = (
                            (old_total + new_total) / total_qty
                            if total_qty > 0
                            else real_unit_cost
                        )

                        stock_record.quantity = total_qty
                        stock_record.average_cost = new_avg
                        stock_record.save()
                        Kardex.objects.create(
                            branch=purchase.branch,
                            product=detail.product,
                            date=note.issue_date,
                            type="IN_PURCHASE",
                            quantity=real_quantity,  # 👈 Kardex en positivo
                            unit_cost=real_unit_cost,
                            total_cost=new_total,
                            balance_quantity=stock_record.quantity,
                            balance_unit_cost=stock_record.average_cost,
                            balance_total_cost=stock_record.quantity
                            * stock_record.average_cost,
                            user=self.request.user,
                            description=f"ND {note.series}-{note.number} | Ingreso Adicional (Ref: {purchase.series}-{purchase.number})",
                        )


# =====================================================================
# --- VIEWSET DE ÓRDENES DE COMPRA (OC) ---
# =====================================================================
class PurchaseOrderViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.all().order_by("-issue_date", "-id")
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = {"branch": ["exact"], "status": ["exact"], "supplier": ["exact"]}
    search_fields = ["code", "supplier__name", "supplier__tax_id"]

    # --- GENERADOR AUTOMÁTICO DE CÓDIGOS (Punto 2) ---
    @action(detail=False, methods=["get"])
    def next_sequence(self, request):
        branch_id = request.query_params.get("branch_id")
        prefix = f"OC-{int(branch_id):02d}" if branch_id else "OC-00"

        last = (
            PurchaseOrder.objects.filter(code__startswith=prefix)
            .order_by("-id")
            .first()
        )
        if last and "-" in last.code:
            try:
                num = int(last.code.split("-")[-1]) + 1
                new_code = f"{prefix}-{str(num).zfill(6)}"
            except:  # noqa: E722
                new_code = f"{prefix}-000001"
        else:
            new_code = f"{prefix}-000001"

        return Response({"code": new_code})

    # --- RECEPCIÓN DE MERCADERÍA Y BONIFICACIONES (Puntos 4 y 5) ---
    @action(detail=True, methods=["post"])
    def receive_items(self, request, pk=None):
        oc = self.get_object()

        if oc.status in ["CLOSED", "CANCELED"]:
            return Response(
                {
                    "error": "No se puede recibir mercadería de una OC Cerrada o Anulada."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        items_data = request.data.get("items", [])
        bonus_data = request.data.get(
            "bonus_items", []
        )  # 👈 NUEVO: Recibe los productos extra

        with transaction.atomic():
            # 1. PROCESAR ITEMS ORIGINALES DE LA OC
            for item in items_data:
                detail = PurchaseOrderDetail.objects.get(
                    id=item["detail_id"], purchase_order=oc
                )
                received_now = Decimal(str(item.get("received_now", 0)))

                if received_now <= 0:
                    continue

                detail.quantity_received += received_now
                detail.save()

                if detail.product and detail.product.product_type in [
                    "STOCKED",
                    "CONSUMABLE",
                ]:
                    real_quantity = received_now * detail.units_per_package
                    total_cost_entry = received_now * detail.unit_value
                    real_unit_cost = detail.unit_value / detail.units_per_package

                    stock_record, _ = Stock.objects.get_or_create(
                        branch=oc.branch,
                        product=detail.product,
                        defaults={"quantity": 0, "average_cost": 0},
                    )

                    old_total_value = stock_record.quantity * stock_record.average_cost
                    new_total_qty = stock_record.quantity + real_quantity
                    new_avg_cost = (
                        (old_total_value + total_cost_entry) / new_total_qty
                        if new_total_qty > 0
                        else real_unit_cost
                    )

                    stock_record.quantity = new_total_qty
                    stock_record.average_cost = new_avg_cost
                    stock_record.save()

                    Kardex.objects.create(
                        branch=oc.branch,
                        product=detail.product,
                        date=timezone.now(),
                        type="IN_PURCHASE",
                        quantity=real_quantity,
                        unit_cost=real_unit_cost,
                        total_cost=total_cost_entry,
                        balance_quantity=stock_record.quantity,
                        balance_unit_cost=stock_record.average_cost,
                        balance_total_cost=stock_record.quantity
                        * stock_record.average_cost,
                        user=request.user,
                        description=f"RECEPCIÓN OC {oc.code} | {received_now} {detail.invoice_unit}(s)",
                    )

            # 2. PROCESAR BONIFICACIONES EXTRA (COSTO CERO)
            from inventory.models import Product

            for bonus in bonus_data:
                prod_id = bonus.get("product_id")
                qty = Decimal(str(bonus.get("quantity", 0)))
                units_pkg = Decimal(str(bonus.get("units_per_package", 1)))
                inv_unit = bonus.get("invoice_unit", "UNIDAD")

                if not prod_id or qty <= 0:
                    continue

                prod_obj = Product.objects.get(id=prod_id)

                # Creamos el registro en la OC para que quede el historial de que llegó
                PurchaseOrderDetail.objects.create(
                    purchase_order=oc,
                    product=prod_obj,
                    invoice_unit=inv_unit,
                    units_per_package=units_pkg,
                    quantity_ordered=0,  # Porque no lo pedimos
                    quantity_received=qty,  # Pero sí llegó
                    unit_value=0,  # Costo cero
                    total_value=0,
                    is_bonus=True,
                )

                if prod_obj.product_type in ["STOCKED", "CONSUMABLE"]:
                    real_quantity = qty * units_pkg
                    stock_record, _ = Stock.objects.get_or_create(
                        branch=oc.branch,
                        product=prod_obj,
                        defaults={"quantity": 0, "average_cost": 0},
                    )

                    # Al ser costo cero, el costo promedio baja (se diluye)
                    old_total_value = stock_record.quantity * stock_record.average_cost
                    new_total_qty = stock_record.quantity + real_quantity
                    new_avg_cost = (
                        old_total_value / new_total_qty if new_total_qty > 0 else 0
                    )

                    stock_record.quantity = new_total_qty
                    stock_record.average_cost = new_avg_cost
                    stock_record.save()

                    Kardex.objects.create(
                        branch=oc.branch,
                        product=prod_obj,
                        date=timezone.now(),
                        type="IN_ADJUSTMENT",
                        quantity=real_quantity,
                        unit_cost=0,
                        total_cost=0,
                        balance_quantity=stock_record.quantity,
                        balance_unit_cost=stock_record.average_cost,
                        balance_total_cost=stock_record.quantity
                        * stock_record.average_cost,
                        user=request.user,
                        description=f"BONIFICACIÓN (Regalo) OC {oc.code} | {qty} {inv_unit}(s)",
                    )

            oc.status = "PARTIAL"
            oc.save()

        return Response(
            {"message": "Recepción y Bonificaciones registradas correctamente."}
        )

    # --- DESCARGA DE PDF PROFESIONAL RE-ESTILIZADO (Morado Neutro / Gris Formal) ---
    @action(detail=True, methods=["get"])
    def download_pdf(self, request, pk=None):
        oc = self.get_object()
        buffer = io.BytesIO()

        # Márgenes optimizados para aprovechar el espacio A4 (19cm útiles)
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1 * cm,
            leftMargin=1 * cm,
            topMargin=1 * cm,
            bottomMargin=1 * cm,
        )
        elements = []
        styles = getSampleStyleSheet()

        # ---------------------------------------------------------
        # PALETA DE COLORES Y ESTILOS FORMALES
        # ---------------------------------------------------------
        COLOR_PRIMARY = colors.HexColor("#4A4A6A")  # Morado neutro / Gris oscuro
        COLOR_SECONDARY = colors.HexColor("#F3F4F6")  # Gris ultra claro (fondos)
        COLOR_LINES = colors.HexColor("#CBD5E1")  # Gris intermedio (bordes)

        bold_style = ParagraphStyle(
            "Bold", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9
        )
        normal_style = ParagraphStyle(
            "Norm", parent=styles["Normal"], fontName="Helvetica", fontSize=9
        )
        right_bold_style = ParagraphStyle(
            "RightBold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            alignment=TA_RIGHT,
        )
        white_bold_style = ParagraphStyle(
            "WhiteBold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            textColor=colors.white,
        )

        # ---------------------------------------------------------
        # 1. CABECERA CON LOGO Y DATOS DE LA EMPRESA
        # ---------------------------------------------------------
        # Buscamos el logo en la carpeta static
        logo_path = os.path.join(settings.BASE_DIR, "static", "logo.png")

        if os.path.exists(logo_path):
            # Si el logo existe, lo ajustamos a un tamaño elegante
            header_logo = Image(
                logo_path, width=5 * cm, height=2 * cm, kind="proportional"
            )
        else:
            # Respaldo por si el logo no se encuentra
            header_logo = Paragraph(
                "<b>AGA CORP S.A.C.</b>",
                ParagraphStyle(
                    "Big",
                    fontSize=16,
                    fontName="Helvetica-Bold",
                    textColor=COLOR_PRIMARY,
                ),
            )

        header_data = [
            [
                header_logo,
                Paragraph(
                    f"<font size=14 color='#4A4A6A'><b>ORDEN DE COMPRA</b></font><br/><br/><b>N° ORDEN:</b> {oc.code}",
                    right_bold_style,
                ),
            ],
            [
                Paragraph("<b>RAZON SOCIAL:</b> AGA CORP S.A.C.", normal_style),
                Paragraph(
                    f"<b>FECHA:</b> {oc.issue_date.strftime('%d/%m/%Y')}",
                    right_bold_style,
                ),
            ],
            [Paragraph("<b>RUC:</b> 20491934671", normal_style), ""],
            [
                Paragraph(
                    "<b>DOMICILIO FISCAL:</b> CAL. SIQUEIROS 110, URB. LA CALERA DE LA MERCED",
                    normal_style,
                ),
                "",
            ],
            [
                Paragraph(
                    "<b>SUCURSAL:</b> AV. AMERICA OESTE 1017 LA LIBERTAD - TRUJILLO",
                    normal_style,
                ),
                "",
            ],
        ]

        # Ancho total: 19cm (12cm + 7cm)
        t_header = Table(header_data, colWidths=[12 * cm, 7 * cm])
        t_header.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(t_header)
        elements.append(Spacer(1, 15))

        # ---------------------------------------------------------
        # 2. BLOQUE DEL PROVEEDOR (BARRA MORADO NEUTRO)
        # ---------------------------------------------------------
        provider_data = [
            [Paragraph("ENVIAR A:", white_bold_style), ""],
            [
                Paragraph(f"<b>PROVEEDOR:</b> {oc.supplier.name}", normal_style),
                Paragraph(
                    f"<b>ENTREGA:</b> {oc.get_delivery_mode_display()}", normal_style
                ),
            ],
            [
                Paragraph(f"<b>RUC:</b> {oc.supplier.tax_id}", normal_style),
                Paragraph(f"<b>CONDICION:</b> {oc.payment_method}", normal_style),
            ],
        ]
        t_provider = Table(provider_data, colWidths=[12 * cm, 7 * cm])
        t_provider.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY),
                    ("SPAN", (0, 0), (1, 0)),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, 0), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                    ("TOPPADDING", (0, 1), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
                    ("BOX", (0, 0), (-1, -1), 0.5, COLOR_LINES),
                ]
            )
        )
        elements.append(t_provider)
        elements.append(Spacer(1, 15))

        # ---------------------------------------------------------
        # 3. TABLA DE PRODUCTOS
        # ---------------------------------------------------------
        table_data = [
            [
                Paragraph(
                    "<b>ITEM</b>",
                    ParagraphStyle(
                        "TH",
                        alignment=TA_CENTER,
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=colors.white,
                    ),
                ),
                Paragraph(
                    "<b>DETALLE</b>",
                    ParagraphStyle(
                        "TH",
                        alignment=TA_LEFT,
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=colors.white,
                    ),
                ),
                Paragraph(
                    "<b>CANTIDAD</b>",
                    ParagraphStyle(
                        "TH",
                        alignment=TA_CENTER,
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=colors.white,
                    ),
                ),
                Paragraph(
                    "<b>UNIDAD</b>",
                    ParagraphStyle(
                        "TH",
                        alignment=TA_CENTER,
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=colors.white,
                    ),
                ),
                Paragraph(
                    "<b>PRECIO<br/>VENTA</b>",
                    ParagraphStyle(
                        "TH",
                        alignment=TA_RIGHT,
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=colors.white,
                    ),
                ),
                Paragraph(
                    "<b>PRECIO<br/>TOTAL</b>",
                    ParagraphStyle(
                        "TH",
                        alignment=TA_RIGHT,
                        fontName="Helvetica-Bold",
                        fontSize=8,
                        textColor=colors.white,
                    ),
                ),
            ]
        ]

        # Iteramos las filas
        for idx, item in enumerate(oc.details.filter(is_bonus=False), 1):
            table_data.append(
                [
                    Paragraph(
                        str(idx).zfill(2),
                        ParagraphStyle("TD", alignment=TA_CENTER, fontSize=8),
                    ),
                    Paragraph(
                        item.product.name,
                        ParagraphStyle("TD", alignment=TA_LEFT, fontSize=8),
                    ),
                    Paragraph(
                        str(item.quantity_ordered),
                        ParagraphStyle("TD", alignment=TA_CENTER, fontSize=8),
                    ),
                    Paragraph(
                        item.invoice_unit,
                        ParagraphStyle("TD", alignment=TA_CENTER, fontSize=8),
                    ),
                    Paragraph(
                        f"{item.unit_value:.2f}",
                        ParagraphStyle("TD", alignment=TA_RIGHT, fontSize=8),
                    ),
                    Paragraph(
                        f"S/ {item.total_value:.2f}",
                        ParagraphStyle("TD", alignment=TA_RIGHT, fontSize=8),
                    ),
                ]
            )

        # Anchos milimétricos que suman 19cm exactos
        t_items = Table(
            table_data,
            colWidths=[1.5 * cm, 8.5 * cm, 2.0 * cm, 2.0 * cm, 2.5 * cm, 2.5 * cm],
        )
        t_items.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, COLOR_SECONDARY],
                    ),  # Filas cebradas (Blanco/Gris clarito)
                    ("GRID", (0, 0), (-1, -1), 0.5, COLOR_LINES),
                ]
            )
        )
        elements.append(t_items)
        elements.append(Spacer(1, 10))

        # ---------------------------------------------------------
        # 4. TOTALES (Alineados a la derecha)
        # ---------------------------------------------------------
        subtotal = (oc.total / Decimal("1.18")).quantize(Decimal("0.00"))
        igv = oc.total - subtotal

        total_data = [
            [
                Paragraph("<b>SUB TOTAL</b>", right_bold_style),
                Paragraph(f"S/ {subtotal}", right_bold_style),
            ],
            [
                Paragraph("<b>IGV (18%)</b>", right_bold_style),
                Paragraph(f"S/ {igv}", right_bold_style),
            ],
            [
                Paragraph("<b>TOTAL</b>", right_bold_style),
                Paragraph(f"S/ {oc.total:.2f}", right_bold_style),
            ],
        ]

        t_totals = Table(total_data, colWidths=[3 * cm, 3 * cm])
        t_totals.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    (
                        "BACKGROUND",
                        (0, 2),
                        (-1, 2),
                        COLOR_SECONDARY,
                    ),  # Fondo grisito para la fila del TOTAL FINAL
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("GRID", (0, 0), (-1, -1), 0.5, COLOR_LINES),
                ]
            )
        )

        t_totals.hAlign = "RIGHT"
        elements.append(t_totals)

        # Notas / Observaciones si las hay
        if oc.notes:
            elements.append(Spacer(1, 15))
            elements.append(Paragraph("<b>OBSERVACIONES:</b>", bold_style))
            elements.append(Paragraph(oc.notes, normal_style))

        # ---------------------------------------------------------
        # GENERACIÓN DEL DOCUMENTO
        # ---------------------------------------------------------
        doc.build(elements)
        buffer.seek(0)

        response = HttpResponse(buffer, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="OC_{oc.code}.pdf"'
        return response
