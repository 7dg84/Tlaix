from django.contrib import admin
from .models import Personal, Relation


@admin.register(Personal)
class PersonalAdmin(admin.ModelAdmin):
    list_display = ('clave_empleado', 'nombre', 'apellido_paterno', 'plantel')


@admin.register(Relation)
class RelationAdmin(admin.ModelAdmin):
    list_display = ('personal', 'table', 'row')
