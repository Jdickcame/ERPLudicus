from datetime import timedelta

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

# Importamos los modelos necesarios
from inventory.models import Stock  # <--- IMPORTANTE: Importar Stock
from purchases.models import Purchase
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from sales.models import Sale, SaleDetail


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now()
        last_30_days = today - timedelta(days=30)

        # 1. OBTENER LA SEDE (SI EXISTE)
        branch_id = request.query_params.get("branch_id")

        print(f"BACKEND: Peticion recibida en Dashboard")  # noqa: F541
        print(f"branch_id recibido: {branch_id}")
        print(
            f" Usuario solicitante: {request.user.username} (Rol: {request.user.role})"
        )

        # 2. PREPARAR LOS QUERYSETS BASE (FILTRADOS)
        sales_qs = Sale.objects.all()
        purchases_qs = Purchase.objects.all()
        # Usamos Stock en lugar de Product para contar inventario real por sede
        stock_qs = Stock.objects.all()

        if branch_id:
            sales_qs = sales_qs.filter(branch_id=branch_id)
            purchases_qs = purchases_qs.filter(branch_id=branch_id)
            stock_qs = stock_qs.filter(branch_id=branch_id)

        # 3. CALCULAR KPIs (Usando los QuerySets filtrados)
        total_sales = sales_qs.aggregate(total=Sum("total"))["total"] or 0
        total_purchases = purchases_qs.aggregate(total=Sum("total"))["total"] or 0

        # Cantidad de productos únicos DISPONIBLES EN ESA SEDE
        # (Si no hay filtro de sede, cuenta todos los registros de stock)
        product_count = stock_qs.count()

        # Productos con Stock Bajo (< 10) EN ESA SEDE
        low_stock_count = stock_qs.filter(quantity__lt=10).count()

        # 4. GRÁFICO DE VENTAS (Últimos 30 días)
        sales_over_time = (
            sales_qs.filter(date__gte=last_30_days)
            .annotate(day=TruncDate("date"))
            .values("day")
            .annotate(total=Sum("total"), count=Count("id"))
            .order_by("day")
        )

        # 5. TOP PRODUCTOS (Top 5)
        # Filtramos SaleDetail a través de la relación con Sale (sale__branch_id)
        top_products_qs = SaleDetail.objects.all()
        if branch_id:
            top_products_qs = top_products_qs.filter(sale__branch_id=branch_id)

        top_products = (
            top_products_qs.values("product__name")
            .annotate(total_sold=Sum("quantity"), revenue=Sum("subtotal"))
            .order_by("-total_sold")[:5]
        )

        return Response(
            {
                "kpis": {
                    "total_sales": total_sales,
                    "total_purchases": total_purchases,
                    "product_count": product_count,
                    "low_stock_count": low_stock_count,
                },
                "sales_chart": sales_over_time,
                "top_products": top_products,
            }
        )
