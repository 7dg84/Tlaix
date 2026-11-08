from django.db import migrations


def migrate_legacy_data(apps, schema_editor):
    try:
        Student = apps.get_model('students', 'Student')
        StudentRelation = apps.get_model('students', 'Relation')
    except LookupError:
        Student = None
        StudentRelation = None

    try:
        Personal = apps.get_model('personal', 'Personal')
        PersonalRelation = apps.get_model('personal', 'Relation')
    except LookupError:
        Personal = None
        PersonalRelation = None

    AttendanceMember = apps.get_model('asistencia', 'AttendanceMember')
    AttendanceRelation = apps.get_model('asistencia', 'AttendanceRelation')

    # 1. Migrar Estudiantes existentes
    if Student:
        for s in Student.objects.all():
            name_parts = s.name.strip().split(' ', 1)
            first_name = name_parts[0]
            last_name = name_parts[1] if len(name_parts) > 1 else ''

            member, _ = AttendanceMember.objects.get_or_create(
                identifier=s.no_control,
                defaults={
                    'member_type': 'STUDENT',
                    'first_name': first_name,
                    'last_name': last_name,
                    'second_last_name': '',
                    'email': None,
                    'phone': None,
                    'photo': None,
                    'extra_attributes': {
                        'carrera': s.carrera,
                        'turno': s.turno,
                        'plantel': s.plantel,
                    },
                    'is_active': True,
                }
            )

        if StudentRelation:
            for rel in StudentRelation.objects.all():
                AttendanceRelation.objects.get_or_create(
                    member_id=rel.student_id,
                    table_id=rel.table_id,
                    row_id=rel.row_id
                )

    # 2. Migrar Personal existente
    if Personal:
        for p in Personal.objects.all():
            member, _ = AttendanceMember.objects.get_or_create(
                identifier=p.clave_empleado,
                defaults={
                    'member_type': 'STAFF',
                    'first_name': p.nombre,
                    'last_name': p.apellido_paterno,
                    'second_last_name': p.apellido_materno or '',
                    'email': p.correo,
                    'phone': p.telefono,
                    'photo': p.foto,
                    'extra_attributes': {
                        'fecha_ingreso': str(p.fecha_ingreso) if p.fecha_ingreso else None,
                        'nivel_educativo': p.nivel_educativo,
                        'curp': p.curp,
                        'plantel': p.plantel,
                    },
                    'is_active': True,
                }
            )

        if PersonalRelation:
            for rel in PersonalRelation.objects.all():
                AttendanceRelation.objects.get_or_create(
                    member_id=rel.personal_id,
                    table_id=rel.table_id,
                    row_id=rel.row_id
                )


def reverse_legacy_data(apps, schema_editor):
    AttendanceMember = apps.get_model('asistencia', 'AttendanceMember')
    AttendanceRelation = apps.get_model('asistencia', 'AttendanceRelation')
    AttendanceRelation.objects.all().delete()
    AttendanceMember.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('asistencia', '0001_initial'),
        ('students', '0002_alter_student_no_control'),
        ('personal', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(migrate_legacy_data, reverse_legacy_data),
    ]
