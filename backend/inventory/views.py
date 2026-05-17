from decimal import Decimal

from core.mixins import BranchAccessMixin
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    Category,
    InventoryAdjustment,
    InventoryAdjustmentDetail,
    Kardex,
    Product,
    ProductRecipe,
    Stock,
    Tag,
    Transfer,
)
from .serializers import (
    CategorySerializer,
    InventoryAdjustmentSerializer,
    KardexSerializer,
    ProductRecipeSerializer,
    ProductSerializer,
    StockSerializer,
    TagSerializer,
    TransferSerializer,
)


class DynamicPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"  # Permite cambiar a 20, 50, etc.
    max_page_size = 1000


# --- 1. CATEGORÍAS Y ETIQUETAS ---
class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]


# --- 2. PRODUCTOS Y RECETAS ---
class ProductViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    queryset = Product.objects.filter(is_active=True).prefetch_related(
        "tags", "category"
    )
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        # Usamos el Soft Delete que programamos en el modelo
        instance.delete()

    @action(detail=False, methods=["get"])
    def choices(self, request):
        from .models import Product  # Asegúrate de que el modelo esté importado

        def format_opts(choices):
            return [{"value": k, "label": v} for k, v in choices]

        return Response(
            {
                "product_types": format_opts(Product.PRODUCT_TYPES),
                "uom_choices": format_opts(Product.UOM_CHOICES),
            }
        )


class ProductRecipeViewSet(viewsets.ModelViewSet):
    queryset = ProductRecipe.objects.all()
    serializer_class = ProductRecipeSerializer
    permission_classes = [IsAuthenticated]

    # Filtro para ver la receta de un producto específico
    def get_queryset(self):
        qs = super().get_queryset()
        finished_product_id = self.request.query_params.get("finished_product")
        if finished_product_id:
            qs = qs.filter(finished_product_id=finished_product_id)
        return qs


# --- 3. STOCK ACTUAL ---
class StockViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    serializer_class = StockSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Stock.objects.filter(
            product__is_active=True, is_active=True
        ).select_related("product", "branch")
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


# --- 4. KARDEX (HISTORIAL) ---
class KardexViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    serializer_class = KardexSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "head", "options"]

    pagination_class = DynamicPagination

    def get_queryset(self):
        queryset = (
            Kardex.objects.all()
            .order_by("-date")
            .select_related("product", "branch", "user")
        )

        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)

        product_id = self.request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)

        # 👇 NUEVO: FILTROS DE RANGO DE FECHAS 👇
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if start_date:
            queryset = queryset.filter(date__gte=f"{start_date} 00:00:00")
        if end_date:
            queryset = queryset.filter(date__lte=f"{end_date} 23:59:59")

        return queryset


