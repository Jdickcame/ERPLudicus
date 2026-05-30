from django.urls import path

from .views import DashboardStatsView, ProductSalesReportView

urlpatterns = [
    path("dashboard/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path(
        "product-sales/",
        ProductSalesReportView.as_view(),
        name="report-product-sales",
    ),
]
