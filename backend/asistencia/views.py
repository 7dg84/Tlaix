from rest_framework import viewsets, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication
from django.db.models import Q
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from api.permissions import CookieTokenAuthentication
from api.models import Table, Row, Column, CellValue, Tab
from .models import AttendanceMember, AttendanceRelation
from .serializers import (
    AttendanceMemberSerializer,
    AttendanceRelationSerializer,
    AttendanceUploadSerializer,
)


class AttendanceMemberViewSet(viewsets.ModelViewSet):
    """
    CRUD completo para los sujetos de asistencia (Estudiantes, Personal u Otros).
    Soporta filtrado por query params:
    - ?type=STUDENT / ?member_type=STUDENT
    - ?search=termino (busca en identifier, nombre, apellidos, email)
    - ?is_active=true/false
    """
    queryset = AttendanceMember.objects.all()
    serializer_class = AttendanceMemberSerializer
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
    permission_classes = [IsAuthenticated]
    lookup_field = 'identifier'

    def get_queryset(self):
        qs = super().get_queryset()
        type_param = (
            self.request.query_params.get('type') or
            self.request.query_params.get('member_type')
        )
        if type_param:
            qs = qs.filter(member_type=type_param.upper())

        active_param = self.request.query_params.get('is_active')
        if active_param is not None:
            if active_param.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif active_param.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)

        search_query = self.request.query_params.get('search')
        if search_query:
            search_query = search_query.strip()
            qs = qs.filter(
                Q(identifier__icontains=search_query) |
                Q(first_name__icontains=search_query) |
                Q(last_name__icontains=search_query) |
                Q(second_last_name__icontains=search_query) |
                Q(email__icontains=search_query)
            )

        return qs


class AttendanceRelationViewSet(viewsets.ModelViewSet):
    """
    CRUD para relaciones entre miembros y filas/tablas del módulo de tablas.
    Soporta filtrado por ?member=<identifier> y ?table=<table_id>.
    """
    queryset = AttendanceRelation.objects.all()
    serializer_class = AttendanceRelationSerializer
    authentication_classes = [CookieTokenAuthentication, TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        member_id = self.request.query_params.get('member')
        if member_id:
            qs = qs.filter(member_id=member_id)

        table_id = self.request.query_params.get('table')
        if table_id:
            qs = qs.filter(table_id=table_id)

        return qs


@api_view(['POST'])
@authentication_classes([CookieTokenAuthentication, TokenAuthentication])
@permission_classes([IsAuthenticated])
@csrf_exempt
def upload_data(request):
    """
    Carga o actualiza un sujeto y lo vincula a una tabla y fila del grupo correspondiente.
    Payload esperado:
    {
        "identifier": "23415082010050",
        "member_type": "STUDENT" | "STAFF" | "OTHER",
        "first_name": "Evelyn",
        "last_name": "Juárez",
        "second_last_name": "Castillo" (opcional),
        "email": "evelyn@example.com" (opcional),
        "phone": "5512345678" (opcional),
        "extra_attributes": { ... } (opcional),
        "group": "4-PROG-AM"
    }
    """
    serializer = AttendanceUploadSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    identifier = data['identifier']
    member_type = data['member_type']
    first_name = data['first_name']
    last_name = data['last_name']
    second_last_name = data.get('second_last_name') or ''
    email = data.get('email')
    phone = data.get('phone')
    extra_attributes = data.get('extra_attributes') or {}
    group_name = data['group']

    member, member_created = AttendanceMember.objects.update_or_create(
        identifier=identifier,
        defaults={
            'member_type': member_type,
            'first_name': first_name,
            'last_name': last_name,
            'second_last_name': second_last_name,
            'email': email,
            'phone': phone,
            'extra_attributes': extra_attributes,
            'is_active': True,
        }
    )

    table, _ = Table.objects.get_or_create(name=group_name)

    existing_relation = AttendanceRelation.objects.filter(member=member, table=table).first()
    if existing_relation:
        relation = existing_relation
        row = relation.row
    else:
        row = Row.objects.create(table=table, name=str(member))
        relation = AttendanceRelation.objects.create(member=member, table=table, row=row)

    resp_status = status.HTTP_201_CREATED if member_created else status.HTTP_200_OK
    return Response({
        'message': 'Member and relation processed successfully',
        'identifier': member.identifier,
        'table_id': str(table.id),
        'row_id': str(row.id),
        'relation_id': relation.id,
        'created': member_created,
    }, status=resp_status)


@api_view(['POST'])
@authentication_classes([CookieTokenAuthentication, TokenAuthentication])
@permission_classes([IsAuthenticated])
@csrf_exempt
def check(request):
    """
    Chequeo de asistencia unificado.
    Payload esperado:
    {
        "id": "<identifier>"
    }
    Busca al sujeto y su fila en la tabla asignada.
    Crea la pestaña 'Asistencia' si no existe.
    Crea la columna con la fecha actual YYYY-MM-DD (tipo checkbox) si no existe.
    Marca el CellValue como True.
    """
    identifier = request.data.get('id')
    if not identifier:
        return Response({'error': 'Missing required fields: id'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        member = AttendanceMember.objects.get(identifier=identifier)
    except AttendanceMember.DoesNotExist:
        return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)

    relation = AttendanceRelation.objects.filter(member=member).first()
    if not relation:
        return Response({'error': 'Member is not assigned to any group'}, status=status.HTTP_404_NOT_FOUND)

    today_str = timezone.now().date().isoformat()

    tab, _ = Tab.objects.get_or_create(
        table=relation.table,
        name='Asistencia',
        defaults={'label': 'Asistencia'}
    )

    column, _ = Column.objects.get_or_create(
        tab=tab,
        name=today_str,
        defaults={'type': 'checkbox'}
    )

    cell_value, created = CellValue.objects.get_or_create(
        row=relation.row,
        column=column,
        defaults={'value_bool': True}
    )

    if not created and not cell_value.value_bool:
        cell_value.value_bool = True
        cell_value.save(update_fields=['value_bool'])

    return Response({
        'message': 'Check successful',
        'identifier': member.identifier,
        'date': today_str,
    }, status=status.HTTP_200_OK)
