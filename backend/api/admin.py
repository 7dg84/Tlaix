from django.contrib import admin
from .models import Table, Column, Row, Tab, CellValue

admin.site.register(Table)
admin.site.register(Column)
admin.site.register(Row)
admin.site.register(Tab)
admin.site.register(CellValue)