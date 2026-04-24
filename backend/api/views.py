from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser, BasePermission
from rest_framework.authtoken.models import Token
from .models import Table, Column, Row, Tab, CellValue
from .serializers import UserSerializer, TableSerializer, ColumnSerializer, RowSerializer, TabSerializer, CellValueSerializer
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt

# Custom authentication class to support HTTPOnly cookies


class CookieTokenAuthentication(TokenAuthentication):
    """
    Custom authentication that reads token from HTTPOnly cookies
    Falls back to Authorization header if cookie not found
    """

    def authenticate(self, request):
        # First try to get token from cookie
        token = request.COOKIES.get('auth_token')

        if not token:
            # Fall back to Authorization header
            return super().authenticate(request)

        return self.authenticate_credentials(token)

# Users
# Login


@api_view(['POST'])
def login(request):
    # Lógica de autenticación
    # Campos requeridos: email, password
    if 'email' not in request.data or 'password' not in request.data:
        return Response({'error': 'Email and password are required'}, status=status.HTTP_400_BAD_REQUEST)
    # buscar el usuario por email
    user = get_object_or_404(User, email=request.data['email'])

    # Validar la contraseña
    if not user.check_password(request.data['password']):
        return Response({'error': 'Invalid password'}, status=status.HTTP_401_UNAUTHORIZED)

    # Generar o recuperar el token de autenticación
    token, created = Token.objects.get_or_create(user=user)
    serilized = UserSerializer(user)

    response = Response({'user': serilized.data}, status=status.HTTP_200_OK)

    # Set HTTPOnly cookie
    response.set_cookie(
        key='auth_token',
        value=token.key,
        httponly=True,
        secure=False,  # Change to True in production with HTTPS
        samesite='Lax',
        max_age=86400 * 7  # 7 days
    )

    return response

# Register


