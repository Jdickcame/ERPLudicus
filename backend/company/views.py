from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from .models import Company
from .serializers import CompanySerializer


class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        if self.queryset.count() == 0:
            Company.objects.create()
        return self.queryset.all()[:1]
