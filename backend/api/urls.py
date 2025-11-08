from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TableViewSet, ColumnViewSet, RowViewSet, TabViewSet

router = DefaultRouter()
router.register(r'tables', TableViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('tables/<str:table_id>/columns', 
         ColumnViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/columns/<str:pk>', 
         ColumnViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
    path('tables/<str:table_id>/rows', 
         RowViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/rows/<str:pk>', 
         RowViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
    path('tables/<str:table_id>/tabs', 
         TabViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/tabs/<str:pk>', 
         TabViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
]
