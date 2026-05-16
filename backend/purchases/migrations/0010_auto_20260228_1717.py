from django.db import migrations


def merge_areas(apps, schema_editor):
    Area = apps.get_model("purchases", "Area")
    AreaBranchBudget = apps.get_model("purchases", "AreaBranchBudget")
    PurchaseDetail = apps.get_model("purchases", "PurchaseDetail")
    PurchaseNoteDetail = apps.get_model("purchases", "PurchaseNoteDetail")
    AreaMonthlyAdjustment = apps.get_model("purchases", "AreaMonthlyAdjustment")
    AreaMonthlyLimit = apps.get_model("purchases", "AreaMonthlyLimit")

    # Obtenemos todos los nombres únicos (Ej: "ADMINISTRACION", "CAFETERIA")
    unique_names = Area.objects.values_list("name", flat=True).distinct()

    for name in unique_names:
        # Traemos todas las áreas con ese nombre (Ej: ID 2 e ID 4)
        areas = list(Area.objects.filter(name=name).order_by("id"))

        # El primero será nuestro "Área Maestra" global
        master_area = areas[0]

        for area in areas:
            # 1. Copiar el presupuesto a la nueva tabla AreaBranchBudget
            if area.branch:
                AreaBranchBudget.objects.get_or_create(
                    area=master_area,
                    branch=area.branch,
                    defaults={"budget_limit": area.budget_limit},
                )

            # 2. Mudar todo el historial de compras al master_area
            PurchaseDetail.objects.filter(area=area).update(area=master_area)
            PurchaseNoteDetail.objects.filter(area=area).update(area=master_area)

            # 3. Mudar los Ajustes y Límites (y asignarles la sede correspondiente)
            AreaMonthlyAdjustment.objects.filter(area=area).update(
                area=master_area, branch=area.branch
            )
            AreaMonthlyLimit.objects.filter(area=area).update(
                area=master_area, branch=area.branch
            )

            # 4. Eliminar el Área duplicada (Ej: Borramos ID 4 porque ya todo apunta al 2)
            if area.id != master_area.id:
                area.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("purchases", "0009_alter_areamonthlyadjustment_unique_together_and_more"),
    ]

    operations = [
        migrations.RunPython(merge_areas),
    ]
