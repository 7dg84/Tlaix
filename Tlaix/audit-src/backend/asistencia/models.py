from django.db import models


class AttendanceMember(models.Model):
    MEMBER_TYPE_CHOICES = [
        ('STUDENT', 'Estudiante'),
        ('STAFF', 'Personal'),
        ('OTHER', 'Otro'),
    ]

    identifier = models.CharField(max_length=20, primary_key=True)
    member_type = models.CharField(max_length=20, choices=MEMBER_TYPE_CHOICES)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    second_last_name = models.CharField(max_length=100, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    photo = models.ImageField(upload_to='asistencia/fotos/', blank=True, null=True)
    extra_attributes = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'attendance_members'
        verbose_name = 'Miembro de Asistencia'
        verbose_name_plural = 'Miembros de Asistencia'

    def __str__(self):
        parts = [self.first_name, self.last_name]
        if self.second_last_name:
            parts.append(self.second_last_name)
        full = " ".join(part for part in parts if part).strip()
        return f"{full} ({self.identifier})" if full else self.identifier


class AttendanceRelation(models.Model):
    member = models.ForeignKey(
        AttendanceMember,
        on_delete=models.CASCADE,
        related_name='relations'
    )
    table = models.ForeignKey(
        'api.Table',
        on_delete=models.CASCADE,
        related_name='attendance_relations'
    )
    row = models.ForeignKey(
        'api.Row',
        on_delete=models.CASCADE,
        related_name='attendance_relations'
    )

    class Meta:
        db_table = 'attendance_relations'
        unique_together = [['member', 'table', 'row']]
        verbose_name = 'Relación de Asistencia'
        verbose_name_plural = 'Relaciones de Asistencia'

    def __str__(self):
        return f"{self.member_id} - {self.table.name} - {self.row.name}"
