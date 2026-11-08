from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AttendanceMemberViewSet,
    AttendanceRelationViewSet,
    upload_data,
    check,
)

router = DefaultRouter()
router.register(r'members', AttendanceMemberViewSet, basename='member')
router.register(r'relations', AttendanceRelationViewSet, basename='relation')

urlpatterns = [
    path('upload/', upload_data, name='asistencia-upload'),
    path('check/', check, name='asistencia-check'),
    path('', include(router.urls)),
]
