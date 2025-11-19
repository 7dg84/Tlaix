from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Table, Column, Row, Tab
from .serializers import TableSerializer, ColumnSerializer, RowSerializer, TabSerializer
from django.shortcuts import get_object_or_404

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
    # queryset = Column.objects.all()
    serializer_class = ColumnSerializer
    def get_queryset(self):
        """
        Este método filtra el queryset basándose en el table_id de la URL.
        """
        # Get the table_id from the URL kwargs
        table_id = self.kwargs.get('table_id')

        # Make sure the table exists
        get_object_or_404(Table, id=table_id) 

        # Fileter by table_id
        queryset = Column.objects.filter(table_id=table_id)
        return queryset

    def create(self, request, *args, **kwargs):
        """
        Este método es para la acción POST (crear).
        Necesitas asegurarte de que la nueva fila se asocie con el table_id correcto.
        """
        # Get the table_id from the URL kwargs
        table_id = self.kwargs.get('table_id')

        # Make sure the table exists
        get_object_or_404(Table, id=table_id)
        
        # Crea una copia mutable de los datos del request
        data = request.data.copy() 
        data['table_id'] = table_id # Asocia el ID de la tabla a los datos

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class RowViewSet(viewsets.ModelViewSet):
    # queryset = Row.objects.all()
    serializer_class = RowSerializer
    def get_queryset(self):
        """
        Este método filtra el queryset basándose en el table_id de la URL.
        """
        # Get the table_id from the URL kwargs
        table_id = self.kwargs.get('table_id')

        # Make sure the table exists
        get_object_or_404(Table, id=table_id) 

        # Fileter by table_id
        queryset = Row.objects.filter(table_id=table_id)
        return queryset

    def create(self, request, *args, **kwargs):
        """
        Este método es para la acción POST (crear).
        Necesitas asegurarte de que la nueva fila se asocie con el table_id correcto.
        """
        # Get the table_id from the URL kwargs
        table_id = self.kwargs.get('table_id')

        # Make sure the table exists
        get_object_or_404(Table, id=table_id)
        
        # Crea una copia mutable de los datos del request
        data = request.data.copy() 
        data['table_id'] = table_id # Asocia el ID de la tabla a los datos

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class TabViewSet(viewsets.ModelViewSet):
    queryset = Tab.objects.all()
    serializer_class = TabSerializer
