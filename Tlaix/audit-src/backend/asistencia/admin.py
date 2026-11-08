from django.contrib import admin
from .models import AttendanceMember, AttendanceRelation


@admin.register(AttendanceMember)
class AttendanceMemberAdmin(admin.ModelAdmin):
    list_display = ('identifier', 'member_type', 'first_name', 'last_name', 'email', 'phone', 'is_active')
    list_filter = ('member_type', 'is_active')
    search_fields = ('identifier', 'first_name', 'last_name', 'second_last_name', 'email')


@admin.register(AttendanceRelation)
class AttendanceRelationAdmin(admin.ModelAdmin):
    list_display = ('id', 'member', 'table', 'row')
    search_fields = ('member__identifier', 'member__first_name', 'member__last_name', 'table__name', 'row__name')
    list_filter = ('table',)