@api_view(['POST'])
def register(request):
    # Lógica de registro aquí
    serializer = UserSerializer(data=request.data)

    if serializer.is_valid():
        serializer.save()

        user = User.objects.get(username=serializer.data['username'])
        user.set_password(request.data['password'])
        user.save()

        token = Token.objects.create(user=user)
        return Response({'token': token.key}, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# Authenticated user information


@api_view(['GET'])
@authentication_classes([CookieTokenAuthentication])
@permission_classes([IsAuthenticated])
def user(request):
    serilized = UserSerializer(request.user)
    return Response(serilized.data, status=status.HTTP_200_OK)

# Logout


@api_view(['POST'])
@authentication_classes([CookieTokenAuthentication])
@permission_classes([IsAuthenticated])
def logout(request):
    request.user.auth_token.delete()
    response = Response({'message': 'Logout successful'},
                        status=status.HTTP_200_OK)

    # Delete HTTPOnly cookie
    response.delete_cookie(
        key='auth_token',
        samesite='Lax'
    )

    return response


class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    permission_classes = [AllowAny]
    serializer_class = TableSerializer

    @action(detail=True, methods=['get'])
    def columns(self, request, pk=None):
        table = self.get_object()
        columns = Column.objects.filter(tab__table=table)
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
        queryset = Column.objects.filter(tab__table_id=table_id)
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

        # Si no viene tab_id, asigna un tab por defecto
        if not data.get('tab_id'):
            default_tab = Tab.objects.filter(
                table_id=table_id).order_by('order').first()
            if not default_tab:
                default_tab = Tab.objects.create(
                    table_id=table_id,
                    name='General',
                    label='General',
                    order=0,
                )
            data['tab_id'] = str(default_tab.id)

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
        queryset = Row.objects.filter(table=table_id)
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
        data['table'] = table_id  # Asocia el ID de la tabla a los datos

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class TabViewSet(viewsets.ModelViewSet):
    serializer_class = TabSerializer

    def get_queryset(self):
        """
        Filtra tabs por table_id en la URL.
        """
        table_id = self.kwargs.get('table_id')
        if not table_id:
            return Tab.objects.all()
        return Tab.objects.filter(table_id=table_id)

    def create(self, request, *args, **kwargs):
        """
        Asocia el tab con el table_id de la URL.
        """
        table_id = self.kwargs.get('table_id')
        get_object_or_404(Table, id=table_id)

        data = request.data.copy()
        data['table_id'] = table_id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class CellValueViewSet(viewsets.ModelViewSet):
    serializer_class = CellValueSerializer
    queryset = CellValue.objects.all()

    def list(self, request, *args, **kwargs):
        table_id = self.kwargs.get('table_id')
        column_id = self.kwargs.get('column_id')
        row_id = self.kwargs.get('row_id')

        # Validate that related objects exist
        get_object_or_404(Table, id=table_id)
        get_object_or_404(Column, id=column_id)
        get_object_or_404(Row, id=row_id)

        # Filter by row and column
        queryset = CellValue.objects.filter(row_id=row_id, column_id=column_id)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        table_id = self.kwargs.get('table_id')
        column_id = self.kwargs.get('column_id')
        row_id = self.kwargs.get('row_id')

        # Validate that related objects exist
        get_object_or_404(Table, id=table_id)
        get_object_or_404(Column, id=column_id)
        get_object_or_404(Row, id=row_id)

        # Filter by row and column
        queryset = get_object_or_404(CellValue.objects.filter(
            row_id=row_id, column_id=column_id))
        serializer = self.get_serializer(queryset)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        # Get id from request URL
        table = self.kwargs.get('table_id')
        column = self.kwargs.get('column_id')
        row = self.kwargs.get('row_id')
        print(self.kwargs.get('table_id'), self.kwargs.get(
            'column_id'), self.kwargs.get('row_id'))

        #  Validate that related objects exist
        get_object_or_404(Table, id=table)
        get_object_or_404(Column, id=column)
        get_object_or_404(Row, id=row)

        # Create a mutable copy of request data and add the related IDs
        data = request.data.copy()
        data['table_id'] = table
        data['column_id'] = column
        data['row_id'] = row
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        table_id = self.kwargs.get('table_id')
        column_id = self.kwargs.get('column_id')
        row_id = self.kwargs.get('row_id')

        # Validate that related objects exist
        get_object_or_404(Table, id=table_id)
        get_object_or_404(Column, id=column_id)
        get_object_or_404(Row, id=row_id)

        # Filter by row and column
        queryset = CellValue.objects.filter(row_id=row_id, column_id=column_id)
        if not queryset.exists():
            return Response({'error': 'CellValue not found for the given row and column'}, status=status.HTTP_404_NOT_FOUND)
        instance = queryset.first()
        serializer = self.get_serializer(
            instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        table_id = self.kwargs.get('table_id')
        column_id = self.kwargs.get('column_id')
        row_id = self.kwargs.get('row_id')

        # Validate that related objects exist
        get_object_or_404(Table, id=table_id)
        get_object_or_404(Column, id=column_id)
        get_object_or_404(Row, id=row_id)

        # Filter by row and column
        queryset = CellValue.objects.filter(row_id=row_id, column_id=column_id)
        if not queryset.exists():
            return Response({'error': 'CellValue not found for the given row and column'}, status=status.HTTP_404_NOT_FOUND)
        instance = queryset.first()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TabViewViewSet(viewsets.ModelViewSet):
    serializer_class = TabSerializer

    def get_queryset(self):
        """
        Filtra tabs por table_id en la URL.
        """
        table_id = self.kwargs.get('table_id')
        if not table_id:
            return Tab.objects.all()
        return Tab.objects.filter(table_id=table_id)

    def list(self, request, *args, **kwargs):
        table_id = self.kwargs.get('table_id')
        tab_id = self.kwargs.get('tab_id')

        # Validate that related objects exist
        get_object_or_404(Table, id=table_id)
        get_object_or_404(Tab, id=tab_id)

        # Filter by table and tab
        queryset = Tab.objects.filter(table_id=table_id, id=tab_id)
        columns_queryset = Column.objects.filter(tab_id=tab_id)
        rows_queryset = Row.objects.filter(table_id=table_id)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """
        Asocia el tab con el table_id de la URL.
        """
        table_id = self.kwargs.get('table_id')
        get_object_or_404(Table, id=table_id)

        data = request.data.copy()
        data['table_id'] = table_id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

# Endpoind to visualize a table in a tab, combining rows and columns, like an excel table


@csrf_exempt
@api_view(['get'])
def tab_view(request, table_id, tab_id):
    # Validate that related objects exist
    get_object_or_404(Table, id=table_id)
    get_object_or_404(Tab, id=tab_id)

    # Get the tab with its columns and the table with its rows
    tab = Tab.objects.prefetch_related(
        'columns').get(id=tab_id, table_id=table_id)
    table = Table.objects.prefetch_related('rows').get(id=table_id)

    # Build a response combining rows and columns
    columns_qs = tab.columns.all()
    rows_qs = table.rows.all()
    columns = ColumnSerializer(columns_qs, many=True).data
    rows = RowSerializer(rows_qs, many=True).data

    # Build a matrix of cell values: for each row, for each column, get the cell value
    matrix = []
    for r in rows:
        row_entry = {}
        for c in columns:
            cell = CellValue.objects.filter(row_id=r['id'], column_id=c['id']).first()
            value = cell.get_value() if cell else None
            row_entry[c['id']] = value
        matrix.append({r['name']: row_entry})

    response_data = {
        'tab': TabSerializer(tab).data,
        'columns': [c['name'] for c in columns],
        'rows': rows,
        'matrix': matrix,
    }

    return Response(response_data, status=status.HTTP_200_OK)
