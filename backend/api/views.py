from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser, BasePermission, DjangoModelPermissions
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token as AuthToken
from .models import Table, Column, Row, Tab, CellValue
from .serializers import (
    UserSerializer, TableSerializer, ColumnSerializer, RowSerializer,
    TabSerializer, CellValueSerializer, TabViewColumnSerializer,
    TabViewRowSerializer, TableBulkUploadSerializer
)
from .permissions import CookieTokenAuthentication, CompleteDjangoObjectPermissions
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.db import transaction
from django.db.models import Max
from guardian.shortcuts import get_objects_for_user, assign_perm



# Users
# Login
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
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
    token, created = AuthToken.objects.get_or_create(user=user)
    serilized = UserSerializer(user)

    response = Response({'user': serilized.data}, status=status.HTTP_200_OK)

    # Set HTTPOnly cookie
    response.set_cookie(
        key=settings.AUTH_TOKEN_COOKIE_NAME,
        value=token.key,
        httponly=settings.AUTH_TOKEN_COOKIE_HTTPONLY,
        secure=settings.AUTH_TOKEN_COOKIE_SECURE,
        samesite=settings.AUTH_TOKEN_COOKIE_SAMESITE,
        max_age=settings.AUTH_TOKEN_COOKIE_AGE
    )

    return response

# Register
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def register(request):
    # Lógica de registro aquí
    serializer = UserSerializer(data=request.data)
    # Validar contraseña si existe y de minimo 8 caracteres

    if serializer.is_valid():
        serializer.save()

        user = User.objects.get(username=serializer.data['username'])
        user.set_password(request.data['password'])
        user.save()

        token = AuthToken.objects.create(user=user)
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
        key=settings.AUTH_TOKEN_COOKIE_NAME,
        samesite=settings.AUTH_TOKEN_COOKIE_SAMESITE,
    )

    return response

# Cliets
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login_clients(request):
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
    token, created = AuthToken.objects.get_or_create(user=user)
    serilized = UserSerializer(user)

    response = Response({'token': token.key}, status=status.HTTP_200_OK)

    return response


class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.none()
    permission_classes = [IsAuthenticated, CompleteDjangoObjectPermissions]
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
    serializer_class = TableSerializer
    
    def get_queryset(self):
        """
        Este método filtra el queryset basándose en el usuario que hace la solicitud,
        devuelve solo los Objetos que tiene permiso de visualizar.        
        """
        return get_objects_for_user(self.request.user, 'api.view_table', klass=Table)
    
    def perform_create(self, serializer):
        """
        Este método es para la acción POST (crear).
        Necesitas asegurarte de que la nueva tabla asocie permisos de completos con el usuario creador.
        """
        table = serializer.save()# owner=self.request.user)
        
        # El creador recibe todos los privilegios automáticamente sobre este objeto
        assign_perm('add_table', self.request.user, table)
        assign_perm('change_table', self.request.user, table)
        assign_perm('delete_table', self.request.user, table)
        assign_perm('view_table', self.request.user, table)
        

