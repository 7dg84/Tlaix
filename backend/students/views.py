from rest_framework import viewsets
from .models import Relation
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import permission_classes
from .serializers import RelationSerializer, StudentSerializer
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt

from students.models import Student
from api.models import Table, Row, Column, CellValue, Tab

# Create your views here.


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    # Agregar permisos, solo admin puede ver
    # permission_classes = [IsAuthenticated]
    serializer_class = StudentSerializer
    
class RelationViewSet(viewsets.ModelViewSet):
    queryset = Relation.objects.all()
    # permission_classes = [IsAuthenticated]
    serializer_class = RelationSerializer


# This view allows to upload the data of students. no_control, group, name, plantel, carrera, turno,
# must be provided

# @permission_classes([AllowAny])
@csrf_exempt
@api_view(['POST'])
def upload_data(request):
    # Validate posted data
    data = request.data
    if not all(key in data for key in ['no_control', 'name', 'plantel', 'carrera', 'turno', 'group']):
        return Response({'error': 'Missing required fields'}, status=400)

    # validate no_control is unique
    if Student.objects.filter(no_control=data['no_control']).exists():
        return Response({'error': 'no_control already exists'}, status=400)
    
    # validate no_control format, must be 14 integers
    if len(data['no_control']) != 14 or not data['no_control'].isdigit():
        return Response({'error': 'Invalid no_control format'}, status=400)
    
    # validate carrera, must be one of the options
    if data['carrera'] not in ['PROGRAMACION', 'ELECTRONICA', 'DEO']:
        return Response({'error': 'Invalid carrera'}, status=400)
    
    # validate turno, must be one of the options
    if data['turno'] not in ['MATUTINO', 'VESPERTINO']:
        return Response({'error': 'Invalid turno'}, status=400)
    

    # Create student
    student = Student.objects.create(
        no_control=data['no_control'],
        name=data['name'],
        plantel=data['plantel'],
        carrera=data['carrera'],
        turno=data['turno']
    )

    # Create or get the record in the main app table
    table, created = Table.objects.get_or_create(name=data['group'])
    # Create a row for the student in the table
    row = Row.objects.create(table=table, name=student.name)
    # Create the relation between student, table and row
    Relation.objects.create(student=student, table=table, row=row)

    return Response({'message': 'Student created successfully'}, status=201)

# This view is responsible of checking the student's assistence in the data base, 
# it receives the no_control, and returns if the student is in the group or not, 
# and if is in the group, it verifies if the row of today exists, if it exists, 
# it checks the value of the cell of today, if not, it creates the row and 
# checks the cellvalue as true.
@csrf_exempt
@api_view(['POST'])
def check(request):
    data = request.data
    if 'no_control' not in data or 'group' not in data:
        return Response({'error': 'Missing required fields'}, status=400)
    
    try:
        student = Student.objects.get(no_control=data['no_control'])
    except Student.DoesNotExist:
        return Response({'error': 'Student not found'}, status=404)
        
    try:
        relation = Relation.objects.get(student=student, )
    except Relation.DoesNotExist:
        return Response({'error': 'Student is not in the group'}, status=404)
    
    # Check if the column of today exists, if not, create it
    from datetime import date
    today_str = date.today().isoformat()
    tab, created = Tab.objects.get_or_create(table=relation.table, name='Asistencia', label='Asistencia')
    column, created = Column.objects.get_or_create(tab=tab, name=today_str, type='checkbox')

    # Check the cell value of the student for today, if not exists, create it with value true, if exists and is false, update it to true
    cell_value, created = CellValue.objects.get_or_create(row=relation.row, column=column, defaults={'value_bool': True})
    
    if not created and not cell_value.value_bool:
        cell_value.value_bool = True
        cell_value.save()

    return Response({'message': 'Check successful'}, status=200)