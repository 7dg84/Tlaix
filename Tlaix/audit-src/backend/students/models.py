from django.db import models
from api.models import Table, Row
import uuid

# Create your models here.
# model for students


class Student(models.Model):
    CARRERS = [
        ('PROGRAMACION', 'Programacion'),
        ('ELECTRONICA', 'Electronica'),
        ('DEO', 'DESARROLLO ORGANIZACIONAL'),
    ]
    TURNOS = [
        ('MATUTINO', 'Matutino'),
        ('VESPERTINO', 'Vespertino'),
    ]

    no_control = models.CharField(max_length=14, primary_key=True, unique=True)
    name = models.CharField(max_length=100)
    plantel = models.CharField(max_length=100)
    carrera = models.CharField(max_length=50, choices=CARRERS)
    turno = models.CharField(max_length=50, choices=TURNOS)
    
    def __str__(self):
        return self.name


# Table that relates students with Table, and row
class Relation(models.Model):
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='relations')
    table = models.ForeignKey(
        Table, on_delete=models.CASCADE, related_name='relations')
    row = models.ForeignKey(
        Row, on_delete=models.CASCADE, related_name='relations')

    class Meta:
        db_table = 'relations'
        unique_together = [['student', 'table', 'row']]
        
    def __str__(self):
        return f"{self.student.no_control} - {self.table.name} - {self.row.name}"
