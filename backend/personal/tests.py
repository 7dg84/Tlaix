from datetime import date
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from api.models import Column, Row, RowTabData, Tab, Table
from personal.models import Personal, Relation


class PersonalCheckAttendanceTestCase(APITestCase):
    """
    Pruebas del endpoint /personal/check/ validando el registro de
    asistencia y hora en el modelo RowTabData.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='personal_admin', password='password123')
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        self.table = Table.objects.create(name='Docentes')
        self.personal = Personal.objects.create(
            clave_empleado='DOC1001',
            nombre='Carlos',
            apellido_paterno='Perez',
            apellido_materno='Lopez',
            plantel='Plantel Central',
            fecha_ingreso=date(2020, 1, 15),
        )
        self.row = Row.objects.create(table=self.table, name=self.personal.nombre, order=0)
        self.relation = Relation.objects.create(personal=self.personal, table=self.table, row=self.row)

    def test_check_personal_attendance_creates_row_tab_data(self):
        """Verifica que el check de personal guarde asistencia y hora en RowTabData."""
        today_str = timezone.now().date().isoformat()
        response = self.client.post('/personal/check/', {'id': self.personal.clave_empleado}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('message'), 'Check successful')

        tab = Tab.objects.get(table=self.table, name='Asistencia')
        att_col = Column.objects.get(tab=tab, name=f"{today_str}_asistencia", type='checkbox')
        time_col = Column.objects.get(tab=tab, name=f"{today_str}_hora", type='text')

        rtd = RowTabData.objects.get(row=self.row, tab=tab)
        self.assertTrue(rtd.data.get(str(att_col.id)))
        self.assertIsNotNone(rtd.data.get(str(time_col.id)))

    def test_check_personal_not_found_returns_404(self):
        """Check con clave_empleado inexistente retorna 404."""
        response = self.client.post('/personal/check/', {'id': 'DOC9999'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_check_personal_without_relation_returns_404(self):
        """Check con personal sin relación a tabla retorna 404."""
        orphan = Personal.objects.create(
            clave_empleado='DOC9002',
            nombre='Sin',
            apellido_paterno='Asignar',
            apellido_materno='Staff',
            plantel='Plantel Central',
            fecha_ingreso=date(2021, 6, 1),
        )
        response = self.client.post('/personal/check/', {'id': orphan.clave_empleado}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_check_personal_missing_id_returns_400(self):
        """Check sin campo 'id' retorna 400 Bad Request."""
        response = self.client.post('/personal/check/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
