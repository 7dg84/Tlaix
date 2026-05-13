from rest_framework import viewsets
from .models import Relation, Personal
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import permission_classes, api_view
from .serializers import RelationSerializer, PersonalSerializer
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt

from api.models import Table, Row, Column, CellValue, Tab
from django.utils import timezone
from re import search


class PersonalViewSet(viewsets.ModelViewSet):
    queryset = Personal.objects.all()
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]
    serializer_class = PersonalSerializer


class RelationViewSet(viewsets.ModelViewSet):
    queryset = Relation.objects.all()
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]
    serializer_class = RelationSerializer


@permission_classes([IsAuthenticated])
@csrf_exempt
@api_view(['POST'])
def upload_data(request):
    data = request.data
    required = ['clave_empleado', 'nombre', 'apellido_paterno', 'apellido_materno', 'plantel', 'correo', 'group']
    if not all(key in data for key in required):
        return Response({'error': 'Missing required fields'}, status=400)

    if Personal.objects.filter(clave_empleado=data['clave_empleado']).exists():
        return Response({'error': 'clave_empleado already exists'}, status=400)

    if len(data['clave_empleado']) != 8:
        return Response({'error': 'Invalid clave_empleado length'}, status=400)
    
    if data['correo'].count('@') != 1 or '.' not in data['correo'].split('@')[1]:
        return Response({'error': 'Invalid email format'}, status=400)
    
    if search(r'a-zA-Z0-9', data['group']):
        return Response({'error': 'Invalid group name'}, status=400)

    # Create personal record
    personal = Personal.objects.create(
        clave_empleado=data['clave_empleado'],
        nombre=data['nombre'],
        apellido_paterno=data['apellido_paterno'],
        apellido_materno=data.get('apellido_materno', ''),
        plantel=data['plantel'],
        fecha_ingreso=data.get('fecha_ingreso', '2026-01-01'),
        curp=data.get('curp', None),
        telefono=data.get('telefono', None),
        correo=data['correo'],
        nivel_educativo=data.get('nivel_educativo', None),
    )

    table, created = Table.objects.get_or_create(name=data.get('group', data['group']))
    row = Row.objects.create(table=table, name=str(personal))
    Relation.objects.create(personal=personal, table=table, row=row)

    return Response({'message': 'Personal created successfully'}, status=201)


@permission_classes([IsAuthenticated])
@csrf_exempt
@api_view(['POST'])
def check(request):
    data = request.data
    if 'clave_empleado' not in data:
        return Response({'error': 'Missing required fields'}, status=400)

    try:
        personal = Personal.objects.get(clave_empleado=data['clave_empleado'])
    except Personal.DoesNotExist:
        return Response({'error': 'Personal not found'}, status=404)

    try:
        relation = Relation.objects.get(personal=personal)
    except Relation.DoesNotExist:
        return Response({'error': 'Personal is not in the group'}, status=404)

    now = timezone.now()
    timestamp = now.isoformat()
    today_str = now.date().isoformat()

    tab, created = Tab.objects.get_or_create(table=relation.table, name='Asistencia', label='Asistencia')

    # Attendance checkbox
    attendance_col, _ = Column.objects.get_or_create(tab=tab, name=f"{today_str}_asistencia", type='checkbox')
    # Exact time stored as text
    time_col, _ = Column.objects.get_or_create(tab=tab, name=f"{today_str}_hora", type='text')
    # Lugar stored as checkbox boolean
    lugar_col, _ = Column.objects.get_or_create(tab=tab, name=f"{today_str}_lugar", type='checkbox')

    cell_att, created = CellValue.objects.get_or_create(row=relation.row, column=attendance_col, defaults={'value_bool': True})
    if not created and not cell_att.value_bool:
        cell_att.value_bool = True
        cell_att.save()

    cell_time, created = CellValue.objects.get_or_create(row=relation.row, column=time_col, defaults={'value_text': timestamp})
    if not created:
        cell_time.value_text = timestamp
        cell_time.save()

    # lugar_val = bool(data.get('lugar', False))
    # cell_lugar, created = CellValue.objects.get_or_create(row=relation.row, column=lugar_col, defaults={'value_bool': lugar_val})
    # if not created and cell_lugar.value_bool != lugar_val:
    #     cell_lugar.value_bool = lugar_val
    #     cell_lugar.save()

    return Response({'message': 'Check successful'}, status=200)