# --- 5. MOTOR DE AJUSTES (MERMAS, SOBRANTES, INICIAL) ---
class InventoryAdjustmentViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    queryset = InventoryAdjustment.objects.all().order_by("-created_at")
    serializer_class = InventoryAdjustmentSerializer
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        branch_id = request.data.get("branch_id")
        adj_type = request.data.get("type")
        reason = request.data.get("reason", "Ajuste manual")
        details = request.data.get(
            "details", []
        )  # Lista de {product_id, quantity, unit_cost}

        if not details:
            return Response(
                {"error": "Debe incluir al menos un producto"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Crear la cabecera del Ajuste
        adjustment = InventoryAdjustment.objects.create(
            branch_id=branch_id, type=adj_type, reason=reason, created_by=request.user
        )

        # Mapeo de reglas según el tipo de ajuste
        # Si es positivo (Entrada), suma. Si es negativo (Salida), resta.
        is_entry = adj_type in ["MERMA_RETURN", "ADJUST_IN", "INITIAL"]

        kardex_type_map = {
            "MERMA_OUT": "OUT_MERMA",
            "MERMA_RETURN": "IN_RETURN",
            "INTERNAL": "OUT_ADJUSTMENT",
            "ADJUST_IN": "IN_ADJUSTMENT",
            "ADJUST_OUT": "OUT_ADJUSTMENT",
            "INITIAL": "IN_ADJUSTMENT",
        }
        k_type = kardex_type_map.get(adj_type, "OUT_ADJUSTMENT")

        for item in details:
            product = get_object_or_404(Product, id=item.get("product_id"))

            # Si el producto no maneja stock (ej. servicios), lo ignoramos
            if not product.manage_stock:
                continue

            qty = Decimal(str(item.get("quantity", 0)))
            if qty <= 0:
                raise ValueError(f"La cantidad de {product.name} debe ser mayor a 0")

            # Obtenemos o creamos el stock para bloquearlo temporalmente mientras operamos
            stock, created = Stock.objects.select_for_update().get_or_create(
                branch_id=branch_id,
                product=product,
                defaults={"quantity": 0, "average_cost": 0},
            )

            # Lógica de Salida vs Entrada
            if not is_entry:
                if stock.quantity < qty:
                    raise ValueError(
                        f"Stock insuficiente para {product.name}. Actual: {stock.quantity}"
                    )

                # En salidas, usamos el costo promedio actual del almacén
                costo_unitario = stock.average_cost
                qty_kardex = -qty
                stock.quantity -= qty
            else:
                # En entradas, usamos el costo que nos envían o el actual si mandan 0
                costo_unitario = Decimal(str(item.get("unit_cost", stock.average_cost)))

                # Recalculamos el Costo Promedio Ponderado (CPP) si es una entrada
                total_value_old = stock.quantity * stock.average_cost
                total_value_new = qty * costo_unitario
                new_qty = stock.quantity + qty
                stock.average_cost = (
                    (total_value_old + total_value_new) / new_qty if new_qty > 0 else 0
                )

                qty_kardex = qty
                stock.quantity = new_qty

            stock.save()

            # Guardar el detalle del ajuste
            InventoryAdjustmentDetail.objects.create(
                adjustment=adjustment,
                product=product,
                quantity=qty,
                unit_cost=costo_unitario,
            )

            # Registrar en KARDEX
            Kardex.objects.create(
                branch_id=branch_id,
                product=product,
                type=k_type,
                quantity=qty_kardex,
                unit_cost=costo_unitario,
                total_cost=qty * costo_unitario,
                balance_quantity=stock.quantity,
                balance_unit_cost=stock.average_cost,
                balance_total_cost=stock.quantity * stock.average_cost,
                user=request.user,
                reference_document=f"AJUSTE #{adjustment.id}",
                description=reason,
            )

        serializer = self.get_serializer(adjustment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# --- 6. MOTOR DE TRASLADOS (ENTRE SEDES) ---
class TransferViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    queryset = Transfer.objects.all().order_by("-created_at")
    serializer_class = TransferSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def receive(self, request, pk=None):
        """
        Punto final donde la sede de destino dice: "Ya me llegó la mercadería".
        Aquí es donde restamos a origen y le sumamos a destino.
        """
        transfer = self.get_object()

        if transfer.status != "PENDING":
            return Response(
                {"error": "Solo se pueden recibir traslados pendientes"}, status=400
            )

        # Procesar cada producto del traslado
        for detail in transfer.details.all():
            if not detail.product.manage_stock:
                continue

            # 1. QUITAR DE ORIGEN
            stock_origin = Stock.objects.select_for_update().get(
                branch=transfer.origin_branch, product=detail.product
            )

            # 👇 CORRECCIÓN: Devolvemos un Response 400 en vez de un raise ValueError 👇
            if stock_origin.quantity < detail.quantity:
                return Response(
                    {
                        "error": f"La sede origen ya no tiene stock suficiente de '{detail.product.name}' para completar este traslado (Stock actual: {stock_origin.quantity})."
                    },
                    status=400,
                )

            costo_traslado = stock_origin.average_cost  # Se va con el costo de origen
            stock_origin.quantity -= detail.quantity
            stock_origin.save()

            # Kardex Origen
            Kardex.objects.create(
                branch=transfer.origin_branch,
                product=detail.product,
                type="OUT_TRANSFER",
                quantity=-detail.quantity,
                unit_cost=costo_traslado,
                total_cost=detail.quantity * costo_traslado,
                balance_quantity=stock_origin.quantity,
                balance_unit_cost=stock_origin.average_cost,
                balance_total_cost=stock_origin.quantity * stock_origin.average_cost,
                user=request.user,
                reference_document=f"TRASLADO OUT #{transfer.id}",
            )

            # 2. PONER EN DESTINO
            stock_dest, _ = Stock.objects.select_for_update().get_or_create(
                branch=transfer.destination_branch,
                product=detail.product,
                defaults={"quantity": 0, "average_cost": costo_traslado},
            )

            # Recalcular Promedio en Destino
            total_old = stock_dest.quantity * stock_dest.average_cost
            total_new = detail.quantity * costo_traslado
            stock_dest.quantity += detail.quantity

            # Evitar división por cero por seguridad matemática
            if stock_dest.quantity > 0:
                stock_dest.average_cost = (total_old + total_new) / stock_dest.quantity

            stock_dest.save()

            # Kardex Destino
            Kardex.objects.create(
                branch=transfer.destination_branch,
                product=detail.product,
                type="IN_TRANSFER",
                quantity=detail.quantity,
                unit_cost=costo_traslado,
                total_cost=detail.quantity * costo_traslado,
                balance_quantity=stock_dest.quantity,
                balance_unit_cost=stock_dest.average_cost,
                balance_total_cost=stock_dest.quantity * stock_dest.average_cost,
                user=request.user,
                reference_document=f"TRASLADO IN #{transfer.id}",
            )

        # 3. Marcar como completado
        transfer.status = "COMPLETED"
        transfer.received_by = request.user
        transfer.save()

        return Response(
            {"message": "Traslado recibido exitosamente y stock actualizado"}
        )
