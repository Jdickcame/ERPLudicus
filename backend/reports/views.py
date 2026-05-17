from django.db.models import F, Sum
from django.db.models.functions import (
    TruncDay,  # 👈 Cambiado a días para ver la evolución del mes
)
from inventory.models import Stock
from purchases.models import Purchase
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from sales.models import Sale, SaleDetail


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")

        # 👇 NUEVO: Capturamos el Año y Mes seleccionado en React
        year = request.query_params.get("year")
        month = request.query_params.get("month")

        print(
            f"BACKEND: Peticion Dashboard - Sede: {branch_id} | Periodo: {month}/{year}"
        )

        # 1. PREPARAR QUERYSETS BASE
        valid_sales_qs = Sale.objects.filter(status="COMPLETED", is_courtesy=False)
        purchases_qs = Purchase.objects.all()
        stock_qs = Stock.objects.all()

        if branch_id:
            valid_sales_qs = valid_sales_qs.filter(branch_id=branch_id)
            purchases_qs = purchases_qs.filter(branch_id=branch_id)
            stock_qs = stock_qs.filter(branch_id=branch_id)

        # 2. FILTRAR POR PERIODO (La magia del Devengado)
        if year and month:
            # Ventas: Filtramos por la fecha de emisión (No tienen periodo presupuestal)
            valid_sales_qs = valid_sales_qs.filter(date__year=year, date__month=month)

            # Compras: Filtramos por tu campo de presupuesto exacto
            purchases_qs = purchases_qs.filter(
                budget_period__year=year, budget_period__month=month
            )

        # 3. CALCULAR KPIs (Bruto y Neto) del mes seleccionado
        total_sales_gross = valid_sales_qs.aggregate(total=Sum("total"))["total"] or 0
        total_sales_net = (
            valid_sales_qs.aggregate(neto=Sum(F("total") - F("total_igv")))["neto"] or 0
        )

        total_purchases_gross = purchases_qs.aggregate(total=Sum("total"))["total"] or 0
        total_purchases_net = (
            purchases_qs.aggregate(neto=Sum(F("total") - F("tax_amount")))["neto"] or 0
        )

        # El stock es una "foto actual", no se filtra por mes
        product_count = stock_qs.count()
        low_stock_count = stock_qs.filter(quantity__lt=10).count()

        # 4. GRÁFICO DE VENTAS (Día a Día del mes seleccionado)
        sales_over_time_qs = (
            valid_sales_qs.annotate(day_trunc=TruncDay("date"))
            .values("day_trunc")
            .annotate(
                total_bruto=Sum("total"), total_neto=Sum(F("total") - F("total_igv"))
            )
            .order_by("day_trunc")
        )

        formatted_sales_chart = []
        for entry in sales_over_time_qs:
            day_date = entry["day_trunc"]
            if day_date:
                # Formato final: "01 Mar", "15 Mar", etc.
                formatted_sales_chart.append(
                    {
                        "day": f"{day_date.strftime('%d')} {day_date.strftime('%b')}",
                        "total_bruto": entry["total_bruto"] or 0,
                        "total_neto": entry["total_neto"] or 0,
                    }
                )

        # 5. TOP PRODUCTOS DEL MES (Top 5)
        top_products_qs = SaleDetail.objects.filter(
            sale__status="COMPLETED", sale__is_courtesy=False
        )

        if branch_id:
            top_products_qs = top_products_qs.filter(sale__branch_id=branch_id)

        if year and month:
            top_products_qs = top_products_qs.filter(
                sale__date__year=year, sale__date__month=month
            )

        top_products = (
            top_products_qs.values("product__name")
            .annotate(total_sold=Sum("quantity"), revenue=Sum("subtotal"))
            .order_by("-total_sold")[:5]
        )

        return Response(
            {
                "kpis": {
                    "total_sales_gross": total_sales_gross,
                    "total_sales_net": total_sales_net,
                    "total_sales": total_sales_gross,
                    "total_purchases_gross": total_purchases_gross,
                    "total_purchases_net": total_purchases_net,
                    "total_purchases": total_purchases_gross,
                    "product_count": product_count,
                    "low_stock_count": low_stock_count,
                },
                "sales_chart": formatted_sales_chart,
                "top_products": top_products,
            }
        )
