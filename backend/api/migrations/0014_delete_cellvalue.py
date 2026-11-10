from django.db import migrations


class Migration(migrations.Migration):
    """
    Fase Contract del patron Expand & Contract: elimina la tabla `cell_values`.

    La aplicacion opera exclusivamente sobre `RowTabData` desde la migracion 0013.
    Revertir esta migracion recrea la tabla vacia; los datos solo pueden
    recuperarse desde un respaldo previo (pg_dump).
    """

    dependencies = [
        ('api', '0013_rowtabdata_migration'),
    ]

    operations = [
        migrations.DeleteModel(
            name='CellValue',
        ),
    ]
