from django.db import migrations


def copy_area_and_category(apps, schema_editor):
    # Obtenemos los modelos históricos
    Purchase = apps.get_model("purchases", "Purchase")  # noqa: F841
    PurchaseDetail = apps.get_model("purchases", "PurchaseDetail")

    # Recorremos todos los detalles existentes
    for detail in PurchaseDetail.objects.all():
        if detail.purchase:
            # Le pasamos la info de la cabecera al detalle
            detail.area = detail.purchase.area
            detail.category = detail.purchase.category
            detail.save()


class Migration(migrations.Migration):
    dependencies = [
        ("purchases", "0004_purchasedetail_area_purchasedetail_category_and_more"),
    ]

    operations = [
        migrations.RunPython(copy_area_and_category),
    ]
