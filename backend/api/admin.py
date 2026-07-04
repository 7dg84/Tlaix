from django.contrib import admin
from guardian.admin import GuardedModelAdmin
from .models import Table, Column, Row, Tab, CellValue

class Admin(GuardedModelAdmin):
    pass

admin.site.register(Table, Admin)
admin.site.register(Column, Admin)
admin.site.register(Row, Admin)
admin.site.register(Tab, Admin)
admin.site.register(CellValue, Admin)