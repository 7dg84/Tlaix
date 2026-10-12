from django.test import TestCase
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from rest_framework import status

from asistencia.models import AttendanceMember, AttendanceRelation
from api.models import Table, Row, Column, CellValue, Tab


class AttendanceModuleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testadmin',
            email='testadmin@example.com',
            password='testpassword123'
        )
        self.token = Token.objects.create(user=self.user)

    def test_unauthenticated_requests_are_rejected(self):
        """Verifica que las peticiones sin autenticación retornen 401."""
        response = self.client.get('/api/asistencia/members/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.post('/api/asistencia/check/', {'id': '12345'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.post('/api/asistencia/upload/', {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authentication_with_token(self):
        """Verifica acceso con Authorization: Token <key>."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        response = self.client.get('/api/asistencia/members/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authentication_with_httponly_cookie(self):
        """Verifica acceso con HTTPOnly auth_token cookie."""
        cookie_name = getattr(settings, 'AUTH_TOKEN_COOKIE_NAME', 'auth_token')
        self.client.cookies[cookie_name] = self.token.key
        response = self.client.get('/api/asistencia/members/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_member_crud_and_filters(self):
        """Verifica el CRUD de AttendanceMember y filtros por tipo y búsqueda."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        # 1. Crear miembros
        student_data = {
            'identifier': '20260001',
            'member_type': 'STUDENT',
            'first_name': 'Carlos',
            'last_name': 'Ramírez',
            'second_last_name': 'Pérez',
            'email': 'carlos@example.com',
            'extra_attributes': {'carrera': 'PROGRAMACION', 'turno': 'MATUTINO'},
            'is_active': True,
        }
        res_post = self.client.post('/api/asistencia/members/', student_data, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_201_CREATED)

        staff_data = {
            'identifier': 'EMP001',
            'member_type': 'STAFF',
            'first_name': 'Ana',
            'last_name': 'López',
            'second_last_name': 'García',
            'email': 'ana@example.com',
            'extra_attributes': {'fecha_ingreso': '2026-01-15'},
            'is_active': True,
        }
        res_post_staff = self.client.post('/api/asistencia/members/', staff_data, format='json')
        self.assertEqual(res_post_staff.status_code, status.HTTP_201_CREATED)

        # 2. Filtrar por member_type
        res_filter_student = self.client.get('/api/asistencia/members/?type=STUDENT')
        self.assertEqual(res_filter_student.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_filter_student.data), 1)
        self.assertEqual(res_filter_student.data[0]['identifier'], '20260001')

        res_filter_staff = self.client.get('/api/asistencia/members/?type=STAFF')
        self.assertEqual(res_filter_staff.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_filter_staff.data), 1)
        self.assertEqual(res_filter_staff.data[0]['identifier'], 'EMP001')

        # 3. Filtrar por búsqueda
        res_search = self.client.get('/api/asistencia/members/?search=Carlos')
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_search.data), 1)

        # 4. Detalle y actualización
        res_detail = self.client.get('/api/asistencia/members/20260001/')
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_detail.data['first_name'], 'Carlos')

        res_patch = self.client.patch('/api/asistencia/members/20260001/', {'phone': '5599887766'}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(res_patch.data['phone'], '5599887766')

    def test_upload_data_endpoint(self):
        """Verifica la carga de datos del sujeto, vinculación de tabla, fila y relación."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        payload = {
            'identifier': '20260099',
            'member_type': 'STUDENT',
            'first_name': 'Mario',
            'last_name': 'Bros',
            'second_last_name': 'Nintendo',
            'email': 'mario@mushroom.com',
            'phone': '5511223344',
            'group': 'Grupo-101-A',
            'extra_attributes': {
                'carrera': 'PROGRAMACION',
                'turno': 'MATUTINO'
            }
        }

        res = self.client.post('/api/asistencia/upload/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['created'])
        self.assertEqual(res.data['identifier'], '20260099')

        # Verificar en base de datos
        member = AttendanceMember.objects.get(identifier='20260099')
        self.assertEqual(member.first_name, 'Mario')
        self.assertEqual(member.member_type, 'STUDENT')

        table = Table.objects.get(name='Grupo-101-A')
        self.assertEqual(str(res.data['table_id']), str(table.id))

        relation = AttendanceRelation.objects.get(member=member, table=table)
        self.assertEqual(str(relation.row.id), str(res.data['row_id']))

        # Segunda carga (actualización del mismo miembro y grupo)
        payload['first_name'] = 'Super Mario'
        res_update = self.client.post('/api/asistencia/upload/', payload, format='json')
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        self.assertFalse(res_update.data['created'])

        member.refresh_from_db()
        self.assertEqual(member.first_name, 'Super Mario')

    def test_check_attendance_success(self):
        """Verifica el flujo completo de chequeo de asistencia."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        # Crear miembro, tabla, fila y relación
        member = AttendanceMember.objects.create(
            identifier='STUDENT-TEST-1',
            member_type='STUDENT',
            first_name='Laura',
            last_name='Gómez',
        )
        table = Table.objects.create(name='Aula 202')
        row = Row.objects.create(table=table, name='Laura Gómez (STUDENT-TEST-1)')
        AttendanceRelation.objects.create(member=member, table=table, row=row)

        today_str = timezone.now().date().isoformat()

        # Realizar chequeo
        res = self.client.post('/api/asistencia/check/', {'id': 'STUDENT-TEST-1'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['message'], 'Check successful')
        self.assertEqual(res.data['identifier'], 'STUDENT-TEST-1')
        self.assertEqual(res.data['date'], today_str)

        # Validar creación de Tab 'Asistencia'
        tab = Tab.objects.get(table=table, name='Asistencia')
        self.assertIsNotNone(tab)

        # Validar creación de Column con la fecha de hoy y type 'checkbox'
        column = Column.objects.get(tab=tab, name=today_str)
        self.assertEqual(column.type, 'checkbox')

        # Validar creación de CellValue con value_bool=True
        cell_val = CellValue.objects.get(row=row, column=column)
        self.assertTrue(cell_val.value_bool)

        # Chequeo repetido en el mismo día (idempotente)
        res_repeat = self.client.post('/api/asistencia/check/', {'id': 'STUDENT-TEST-1'}, format='json')
        self.assertEqual(res_repeat.status_code, status.HTTP_200_OK)
        cell_val.refresh_from_db()
        self.assertTrue(cell_val.value_bool)

    def test_check_attendance_not_found_or_no_relation(self):
        """Verifica errores 404 al checar miembros inexistentes o sin relación."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        # Miembro no existe
        res = self.client.post('/api/asistencia/check/', {'id': 'NON_EXISTENT'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('Member not found', res.data['error'])

        # Miembro existe pero no tiene relación asignada
        AttendanceMember.objects.create(
            identifier='ORPHAN-01',
            member_type='STAFF',
            first_name='Solo',
            last_name='Staff'
        )
        res_orphan = self.client.post('/api/asistencia/check/', {'id': 'ORPHAN-01'}, format='json')
        self.assertEqual(res_orphan.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('not assigned to any group', res_orphan.data['error'])

    def test_check_attendance_missing_id(self):
        """Verifica error 400 si falta el campo id."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        res = self.client.post('/api/asistencia/check/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
