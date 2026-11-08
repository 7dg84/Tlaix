import uuid
import datetime
from django.db import migrations, models
import django.db.models.deletion


def transfer_cell_values_to_row_tab_data(apps, schema_editor):
    CellValue = apps.get_model('api', 'CellValue')
    RowTabData = apps.get_model('api', 'RowTabData')
    Tab = apps.get_model('api', 'Tab')
    Column = apps.get_model('api', 'Column')

    ignored_count = 0

    for tab in Tab.objects.all().iterator():
        columns = Column.objects.filter(tab_id=tab.id)
        columns_type = {col.id: col.type for col in columns}
        if not columns_type:
            continue

        row_tab_map = {}
        for cell in CellValue.objects.filter(column_id__in=columns_type.keys()).iterator(chunk_size=2000):
            col_type = columns_type.get(cell.column_id)
            if not col_type:
                ignored_count += 1
                continue

            val = None
            if col_type == 'text':
                val = cell.value_text
            elif col_type == 'int':
                val = cell.value_int
            elif col_type == 'float':
                val = cell.value_float
            elif col_type == 'checkbox':
                val = cell.value_bool
            elif col_type == 'select':
                val = cell.value_json if cell.value_json is not None else cell.value_text
            elif col_type == 'date':
                val = cell.value_date.isoformat() if cell.value_date else None

            if cell.row_id not in row_tab_map:
                row_tab_map[cell.row_id] = {}
            row_tab_map[cell.row_id][str(cell.column_id)] = val

        records_to_create = [
            RowTabData(
                id=str(uuid.uuid4()),
                row_id=row_id,
                tab_id=tab.id,
                data=data
            )
            for row_id, data in row_tab_map.items()
        ]

        BATCH_SIZE = 1000
        for i in range(0, len(records_to_create), BATCH_SIZE):
            RowTabData.objects.bulk_create(records_to_create[i:i + BATCH_SIZE])

    if ignored_count > 0:
        print(f"[transfer_cell_values_to_row_tab_data] Advertencia: se ignoraron {ignored_count} celdas huérfanas sin columna válida.")


def reverse_transfer(apps, schema_editor):
    CellValue = apps.get_model('api', 'CellValue')
    RowTabData = apps.get_model('api', 'RowTabData')
    Column = apps.get_model('api', 'Column')

    columns_type = {
        str(col.id): col.type
        for col in Column.objects.all()
    }

    cell_values_to_create = []
    for rtd in RowTabData.objects.all().iterator(chunk_size=1000):
        if not isinstance(rtd.data, dict):
            continue
        for col_id_str, val in rtd.data.items():
            col_type = columns_type.get(col_id_str)
            if not col_type:
                continue

            cell_kwargs = {
                'id': str(uuid.uuid4()),
                'row_id': rtd.row_id,
                'column_id': col_id_str,
            }
            if col_type == 'text':
                cell_kwargs['value_text'] = str(val) if val is not None else None
            elif col_type == 'int':
                if val is not None and val != '':
                    try:
                        cell_kwargs['value_int'] = int(val)
                    except (ValueError, TypeError):
                        cell_kwargs['value_int'] = None
                else:
                    cell_kwargs['value_int'] = None
            elif col_type == 'float':
                if val is not None and val != '':
                    try:
                        cell_kwargs['value_float'] = float(val)
                    except (ValueError, TypeError):
                        cell_kwargs['value_float'] = None
                else:
                    cell_kwargs['value_float'] = None
            elif col_type == 'checkbox':
                cell_kwargs['value_bool'] = bool(val) if val is not None else None
            elif col_type == 'select':
                if isinstance(val, (list, dict)):
                    cell_kwargs['value_json'] = val
                else:
                    cell_kwargs['value_text'] = str(val) if val is not None else None
            elif col_type == 'date':
                if val:
                    try:
                        cell_kwargs['value_date'] = datetime.date.fromisoformat(str(val)[:10])
                    except (ValueError, TypeError):
                        cell_kwargs['value_date'] = None

            cell_values_to_create.append(CellValue(**cell_kwargs))
            if len(cell_values_to_create) >= 1000:
                CellValue.objects.bulk_create(cell_values_to_create, ignore_conflicts=True)
                cell_values_to_create = []

    if cell_values_to_create:
        CellValue.objects.bulk_create(cell_values_to_create, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0012_cellvalue_value_date_alter_column_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='RowTabData',
            fields=[
                ('id', models.CharField(default=uuid.uuid4, max_length=50, primary_key=True, serialize=False)),
                ('data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('row', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tab_data', to='api.row')),
                ('tab', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='row_data', to='api.tab')),
            ],
            options={
                'db_table': 'row_tab_data',
                'unique_together': {('row', 'tab')},
            },
        ),
        migrations.RunPython(
            code=transfer_cell_values_to_row_tab_data,
            reverse_code=reverse_transfer,
        ),
    ]
