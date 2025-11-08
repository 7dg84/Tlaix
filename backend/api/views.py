from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Table, Column, Row, Tab
from .serializers import TableSerializer, ColumnSerializer, RowSerializer, TabSerializer

class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = TableSerializer
    
    @action(detail=True, methods=['get'])
    def columns(self, request, pk=None):
        table = self.get_object()
        columns = table.columns.all()
        serializer = ColumnSerializer(columns, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def rows(self, request, pk=None):
        table = self.get_object()
        rows = table.rows.all()
        serializer = RowSerializer(rows, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def tabs(self, request, pk=None):
        table = self.get_object()
        tabs = table.tabs.all()
        serializer = TabSerializer(tabs, many=True)
        return Response(serializer.data)

class ColumnViewSet(viewsets.ModelViewSet):
    queryset = Column.objects.all()
    serializer_class = ColumnSerializer

class RowViewSet(viewsets.ModelViewSet):
    queryset = Row.objects.all()
    serializer_class = RowSerializer

class TabViewSet(viewsets.ModelViewSet):
    queryset = Tab.objects.all()
    serializer_class = TabSerializer
