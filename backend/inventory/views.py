from core.mixins import BranchAccessMixin
from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# 👇 CORRECCIÓN DE IMPORTACIONES
from .models import Category, Kardex, Product, Stock
from .serializers import (
    CategorySerializer,
    KardexSerializer,  # Reemplaza a InventoryMovementSerializer
    ProductSerializer,
    StockSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class ProductViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["get"])
    def stock_by_branch(self, request, pk=None):
        product = self.get_object()
        branch_id = request.query_params.get("branch_id")

        if not branch_id:
            return Response({"error": "branch_id parameter is required"}, status=400)

        try:
            stock_record = Stock.objects.get(product=product, branch_id=branch_id)
            quantity = stock_record.quantity
        except Stock.DoesNotExist:
            quantity = 0

        return Response(
            {"product": product.name, "branch_id": branch_id, "quantity": quantity}
        )


# --- STOCK VIEWSET ---
class StockViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    serializer_class = StockSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Stock.objects.all().select_related("product")
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


# --- 🛡️ NUEVO: KARDEX VIEWSET (Reemplaza a InventoryMovement) ---
class KardexViewSet(BranchAccessMixin, viewsets.ModelViewSet):
    """
    Historial financiero y de movimientos.
    """

    serializer_class = KardexSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Kardex.objects.all().order_by("-date")
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


class InventoryView(BranchAccessMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    # Endpoint para registrar salidas internas (Mermas, Consumos, Regalos)
    @action(detail=False, methods=["post"], url_path="internal-output")
    def internal_output(self, request):
        branch_id = request.data.get("branch_id")
        product_id = request.data.get("product_id")
        quantity = int(request.data.get("quantity", 0))
        reason = request.data.get("reason", "Consumo Interno")
        # Tipos válidos: OUT_INTERNAL, OUT_DAMAGE, etc.
        mov_type = request.data.get("type", "OUT_INTERNAL")

        if quantity <= 0:
            return Response({"error": "La cantidad debe ser mayor a 0"}, status=400)

        try:
            with transaction.atomic():
                # 1. Verificar Stock
                stock_record = Stock.objects.select_for_update().get(
                    branch_id=branch_id, product_id=product_id
                )

                if stock_record.quantity < quantity:
                    return Response(
                        {
                            "error": f"Stock insuficiente. Disponible: {stock_record.quantity}"
                        },
                        status=400,
                    )

                # 2. Capturar Costo Promedio ANTES de la salida
                # (En salidas, el costo unitario es el costo promedio actual)
                current_cost = stock_record.average_cost

                # 3. Restar Stock
                stock_record.quantity -= quantity
                stock_record.save()

                # 4. Registrar en KARDEX (Con datos financieros)
                Kardex.objects.create(
                    branch_id=branch_id,
                    product_id=product_id,
                    quantity=-quantity,  # Negativo porque sale
                    type=mov_type,
                    description=reason,
                    user=request.user,
                    # 💰 Datos Financieros
                    unit_cost=current_cost,
                    total_cost=current_cost * quantity,
                    # 📸 Snapshot del saldo
                    balance_quantity=stock_record.quantity,
                    balance_unit_cost=stock_record.average_cost,
                    balance_total_cost=stock_record.quantity
                    * stock_record.average_cost,
                )

            return Response({"message": "Salida registrada en Kardex correctamente"})

        except Stock.DoesNotExist:
            return Response(
                {"error": "El producto no tiene stock registrado en esta sede"},
                status=404,
            )
        except Exception as e:
            return Response({"error": str(e)}, status=500)
