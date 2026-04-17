from .views import StudentViewSet, RelationViewSet, upload_data, check
from rest_framework.routers import DefaultRouter
from django.urls import path, include

router = DefaultRouter()
router.register(r'', StudentViewSet)
router.register(r'relation', RelationViewSet)

urlpatterns = [
    path('upload_data/', upload_data, name='upload_data'),
    path('check/', check, name='check'),
    path('', include(router.urls)),
]