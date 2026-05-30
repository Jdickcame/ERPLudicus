from django.db.models import ExpressionWrapper, F, FloatField, Sum
from django.db.models.functions import (
    TruncDay,
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


class ProductSalesReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        category_id = request.query_params.get("category_id")
        area_id = request.query_params.get(
            "area_id"
        )  # Por si quieres filtrar por "Cafetería" o "Cocina"

        # 1. Empezamos consultando el detalle de ventas (solo ventas completadas)
        qs = SaleDetail.objects.filter(
            sale__status="COMPLETED",
            sale__is_courtesy=False,  # Ocultamos regalos por defecto para ver ventas reales
        )

        # 2. Aplicamos Filtros
        if branch_id:
            qs = qs.filter(sale__branch_id=branch_id)

        if start_date:
            qs = qs.filter(sale__date__date__gte=start_date)
        if end_date:
            qs = qs.filter(sale__date__date__lte=end_date)

        if category_id:
            qs = qs.filter(product__category_id=category_id)
        if area_id:
            qs = qs.filter(product__area_id=area_id)

        # 3. LA CONSULTA MÁGICA: Agrupamos por producto y sumamos
        # Calculamos la utilidad restando el costo total a la venta total
        report_data = (
            qs.values(
                "product_id",
                product_name=F("product__name"),
                product_sku=F("product__sku"),
                category_name=F("product__category__name"),
            )
            .annotate(
                total_quantity=Sum("quantity"),
                total_revenue=Sum("subtotal"),
                # Calculamos el costo total de este producto vendido en el periodo
                total_cost=Sum(
                    ExpressionWrapper(
                        F("quantity") * F("unit_cost"), output_field=FloatField()
                    )
                ),
            )
            # Calculamos la ganancia neta (Utilidad Bruta)
            .annotate(
                gross_profit=ExpressionWrapper(
                    F("total_revenue") - F("total_cost"), output_field=FloatField()
                )
            )
            .order_by("-total_quantity")  # Ordenamos por cantidad vendida por defecto
        )

        # 4. Calculamos Totales Generales para la cabecera del reporte
        totals = report_data.aggregate(
            sum_quantity=Sum("total_quantity"),
            sum_revenue=Sum("total_revenue"),
            sum_cost=Sum("total_cost"),
            sum_profit=Sum("gross_profit"),
        )

        return Response(
            {
                "summary": {
                    "total_items_sold": totals.get("sum_quantity") or 0,
                    "total_revenue": totals.get("sum_revenue") or 0,
                    "total_cost": totals.get("sum_cost") or 0,
                    "total_gross_profit": totals.get("sum_profit") or 0,
                },
                "results": report_data,
            }
        )