class ColumnViewSet(viewsets.ModelViewSet):
    queryset = Column.objects.none()
    permission_classes = [IsAuthenticated, DjangoModelPermissions]
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
    serializer_class = ColumnSerializer

    def get_queryset(self):
        """
        Este método filtra el queryset basándose en el table_id de la URL.
        """
        # Get user from request
        user = self.request.user
        if user.is_superuser:
            return Column.objects.all()
        # Get the table_id from the URL kwargs
        table_id = self.kwargs.get('table_id')

        # Make sure the table exists
        get_object_or_404(Table, id=table_id)

        # Fileter by table_id
        # queryset = Column.objects.filter(tab__table_id=table_id)
        # Filter alowed tabs columns
        tabs = get_objects_for_user(user, 'api.view_tab', klass=Tab.objects.filter(table_id=table_id))

        return Column.objects.filter(tab__in=tabs)

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
    queryset = Row.objects.all()
    permission_classes = [IsAuthenticated, DjangoModelPermissions]
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
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

    def perform_create(self, serializer):
        """
        Asigna un `order` incremental cuando el cliente no lo envía.

        Crear filas desde la UI no incluye `order`, así que todas quedaban con
        el valor por defecto (0) y empataban entre sí, impidiendo una
        paginación estable en TabView. Solo aplicamos el incremento si el
        cliente NO envía `order` explícito: la carga masiva
        (TableBulkUploadView) y cualquier cliente que envíe `order` conservan
        su valor sin cambios.
        """
        if 'order' in self.request.data:
            serializer.save()
            return

        table = serializer.validated_data.get('table')
        max_order = Row.objects.filter(table=table).aggregate(
            max_order=Max('order')
        )['max_order']
        serializer.save(order=0 if max_order is None else max_order + 1)


class TabViewSet(viewsets.ModelViewSet):
    queryset = Tab.objects.none()
    permission_classes = [IsAuthenticated, CompleteDjangoObjectPermissions]
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
    serializer_class = TabSerializer

    def get_queryset(self):
        """
        Este método filtra el queryset basándose en el table_id de la URL.
        """
        # Get the table_id from the URL kwargs
        table_id = self.kwargs.get('table_id')

        # Make sure the table exists
        table = get_object_or_404(Table, id=table_id)
        # Check permisions
        self.check_object_permissions(self.request, table)

        # Fileter by table_id
        # queryset = Tab.objects.filter(table=table_id)
        return get_objects_for_user(self.request.user, 'api.view_tab', klass=Tab.objects.filter(table=table_id))

    def create(self, request, *args, **kwargs):
        """
        Este método es para la acción POST (crear).
        Necesitas asegurarte de que la nueva pestaña se asocie con el table_id correcto.
        """
        # Get the table_id from the URL kwargs
        table_id = self.kwargs.get('table_id')

        # Make sure the table exists
        table = get_object_or_404(Table, id=table_id)
        # Check permisions to view the table
        self.check_object_permissions(request, table)

        # Crea una copia mutable de los datos del request
        data = request.data.copy()
        data['table'] = table_id  # Asocia el ID de la tabla a los datos

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    def perform_create(self, serializer):
        """
        Este método es para la acción POST (crear).
        Necesitas asegurarte de que la nueva pestaña asocie permisos de completos con el usuario creador.
        """
        tab = serializer.save()# owner=self.request.user)
        
        # El creador recibe todos los privilegios automáticamente sobre este objeto
        assign_perm('add_tab', self.request.user, tab)
        assign_perm('change_tab', self.request.user, tab)
        assign_perm('delete_tab', self.request.user, tab)
        assign_perm('view_tab', self.request.user, tab)


class CellValueViewSet(viewsets.ModelViewSet):
    queryset = CellValue.objects.all()
    serializer_class = CellValueSerializer
    permission_classes = [IsAuthenticated, DjangoModelPermissions]
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]

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
            # return Response({'error': 'CellValue not found for the given row and column'}, status=status.HTTP_404_NOT_FOUND)
            # Create the cell value instead
            # Create a mutable copy of request data and add the related IDs
            data = request.data.copy()
            data['table_id'] = table_id
            data['column_id'] = column_id
            data['row_id'] = row_id
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
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


# class TabViewViewSet(viewsets.ModelViewSet):
#     permission_classes = [IsAuthenticated]
#     authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
#     serializer_class = TabSerializer

#     def get_queryset(self):
#         """
#         Filtra tabs por table_id en la URL.
#         """
#         table_id = self.kwargs.get('table_id')
#         if not table_id:
#             return Tab.objects.all()
#         return Tab.objects.filter(table_id=table_id)

#     def list(self, request, *args, **kwargs):
#         table_id = self.kwargs.get('table_id')
#         tab_id = self.kwargs.get('tab_id')

