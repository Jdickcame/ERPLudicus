from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    # Cuántos registros devolver por defecto si el frontend no especifica
    page_size = 20

    # ¡ESTA ES LA MAGIA! Le dice a Django que acepte el parámetro ?page_size=50 del frontend
    page_size_query_param = "page_size"

    # Límite máximo de seguridad para que nadie pida 1 millón de registros y cuelgue el servidor
    max_page_size = 100

    # (Opcional) Sobrescribimos el response para asegurar que siempre envíe el total_pages
    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.page.paginator.count,
                "total_pages": self.page.paginator.num_pages,  # Súper útil para el frontend
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )
