from rest_framework import serializers

from .models import ExchangeRate


class ExchangeRateSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True
    )

    class Meta:
        model = ExchangeRate
        fields = [
            "id",
            "date",
            "buy_rate",
            "sell_rate",
            "created_at",
            "updated_by_name",
        ]