#         # Validate that related objects exist
#         get_object_or_404(Table, id=table_id)
#         get_object_or_404(Tab, id=tab_id)

#         # Filter by table and tab
#         queryset = Tab.objects.filter(table_id=table_id, id=tab_id)
#         columns_queryset = Column.objects.filter(tab_id=tab_id)
#         rows_queryset = Row.objects.filter(table_id=table_id)

#         serializer = self.get_serializer(queryset, many=True)
#         return Response(serializer.data)

#     def create(self, request, *args, **kwargs):
#         """
#         Asocia el tab con el table_id de la URL.
#         """
#         table_id = self.kwargs.get('table_id')
#         get_object_or_404(Table, id=table_id)

#         data = request.data.copy()
#         data['table_id'] = table_id

#         serializer = self.get_serializer(data=data)
#         serializer.is_valid(raise_exception=True)
#         self.perform_create(serializer)
#         headers = self.get_success_headers(serializer.data)
#         return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

# Endpoind to visualize a table in a tab, combining rows and columns, like an excel table


# Valores por defecto/límites para la paginación del TabView
TABVIEW_DEFAULT_ROW_LIMIT = 50
TABVIEW_MAX_ROW_LIMIT = 500
TABVIEW_DEFAULT_COL_LIMIT = 100
TABVIEW_MAX_COL_LIMIT = 500


def _parse_int_param(raw_value, default, maximum=None, allow_all=False):
    """
    Normaliza un parámetro de paginación recibido por query string.

    - Si no viene (None) o viene vacío, devuelve ``default``.
    - Si ``allow_all`` es True y el valor es ``all`` o ``0``, devuelve ``None``
      para indicar "sin límite" (modo no paginado).
    - Valores no numéricos o negativos caen al valor por defecto.
    - Si se define ``maximum``, el resultado se recorta a ese tope.
    """
    if raw_value is None:
        return default

    value = str(raw_value).strip().lower()
    if value == '':
        return default

    if allow_all and value in ('all', '0'):
        return None

    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    if parsed < 0:
        return default

    if maximum is not None:
        parsed = min(parsed, maximum)

    return parsed


