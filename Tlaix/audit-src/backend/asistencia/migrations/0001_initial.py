from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('api', '0012_cellvalue_value_date_alter_column_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='AttendanceMember',
            fields=[
                ('identifier', models.CharField(max_length=20, primary_key=True, serialize=False)),
                ('member_type', models.CharField(choices=[('STUDENT', 'Estudiante'), ('STAFF', 'Personal'), ('OTHER', 'Otro')], max_length=20)),
                ('first_name', models.CharField(max_length=100)),
                ('last_name', models.CharField(max_length=100)),
                ('second_last_name', models.CharField(blank=True, max_length=100, null=True)),
                ('email', models.EmailField(blank=True, max_length=254, null=True)),
                ('phone', models.CharField(blank=True, max_length=30, null=True)),
                ('photo', models.ImageField(blank=True, null=True, upload_to='asistencia/fotos/')),
                ('extra_attributes', models.JSONField(blank=True, default=dict)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'verbose_name': 'Miembro de Asistencia',
                'verbose_name_plural': 'Miembros de Asistencia',
                'db_table': 'attendance_members',
            },
        ),
        migrations.CreateModel(
            name='AttendanceRelation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='relations', to='asistencia.attendancemember')),
                ('row', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_relations', to='api.row')),
                ('table', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_relations', to='api.table')),
            ],
            options={
                'verbose_name': 'Relación de Asistencia',
                'verbose_name_plural': 'Relaciones de Asistencia',
                'db_table': 'attendance_relations',
                'unique_together': {('member', 'table', 'row')},
            },
        ),
    ]
