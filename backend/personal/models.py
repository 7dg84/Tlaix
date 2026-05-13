from django.db import models
from api.models import Table, Row


class Personal(models.Model):
    clave_empleado = models.CharField(max_length=8, primary_key=True, unique=True)
    apellido_paterno = models.CharField(max_length=100)
    apellido_materno = models.CharField(max_length=100)
    nombre = models.CharField(max_length=100)
    plantel = models.CharField(max_length=100)
    fecha_ingreso = models.DateField()
    foto = models.ImageField(upload_to='personal/fotos/', blank=True, null=True)
    curp = models.CharField(max_length=18, blank=True, null=True)
    telefono = models.CharField(max_length=30, blank=True, null=True)
    correo = models.EmailField(blank=True, null=True)
    nivel_educativo = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'personal'

    def __str__(self):
        return f"{self.nombre} {self.apellido_paterno} {self.apellido_materno} ({self.clave_empleado})"


class Relation(models.Model):
    personal = models.ForeignKey(Personal, on_delete=models.CASCADE, related_name='personal_relations')
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='personal_table_relations')
    row = models.ForeignKey(Row, on_delete=models.CASCADE, related_name='personal_row_relations')

    class Meta:
        db_table = 'personal_relations'
        unique_together = [['personal', 'table', 'row']]

    def __str__(self):
        return f"{self.personal.clave_empleado} - {self.table.name} - {self.row.name}"