class TabView(APIView):
    permission_classes = [IsAuthenticated, CompleteDjangoObjectPermissions]
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
    queryset = Tab.objects.all()

    def get(self, request, table_id, tab_id):
        table = get_object_or_404(Table, id=table_id)
        self.check_object_permissions(request, table)
        tab = get_object_or_404(Tab, id=tab_id, table_id=table_id)
        self.check_object_permissions(request, tab)

        # --- Parámetros de paginación -------------------------------------
        # row_limit/col_limit aceptan 'all' (o 0) para devolver todo (modo
        # no paginado, útil para exportaciones completas).
        row_limit = _parse_int_param(
            request.query_params.get('row_limit'),
            default=TABVIEW_DEFAULT_ROW_LIMIT,
            maximum=TABVIEW_MAX_ROW_LIMIT,
            allow_all=True,
        )
        row_offset = _parse_int_param(
            request.query_params.get('row_offset'), default=0
        )
        col_limit = _parse_int_param(
            request.query_params.get('col_limit'),
            default=TABVIEW_DEFAULT_COL_LIMIT,
            maximum=TABVIEW_MAX_COL_LIMIT,
            allow_all=True,
        )
        col_offset = _parse_int_param(
            request.query_params.get('col_offset'), default=0
        )

        # Totales reales (para calcular has_more_*)
        total_rows = table.rows.count()
        total_columns = tab.columns.count()

        # --- Slices (consulta acotada, O(limit)) --------------------------
        columns_qs = tab.columns.all()
        # Orden explícito y determinista: `order` puede empatar (p. ej. varias
        # filas con order=0) y sin desempate Postgres no garantiza el mismo
        # orden físico entre consultas, lo que haría que la paginación por
        # bloques (row_offset) saltara filas. `created_at` + `id` desempatan.
        rows_qs = table.rows.order_by('order', 'created_at', 'id')

        if col_limit is None:
            columns_qs = columns_qs[col_offset:]
        else:
            columns_qs = columns_qs[col_offset: col_offset + col_limit]

        if row_limit is None:
            rows_qs = rows_qs[row_offset:]
        else:
            rows_qs = rows_qs[row_offset: row_offset + row_limit]

        columns = TabViewColumnSerializer(columns_qs, many=True).data
        rows = TabViewRowSerializer(rows_qs, many=True).data

        # OBTENER SOLO LAS CELDAS DEL LOTE EN UNA SOLA CONSULTA
        col_ids = [c['id'] for c in columns]
        row_ids = [r['id'] for r in rows]

        # Usamos select_related('column') para evitar consultas N+1 en get_value()
        cells = CellValue.objects.filter(
            row_id__in=row_ids,
            column_id__in=col_ids
        ).select_related('column')

        # Crear un diccionario de búsqueda rápida en memoria: (row_id, column_id) -> value
        cells_lookup = {
            (cell.row_id, cell.column_id): cell.get_value()
            for cell in cells
        }

        # Integrar los valores directamente en el diccionario de cada fila
        for r in rows:
            r['cells'] = {
                c['id']: cells_lookup.get((r['id'], c['id']), None)
                for c in columns
            }

        # En modo "all" reflejamos como límite efectivo el total disponible
        effective_row_limit = row_limit if row_limit is not None else total_rows
        effective_col_limit = col_limit if col_limit is not None else total_columns

        response_data = {
            'tab': TabSerializer(tab).data,
            'pagination': {
                'total_rows': total_rows,
                'row_limit': effective_row_limit,
                'row_offset': row_offset,
                'has_more_rows': (row_offset + len(rows)) < total_rows,
                'total_columns': total_columns,
                'col_limit': effective_col_limit,
                'col_offset': col_offset,
                'has_more_columns': (col_offset + len(columns)) < total_columns,
            },
            'columns': columns,
            'rows': rows,  # Ahora cada fila contiene su objeto 'cells' integrado
        }

        return Response(response_data, status=status.HTTP_200_OK)


