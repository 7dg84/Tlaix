from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter
from .views import TableViewSet, ColumnViewSet, RowViewSet, TabViewSet, CellValueViewSet, login, register, logout

router = DefaultRouter()
router.register(r'tables', TableViewSet)

urlpatterns = [
    # User Auth
    re_path("user/login/", login, name="login"),
    re_path("user/register/", register, name="register"),
    re_path("user/logout/", logout, name="logout"),
    # re_path("user/recover/", recover, name="recover"),
    path('tables/<str:table_id>/rows/',
         RowViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/rows/<str:pk>/',
         RowViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
    path('tables/<str:table_id>/columns/',
         ColumnViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/columns/<str:pk>/',
         ColumnViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
    path('tables/<str:table_id>/tabs/',
         TabViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/tabs/<str:pk>/',
         TabViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
    path('tables/<str:table_id>/<str:column_id>/<str:row_id>/',
         CellValueViewSet.as_view({'get': 'retrieve', 'post': 'create', 'put': 'update', 'delete': 'destroy'})),

    path('', include(router.urls)),
]
