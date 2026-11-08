from datetime import date
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from api.models import Column, Row, RowTabData, Tab, Table
from students.models import Relation, Student


class StudentCheckAttendanceTestCase(APITestCase):
    """
    Pruebas del endpoint /api/students/check/ validando la persistencia
    de asistencia sobre RowTabData.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='students_admin', password='password123')
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        self.table = Table.objects.create(name='Grupo 4A')
        self.student = Student.objects.create(
            no_control='12345678901234',
            name='Estudiante Prueba',
            plantel='Plantel 1',
            carrera='PROGRAMACION',
            turno='MATUTINO',
        )
        self.row = Row.objects.create(table=self.table, name=self.student.name, order=0)
        self.relation = Relation.objects.create(student=self.student, table=self.table, row=self.row)

    def test_check_student_attendance_creates_row_tab_data(self):
        """Verifica que el check de estudiante cree la pestaña, columna y RowTabData."""
        today_str = date.today().isoformat()
        response = self.client.post('/students/check/', {'id': self.student.no_control}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('message'), 'Check successful')

        # Validar creación de Tab y Column
        tab = Tab.objects.get(table=self.table, name='Asistencia')
        column = Column.objects.get(tab=tab, name=today_str, type='checkbox')

        # Validar persistencia en RowTabData
        rtd = RowTabData.objects.get(row=self.row, tab=tab)
        self.assertTrue(rtd.data.get(str(column.id)))

    def test_check_student_attendance_idempotent(self):
        """Múltiples checks el mismo día no duplican ni borran RowTabData."""
        today_str = date.today().isoformat()
        self.client.post('/students/check/', {'id': self.student.no_control}, format='json')

        # Segundo check
        response_repeat = self.client.post('/students/check/', {'id': self.student.no_control}, format='json')
        self.assertEqual(response_repeat.status_code, status.HTTP_200_OK)

        tab = Tab.objects.get(table=self.table, name='Asistencia')
        column = Column.objects.get(tab=tab, name=today_str)
        rtd = RowTabData.objects.get(row=self.row, tab=tab)
        self.assertTrue(rtd.data.get(str(column.id)))

    def test_check_student_not_found_returns_404(self):
        """Check con no_control inexistente retorna 404."""
        response = self.client.post('/students/check/', {'id': '99999999999999'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_check_student_without_relation_returns_404(self):
        """Check con estudiante huérfano (sin relación de grupo) retorna 404."""
        orphan = Student.objects.create(
            no_control='11111111111111',
            name='Huerfano',
            plantel='Plantel 1',
            carrera='ELECTRONICA',
            turno='VESPERTINO',
        )
        response = self.client.post('/students/check/', {'id': orphan.no_control}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