class TableBulkUploadView(APIView):
    """
    Endpoint para subir varias filas y pestañas al mismo tiempo a una tabla existente.
    POST /api/tables/<table_id>/bulk/
    """
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, table_id):
        table = get_object_or_404(Table, id=table_id)

        user = request.user
        # Validar permisos sobre la tabla
        if not (user.is_superuser or
                user.has_perm('api.change_table', table) or
                user.has_perm('api.add_table', table) or
                user.has_perm('api.view_table', table)):
            return Response(
                {'detail': 'No tienes permisos para modificar esta tabla.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = TableBulkUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tabs_data = serializer.validated_data.get('tabs', [])
        rows_data = serializer.validated_data.get('rows', [])

        # Validar permisos para pestañas si se envían
        if tabs_data and not (user.is_superuser or user.has_perm('api.add_tab')):
            return Response(
                {'detail': 'No tienes permisos para crear pestañas.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Validar permisos para filas si se envían
        if rows_data and not (user.is_superuser or user.has_perm('api.add_row')):
            return Response(
                {'detail': 'No tienes permisos para crear filas.'},
                status=status.HTTP_403_FORBIDDEN
            )

        created_tabs = []
        created_rows = []

        try:
            with transaction.atomic():
                # 1. Procesar pestañas (tabs)
                if tabs_data:
                    max_tab_order = Tab.objects.filter(table=table).aggregate(
                        max_order=Max('order')
                    )['max_order']
                    current_tab_order = 0 if max_tab_order is None else max_tab_order + 1

                    for item in tabs_data:
                        if isinstance(item, str):
                            tab_name = item.strip()
                            tab_label = tab_name
                            tab_order = current_tab_order
                            current_tab_order += 1
                        elif isinstance(item, dict):
                            tab_name = str(item.get('name', '')).strip()
                            tab_label = str(item.get('label', '')).strip() or tab_name
                            raw_order = item.get('order')
                            if raw_order is not None:
                                try:
                                    tab_order = int(raw_order)
                                except (ValueError, TypeError):
                                    tab_order = current_tab_order
                            else:
                                tab_order = current_tab_order
                            current_tab_order = max(current_tab_order, tab_order + 1)
                        else:
                            return Response(
                                {'error': 'Formato inválido en elemento de tabs. Debe ser texto u objeto.'},
                                status=status.HTTP_400_BAD_REQUEST
                            )

                        if not tab_name:
                            return Response(
                                {'error': 'El nombre de cada pestaña no puede estar vacío.'},
                                status=status.HTTP_400_BAD_REQUEST
                            )

                        if Tab.objects.filter(table=table, name=tab_name).exists():
                            return Response(
                                {'error': f"Ya existe una pestaña con el nombre '{tab_name}' en esta tabla."},
                                status=status.HTTP_400_BAD_REQUEST
                            )

                        new_tab = Tab.objects.create(
                            table=table,
                            name=tab_name,
                            label=tab_label,
                            order=tab_order
                        )

                        # Asignar permisos por objeto al usuario creador
                        assign_perm('add_tab', user, new_tab)
                        assign_perm('change_tab', user, new_tab)
                        assign_perm('delete_tab', user, new_tab)
                        assign_perm('view_tab', user, new_tab)

                        created_tabs.append(new_tab)

                # 2. Procesar filas (rows)
                if rows_data:
                    max_row_order = Row.objects.filter(table=table).aggregate(
                        max_order=Max('order')
                    )['max_order']
                    current_row_order = 0 if max_row_order is None else max_row_order + 1

                    for item in rows_data:
                        if isinstance(item, str):
                            row_name = item.strip()
                            row_order = current_row_order
                            row_data = {}
                            current_row_order += 1
                        elif isinstance(item, dict):
                            row_name = str(item.get('name', '')).strip()
                            raw_order = item.get('order')
                            if raw_order is not None:
                                try:
                                    row_order = int(raw_order)
                                except (ValueError, TypeError):
                                    row_order = current_row_order
                            else:
                                row_order = current_row_order
                            current_row_order = max(current_row_order, row_order + 1)
                            row_data = item.get('data', {})
                        else:
                            return Response(
                                {'error': 'Formato inválido en elemento de rows. Debe ser texto u objeto.'},
                                status=status.HTTP_400_BAD_REQUEST
                            )

                        if not row_name:
                            return Response(
                                {'error': 'El nombre de cada fila no puede estar vacío.'},
                                status=status.HTTP_400_BAD_REQUEST
                            )

                        new_row = Row.objects.create(
                            table=table,
                            name=row_name,
                            order=row_order
                        )

                        # Si se proporcionó data para las celdas, mapear columnas existentes
                        if row_data and isinstance(row_data, dict):
                            col_ids = list(row_data.keys())
                            columns = Column.objects.filter(id__in=col_ids, tab__table=table)
                            cols_map = {str(c.id): c for c in columns}
                            for col_id, val in row_data.items():
                                col = cols_map.get(str(col_id))
                                if col:
                                    cell, _ = CellValue.objects.get_or_create(row=new_row, column=col)
                                    cell.set_value(val)
                                    cell.save()

                        created_rows.append(new_row)

        except Exception as e:
            return Response(
                {'error': f'Error procesando la carga masiva: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            'message': 'Carga masiva completada exitosamente.',
            'tabs_count': len(created_tabs),
            'rows_count': len(created_rows),
            # 'tabs': TabSerializer(created_tabs, many=True).data,
            # 'rows': RowSerializer(created_rows, many=True).data,
        }, status=status.HTTP_201_CREATED)

