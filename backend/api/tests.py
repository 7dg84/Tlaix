from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from django.conf import settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token
import datetime
from api.models import Table, Tab, Column, Row, CellValue
from guardian.shortcuts import assign_perm, get_perms

class TablePermissionsTestCase(APITestCase):
    def setUp(self):
        # Create users
        self.regular_user = User.objects.create_user(username='user', password='userpassword')
        self.other_user = User.objects.create_user(username='other', password='otherpassword')
        
        # Create tables
        self.table = Table.objects.create(name='Test Table', description='A description')
        self.tab = Tab.objects.create(table=self.table, name='Test Tab', label='Test Tab', order=0)
        
        # Get content type and global permissions for POST tests
        content_type = ContentType.objects.get_for_model(Table)
        self.add_table_perm = Permission.objects.get(codename='add_table', content_type=content_type)

    def test_anonymous_user_denied(self):
        """Anonymous users should be denied access to the table endpoints (401 Unauthorized)."""
        url = reverse('table-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_without_permission_cannot_create(self):
        """Authenticated users cannot create (POST) tables without global 'add_table' permission."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-list')
        data = {'name': 'New Table', 'description': 'Some description'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_with_permission_can_create_and_gets_object_permissions(self):
        """
        Authenticated users with global 'add_table' permission can create (POST) tables,
        and they should automatically receive all object-level permissions on the new table.
        """
        self.regular_user.user_permissions.add(self.add_table_perm)
        
        # Re-fetch user to clear cached permissions
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)
        
        url = reverse('table-list')
        data = {'name': 'New Table', 'description': 'Some description'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify the created table in DB
        new_table_id = response.data['id']
        new_table = Table.objects.get(id=new_table_id)
        
        # Verify object permissions assigned automatically
        user_perms = get_perms(self.regular_user, new_table)
        self.assertIn('view_table', user_perms)
        self.assertIn('change_table', user_perms)
        self.assertIn('delete_table', user_perms)

    def test_list_tables_only_returns_permitted_tables(self):
        """A user listing tables should only see tables they have object-level view permission for."""
        # Create a batch of tables
        tables = []
        for i in range(5):
            t = Table.objects.create(name=f'Batch Table {i}', description=f'Desc {i}')
            tables.append(t)
            
        # Give regular_user access to self.table, tables[0], and tables[2] (total 3 tables)
        assign_perm('view_table', self.regular_user, self.table)
        assign_perm('view_table', self.regular_user, tables[0])
        assign_perm('view_table', self.regular_user, tables[2])
        
        # Give other_user access to tables[1] and tables[4] (total 2 tables)
        assign_perm('view_table', self.other_user, tables[1])
        assign_perm('view_table', self.other_user, tables[4])
        
        # Test regular_user response
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Should return exactly 3 tables: self.table, tables[0], and tables[2]
        self.assertEqual(len(response.data), 3)
        returned_ids = {item['id'] for item in response.data}
        expected_ids = {str(self.table.id), str(tables[0].id), str(tables[2].id)}
        self.assertEqual(returned_ids, expected_ids)
        
        # Test other_user response
        self.client.force_authenticate(user=self.other_user)
        response2 = self.client.get(url)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        
        # Should return exactly 2 tables: tables[1] and tables[4]
        self.assertEqual(len(response2.data), 2)
        returned_ids2 = {item['id'] for item in response2.data}
        expected_ids2 = {str(tables[1].id), str(tables[4].id)}
        self.assertEqual(returned_ids2, expected_ids2)

    def test_retrieve_table_detail_permissions(self):
        """Retrieving table detail requires object-level view permission (returns 404 if not found/no view perm)."""
        # User without permission gets 404 (hidden)
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-detail', kwargs={'pk': self.table.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
        # User with view permission gets 200 OK
        assign_perm('view_table', self.regular_user, self.table)
        response2 = self.client.get(url)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)

    def test_update_table_detail_permissions(self):
        """Updating a table requires object-level view permission and change permission."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-detail', kwargs={'pk': self.table.id})
        data = {'name': 'Updated Name'}
        
        # No permissions -> 404 (hidden)
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
        # Has view permission but no change permission -> 403 Forbidden
        assign_perm('view_table', self.regular_user, self.table)
        response2 = self.client.patch(url, data)
        self.assertEqual(response2.status_code, status.HTTP_403_FORBIDDEN)
        
        # Has view and change permission -> 200 OK
        assign_perm('change_table', self.regular_user, self.table)
        response3 = self.client.patch(url, data)
        self.assertEqual(response3.status_code, status.HTTP_200_OK)
        self.assertEqual(response3.data['name'], 'Updated Name')

    def test_delete_table_detail_permissions(self):
        """Deleting a table requires object-level view permission and delete permission."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-detail', kwargs={'pk': self.table.id})
        
        # No permissions -> 404 (hidden)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
        # Has view permission but no delete permission -> 403 Forbidden
        assign_perm('view_table', self.regular_user, self.table)
        response2 = self.client.delete(url)
        self.assertEqual(response2.status_code, status.HTTP_403_FORBIDDEN)
        
        # Has view and delete permission -> 204 No Content
        assign_perm('delete_table', self.regular_user, self.table)
        response3 = self.client.delete(url)
        self.assertEqual(response3.status_code, status.HTTP_204_NO_CONTENT)

    def test_tab_view_permission(self):
        """Reading tabview endpoint requires object-level view permission on the tab/table."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('tab_view', kwargs={'table_id': self.table.id, 'tab_id': self.tab.id})
        
        # No view permission -> 403 Forbidden (since TabView inherits from APIView, queryset is not used for routing filtering, but checks permissions)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Has view permission on the table and tab -> 200 OK
        assign_perm('view_table', self.regular_user, self.table)
        assign_perm('view_tab', self.regular_user, self.tab)
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)
        response2 = self.client.get(url)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)

    def test_list_tables_without_permission(self):
        """A user listing tables without permissions should receive an empty list."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_list_tables_with_general_permission(self):
        """A user with global 'view_table' permission should see all tables."""
        other_table = Table.objects.create(name='Other Global Table', description='Desc')
        content_type = ContentType.objects.get_for_model(Table)
        view_table_perm = Permission.objects.get(codename='view_table', content_type=content_type)
        self.regular_user.user_permissions.add(view_table_perm)
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)

        url = reverse('table-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {t['id'] for t in response.data}
        self.assertIn(str(self.table.id), returned_ids)
        self.assertIn(str(other_table.id), returned_ids)

    def test_retrieve_table_detail_general_permission_denied_without_object_perm(self):
        """Retrieving table detail with only global 'view_table' permission returns 403 Forbidden (requires object-level perm)."""
        content_type = ContentType.objects.get_for_model(Table)
        view_table_perm = Permission.objects.get(codename='view_table', content_type=content_type)
        self.regular_user.user_permissions.add(view_table_perm)
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)

        url = reverse('table-detail', kwargs={'pk': self.table.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('detail'), 'You do not have permission to perform this action.')

    def test_update_table_detail_general_permission_denied_without_object_perm(self):
        """Updating table with only global permissions returns 403 Forbidden (requires object-level perm)."""
        content_type = ContentType.objects.get_for_model(Table)
        view_table_perm = Permission.objects.get(codename='view_table', content_type=content_type)
        change_table_perm = Permission.objects.get(codename='change_table', content_type=content_type)
        self.regular_user.user_permissions.add(view_table_perm, change_table_perm)
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)

        url = reverse('table-detail', kwargs={'pk': self.table.id})
        data = {'name': 'Updated Name Global'}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('detail'), 'You do not have permission to perform this action.')

    def test_delete_table_detail_general_permission_denied_without_object_perm(self):
        """Deleting table with only global permissions returns 403 Forbidden (requires object-level perm)."""
        content_type = ContentType.objects.get_for_model(Table)
        view_table_perm = Permission.objects.get(codename='view_table', content_type=content_type)
        delete_table_perm = Permission.objects.get(codename='delete_table', content_type=content_type)
        self.regular_user.user_permissions.add(view_table_perm, delete_table_perm)
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)

        url = reverse('table-detail', kwargs={'pk': self.table.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class TabPermissionsTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tab_user', password='password123')
        self.table = Table.objects.create(name='Tab Test Table', description='Desc')
        self.tab = Tab.objects.create(table=self.table, name='Test Tab', label='Test Tab', order=0)

        ct_tab = ContentType.objects.get_for_model(Tab)
        self.add_tab_perm = Permission.objects.get(codename='add_tab', content_type=ct_tab)
        self.change_tab_perm = Permission.objects.get(codename='change_tab', content_type=ct_tab)
        self.delete_tab_perm = Permission.objects.get(codename='delete_tab', content_type=ct_tab)
        self.view_tab_perm = Permission.objects.get(codename='view_tab', content_type=ct_tab)

        ct_table = ContentType.objects.get_for_model(Table)
        self.add_table_perm = Permission.objects.get(codename='add_table', content_type=ct_table)
        self.view_table_perm = Permission.objects.get(codename='view_table', content_type=ct_table)

    def _refresh_user(self):
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    # --- CREAR (POST) ---
    def test_create_tab_without_permission(self):
        """Crear pestaña sin permisos retorna 403 Forbidden."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/tabs/'
        data = {'name': 'New Tab Without Perm', 'label': 'New Tab Label', 'order': 1}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_tab_with_permission(self):
        """Crear pestaña con permiso general 'add_tab' y permiso 'add_table' en la tabla retorna 201 Created."""
        self.user.user_permissions.add(self.add_tab_perm)
        assign_perm('add_table', self.user, self.table)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/'
        data = {'name': 'New Tab With Perm', 'label': 'New Tab Label', 'order': 1}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Tab With Perm')

    # --- LISTAR (GET) ---
    def test_list_tabs_without_permission(self):
        """Listar pestañas sin permiso de tabla retorna 403; con permiso de tabla pero sin pestaña retorna []."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/tabs/'
        response_no_table = self.client.get(url)
        self.assertEqual(response_no_table.status_code, status.HTTP_403_FORBIDDEN)

        assign_perm('view_table', self.user, self.table)
        self._refresh_user()
        response_no_tab = self.client.get(url)
        self.assertEqual(response_no_tab.status_code, status.HTTP_200_OK)
        self.assertEqual(response_no_tab.data, [])

    def test_list_tabs_with_granular_permission(self):
        """Listar pestañas con permiso granular 'view_tab' retorna 200 OK con la pestaña."""
        assign_perm('view_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], str(self.tab.id))

    def test_list_tabs_with_general_permissions_only_denied_without_table_object_perm(self):
        """Listar pestañas con solo permisos generales retorna 403 Forbidden (requiere permiso de objeto en tabla)."""
        self.user.user_permissions.add(self.view_table_perm, self.view_tab_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('detail'), 'You do not have permission to perform this action.')

    def test_list_tabs_with_general_tab_perm_and_table_object_perm(self):
        """Listar pestañas con permiso de objeto en tabla y permiso general 'view_tab' retorna 200 OK."""
        assign_perm('view_table', self.user, self.table)
        self.user.user_permissions.add(self.view_tab_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    # --- DETALLE (GET <id>) ---
    def test_detail_tab_without_permission(self):
        """Detalle de pestaña sin permisos retorna 403 (sin tabla) o 404 (sin tab)."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        response_no_table = self.client.get(url)
        self.assertEqual(response_no_table.status_code, status.HTTP_403_FORBIDDEN)

        assign_perm('view_table', self.user, self.table)
        self._refresh_user()
        response_no_tab = self.client.get(url)
        self.assertEqual(response_no_tab.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_tab_with_granular_permission(self):
        """Detalle de pestaña con permiso granular 'view_tab' y 'view_table' retorna 200 OK."""
        assign_perm('view_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], str(self.tab.id))

    def test_detail_tab_with_general_permission_only_denied(self):
        """Detalle de pestaña con solo permisos generales retorna 403 Forbidden (requiere permiso de objeto en tabla)."""
        self.user.user_permissions.add(self.view_table_perm, self.view_tab_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- ACTUALIZAR (PUT <id>) ---
    def test_update_tab_without_permission(self):
        """Actualizar pestaña sin permiso 'change_tab' retorna 403 Forbidden."""
        assign_perm('view_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        data = {'table': str(self.table.id), 'name': 'Updated Tab', 'label': 'Updated Label', 'order': 1}
        response = self.client.put(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_tab_with_granular_permission(self):
        """Actualizar pestaña con permisos granulares 'change_table' en tabla y 'change_tab' en tab retorna 200 OK."""
        assign_perm('view_table', self.user, self.table)
        assign_perm('change_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        assign_perm('change_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        data = {'table': str(self.table.id), 'name': 'Updated Tab', 'label': 'Updated Label', 'order': 1}
        response = self.client.put(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Tab')

    def test_update_tab_with_general_permission_only_denied(self):
        """Actualizar pestaña con solo permisos generales retorna 403 Forbidden (requiere permisos de objeto)."""
        self.user.user_permissions.add(self.view_table_perm, self.view_tab_perm, self.change_tab_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        data = {'table': str(self.table.id), 'name': 'Updated Tab Gen', 'label': 'Updated Label', 'order': 1}
        response = self.client.put(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --- ELIMINAR (DELETE <id>) ---
    def test_delete_tab_without_permission(self):
        """Eliminar pestaña sin permiso 'delete_tab' retorna 403 Forbidden."""
        assign_perm('view_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_tab_with_granular_permission(self):
        """Eliminar pestaña con permisos granulares 'delete_table' en tabla y 'delete_tab' en tab retorna 204 No Content."""
        assign_perm('view_table', self.user, self.table)
        assign_perm('delete_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        assign_perm('delete_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_delete_tab_with_general_permission_only_denied(self):
        """Eliminar pestaña con solo permisos generales retorna 403 Forbidden (requiere permisos de objeto)."""
        self.user.user_permissions.add(self.view_table_perm, self.view_tab_perm, self.delete_tab_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/tabs/{self.tab.id}/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ColumnPermissionsTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='col_user', password='password123')
        self.table = Table.objects.create(name='Col Test Table', description='Desc')
        self.tab = Tab.objects.create(table=self.table, name='Col Test Tab', label='Col Test Tab', order=0)
        self.column = Column.objects.create(tab=self.tab, name='Test Column', type='text', order=0, is_required=False)

        ct_col = ContentType.objects.get_for_model(Column)
        self.add_col_perm = Permission.objects.get(codename='add_column', content_type=ct_col)
        self.change_col_perm = Permission.objects.get(codename='change_column', content_type=ct_col)
        self.delete_col_perm = Permission.objects.get(codename='delete_column', content_type=ct_col)

        ct_tab = ContentType.objects.get_for_model(Tab)
        self.view_tab_perm = Permission.objects.get(codename='view_tab', content_type=ct_tab)

    def _refresh_user(self):
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    # --- CREAR (POST) ---
    def test_create_column_without_permission(self):
        """Crear columna sin permiso general 'add_column' retorna 403 Forbidden."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/columns/'
        data = {'tab_id': str(self.tab.id), 'name': 'New Col', 'type': 'text', 'order': 1, 'is_required': False}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_column_with_general_permission(self):
        """Crear columna con permiso general 'add_column' retorna 201 Created."""
        self.user.user_permissions.add(self.add_col_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/columns/'
        data = {'tab_id': str(self.tab.id), 'name': 'New Col', 'type': 'text', 'order': 1, 'is_required': False}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Col')

    # --- LISTAR (GET) ---
    def test_list_columns_without_permission(self):
        """Listar columnas sin permiso 'view_tab' sobre la pestaña retorna 200 OK con lista vacía."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/columns/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_list_columns_with_granular_permission(self):
        """Listar columnas con permiso granular 'view_tab' sobre la pestaña retorna 200 OK con las columnas."""
        assign_perm('view_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/columns/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], str(self.column.id))

    def test_list_columns_with_general_permission(self):
        """Listar columnas con permiso general 'view_tab' sobre Tab retorna 200 OK con las columnas."""
        self.user.user_permissions.add(self.view_tab_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/columns/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], str(self.column.id))

    # --- DETALLE (GET <id>) ---
    def test_detail_column_without_permission(self):
        """Detalle de columna sin permiso sobre la pestaña retorna 404 Not Found."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/columns/{self.column.id}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_column_with_granular_permission(self):
        """Detalle de columna con permiso granular 'view_tab' retorna 200 OK."""
        assign_perm('view_tab', self.user, self.tab)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/columns/{self.column.id}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], str(self.column.id))

    def test_detail_column_with_general_permission(self):
        """Detalle de columna con permiso general 'view_tab' retorna 200 OK."""
        self.user.user_permissions.add(self.view_tab_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/columns/{self.column.id}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], str(self.column.id))

    # --- ACTUALIZAR (PUT <id>) ---
    def test_update_column_without_permission(self):
        """Actualizar columna: 403 si falta 'change_column', 404 si falta 'view_tab'."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/columns/{self.column.id}/'
        data = {'tab_id': str(self.tab.id), 'name': 'Updated Col', 'type': 'text', 'order': 0, 'is_required': False}
        response_no_change = self.client.put(url, data)
        self.assertEqual(response_no_change.status_code, status.HTTP_403_FORBIDDEN)

        self.user.user_permissions.add(self.change_col_perm)
        self._refresh_user()
        response_no_tab = self.client.put(url, data)
        self.assertEqual(response_no_tab.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_column_with_permission(self):
        """Actualizar columna con permiso general 'change_column' y granular 'view_tab' retorna 200 OK."""
        assign_perm('view_tab', self.user, self.tab)
        self.user.user_permissions.add(self.change_col_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/columns/{self.column.id}/'
        data = {'tab_id': str(self.tab.id), 'name': 'Updated Col', 'type': 'text', 'order': 0, 'is_required': False}
        response = self.client.put(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Col')

    # --- ELIMINAR (DELETE <id>) ---
    def test_delete_column_without_permission(self):
        """Eliminar columna: 403 si falta 'delete_column', 404 si falta 'view_tab'."""
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/columns/{self.column.id}/'
        response_no_delete = self.client.delete(url)
        self.assertEqual(response_no_delete.status_code, status.HTTP_403_FORBIDDEN)

        self.user.user_permissions.add(self.delete_col_perm)
        self._refresh_user()
        response_no_tab = self.client.delete(url)
        self.assertEqual(response_no_tab.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_column_with_permission(self):
        """Eliminar columna con permiso general 'delete_column' y granular 'view_tab' retorna 204 No Content."""
        assign_perm('view_tab', self.user, self.tab)
        self.user.user_permissions.add(self.delete_col_perm)
        self._refresh_user()
        url = f'/api/tables/{self.table.id}/columns/{self.column.id}/'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class DateCellValueTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='date_user', password='password123')
        self.table = Table.objects.create(name='Date Test Table', description='Desc')
        self.tab = Tab.objects.create(table=self.table, name='Date Tab', label='Date Tab', order=0)
        self.column = Column.objects.create(tab=self.tab, name='Fecha Creacion', type='date', order=0)
        self.row = Row.objects.create(table=self.table, name='Row 1', order=0)

        # Permissions for CellValue API
        ct_cell = ContentType.objects.get_for_model(CellValue)
        add_cell_perm = Permission.objects.get(codename='add_cellvalue', content_type=ct_cell)
        change_cell_perm = Permission.objects.get(codename='change_cellvalue', content_type=ct_cell)
        view_cell_perm = Permission.objects.get(codename='view_cellvalue', content_type=ct_cell)
        self.user.user_permissions.add(add_cell_perm, change_cell_perm, view_cell_perm)
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    def test_create_column_with_date_type(self):
        """Verifica que se puede crear una columna de tipo 'date'."""
        self.assertEqual(self.column.type, 'date')

    def test_cell_value_model_set_and_get_date(self):
        """Verifica el guardado y recuperación de un valor de fecha en CellValue."""
        cell = CellValue.objects.create(row=self.row, column=self.column)
        
        # Asignar mediante string ISO
        cell.set_value('2026-10-11')
        cell.save()
        self.assertEqual(cell.value_date, datetime.date(2026, 10, 11))
        self.assertEqual(cell.get_value(), '2026-10-11')

        # Asignar mediante objeto date
        cell.set_value(datetime.date(2027, 5, 20))
        cell.save()
        self.assertEqual(cell.value_date, datetime.date(2027, 5, 20))
        self.assertEqual(cell.get_value(), '2027-05-20')

    def test_cell_value_api_create_and_update_valid_date(self):
        """Crear y actualizar una celda de tipo fecha a través de la API CellValueViewSet."""
        url = f'/api/tables/cell/{self.table.id}/{self.column.id}/{self.row.id}/'
        
        # POST create
        response = self.client.post(url, {'value': '2026-10-11'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['value'], '2026-10-11')

        # GET retrieve
        response_get = self.client.get(url)
        self.assertEqual(response_get.status_code, status.HTTP_200_OK)
        self.assertEqual(response_get.data['value'], '2026-10-11')

        # PUT update
        response_put = self.client.put(url, {'value': '2027-01-15'})
        self.assertEqual(response_put.status_code, status.HTTP_200_OK)
        self.assertEqual(response_put.data['value'], '2027-01-15')

    def test_cell_value_api_rejects_invalid_date(self):
        """La API CellValueViewSet rechaza valores no compatibles con fecha devolviendo 400 Bad Request."""
        url = f'/api/tables/cell/{self.table.id}/{self.column.id}/{self.row.id}/'
        
        # Fecha con formato inválido
        response_invalid_format = self.client.post(url, {'value': 'invalid-date-string'})
        self.assertEqual(response_invalid_format.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('value', response_invalid_format.data)

        # Tipo no compatible (número o boolean)
        response_invalid_type = self.client.post(url, {'value': 12345})
        self.assertEqual(response_invalid_type.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('value', response_invalid_type.data)


class TableBulkUploadTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='bulk_user', password='password123')
        self.other_user = User.objects.create_user(username='other_bulk_user', password='password123')

        content_type_tab = ContentType.objects.get_for_model(Tab)
        content_type_row = ContentType.objects.get_for_model(Row)
        self.add_tab_perm = Permission.objects.get(codename='add_tab', content_type=content_type_tab)
        self.add_row_perm = Permission.objects.get(codename='add_row', content_type=content_type_row)

        self.table = Table.objects.create(name='Bulk Table', description='Table for bulk testing')
        assign_perm('change_table', self.user, self.table)
        assign_perm('view_table', self.user, self.table)
        self.user.user_permissions.add(self.add_tab_perm, self.add_row_perm)
        self.user = User.objects.get(id=self.user.id)

    def test_anonymous_denied(self):
        url = f'/api/tables/{self.table.id}/bulk/'
        response = self.client.post(url, {'tabs': ['Tab 1'], 'rows': ['Row 1']})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_without_table_permission_denied(self):
        self.client.force_authenticate(user=self.other_user)
        self.other_user.user_permissions.add(self.add_tab_perm, self.add_row_perm)
        url = f'/api/tables/{self.table.id}/bulk/'
        response = self.client.post(url, {'tabs': ['Tab 1'], 'rows': ['Row 1']})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_bulk_upload_tabs_and_rows_success(self):
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/bulk/'
        payload = {
            'tabs': [
                {'name': 'Tab A', 'label': 'Etiqueta A', 'order': 0},
                {'name': 'Tab B', 'label': 'Etiqueta B', 'order': 1}
            ],
            'rows': [
                {'name': 'Fila 1', 'order': 0},
                {'name': 'Fila 2', 'order': 1}
            ]
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['tabs_count'], 2)
        self.assertEqual(response.data['rows_count'], 2)

        # Verificar BD
        self.assertEqual(Tab.objects.filter(table=self.table).count(), 2)
        self.assertEqual(Row.objects.filter(table=self.table).count(), 2)

        # Verificar permisos Guardian asignados al usuario en los tabs creados
        tab_a = Tab.objects.get(table=self.table, name='Tab A')
        tab_perms = get_perms(self.user, tab_a)
        self.assertIn('view_tab', tab_perms)
        self.assertIn('change_tab', tab_perms)
        self.assertIn('delete_tab', tab_perms)

    def test_bulk_upload_string_format(self):
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/bulk/'
        payload = {
            'tabs': ['Pestaña Directa 1', 'Pestaña Directa 2'],
            'rows': ['Alumno Uno', 'Alumno Dos', 'Alumno Tres']
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['tabs_count'], 2)
        self.assertEqual(response.data['rows_count'], 3)
        self.assertTrue(Tab.objects.filter(table=self.table, name='Pestaña Directa 1').exists())
        self.assertTrue(Row.objects.filter(table=self.table, name='Alumno Tres').exists())

    def test_bulk_upload_with_cell_values(self):
        # Crear un tab y una columna primero
        tab = Tab.objects.create(table=self.table, name='General', label='General', order=0)
        col = Column.objects.create(tab=tab, name='Email', type='text', order=0)

        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/bulk/'
        payload = {
            'rows': [
                {'name': 'Usuario Test', 'data': {str(col.id): 'test@example.com'}}
            ]
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['rows_count'], 1)

        row_obj = Row.objects.get(table=self.table, name='Usuario Test')
        cell = CellValue.objects.get(row=row_obj, column=col)
        self.assertEqual(cell.get_value(), 'test@example.com')

    def test_bulk_upload_duplicate_tab_rejected(self):
        Tab.objects.create(table=self.table, name='Existente', label='Existente', order=0)
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/bulk/'
        payload = {
            'tabs': [{'name': 'Existente'}]
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_bulk_upload_empty_payload_rejected(self):
        self.client.force_authenticate(user=self.user)
        url = f'/api/tables/{self.table.id}/bulk/'
        response = self.client.post(url, {'tabs': [], 'rows': []}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TabViewPaginationTestCase(APITestCase):
    """Pruebas de la paginación (filas y columnas) del endpoint TabView."""

    ROWS = 120
    COLUMNS = 3

    def setUp(self):
        self.user = User.objects.create_user(username='tabview_user', password='password123')

        self.table = Table.objects.create(name='TabView Pagination Table', description='Pagination tests')
        self.tab = Tab.objects.create(table=self.table, name='Principal', label='Principal', order=0)

        self.columns = [
            Column.objects.create(tab=self.tab, name=f'Col {i + 1}', type='text', order=i)
            for i in range(self.COLUMNS)
        ]

        self.rows = [
            Row.objects.create(table=self.table, name=f'Row {i + 1}', order=i)
            for i in range(self.ROWS)
        ]

        # Una celda por cada fila/columna con un valor identificable
        for row in self.rows:
            for column in self.columns:
                cell = CellValue.objects.create(row=row, column=column)
                cell.set_value(f'{row.name}::{column.name}')
                cell.save()

        assign_perm('view_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        # Refrescar el usuario para limpiar cachés de permisos de guardian
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    def _url(self, **params):
        url = reverse('tab_view', kwargs={'table_id': self.table.id, 'tab_id': self.tab.id})
        if params:
            query = '&'.join(f'{key}={value}' for key, value in params.items())
            url = f'{url}?{query}'
        return url

    def test_default_request_returns_first_page_and_metadata(self):
        """Sin parámetros se devuelve el primer lote (50 filas) con metadatos de paginación."""
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('pagination', response.data)

        pagination = response.data['pagination']
        self.assertEqual(pagination['total_rows'], self.ROWS)
        self.assertEqual(pagination['row_limit'], 50)
        self.assertEqual(pagination['row_offset'], 0)
        self.assertTrue(pagination['has_more_rows'])
        self.assertEqual(pagination['total_columns'], self.COLUMNS)
        self.assertEqual(pagination['col_limit'], 100)
        self.assertEqual(pagination['col_offset'], 0)
        self.assertFalse(pagination['has_more_columns'])

        self.assertEqual(len(response.data['rows']), 50)
        self.assertEqual(len(response.data['columns']), self.COLUMNS)

    def test_row_limit_and_offset_are_respected(self):
        """row_limit y row_offset devuelven exactamente el lote solicitado."""
        response = self.client.get(self._url(row_limit=10, row_offset=5))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned_ids = [row['id'] for row in response.data['rows']]
        expected_ids = [str(row.id) for row in self.rows[5:15]]
        self.assertEqual(returned_ids, expected_ids)

        pagination = response.data['pagination']
        self.assertEqual(pagination['row_limit'], 10)
        self.assertEqual(pagination['row_offset'], 5)
        self.assertTrue(pagination['has_more_rows'])

    def test_last_page_has_no_more_rows(self):
        """En el último lote has_more_rows es False y se devuelven las filas restantes."""
        response = self.client.get(self._url(row_limit=50, row_offset=100))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        rows = response.data['rows']
        self.assertEqual(len(rows), self.ROWS - 100)
        self.assertEqual([r['id'] for r in rows], [str(r.id) for r in self.rows[100:]])

        pagination = response.data['pagination']
        self.assertEqual(pagination['row_offset'], 100)
        self.assertFalse(pagination['has_more_rows'])

    def test_cells_returned_match_the_paginated_batch(self):
        """Las celdas devueltas pertenecen exactamente al lote de filas y columnas paginadas."""
        response = self.client.get(self._url(row_limit=5, row_offset=10))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        rows = response.data['rows']
        columns = response.data['columns']
        self.assertEqual(len(rows), 5)
        self.assertEqual([r['id'] for r in rows], [str(r.id) for r in self.rows[10:15]])

        column_ids = {str(column['id']) for column in columns}
        for row in rows:
            self.assertEqual(set(row['cells'].keys()), column_ids)
            for column in columns:
                cell = CellValue.objects.get(row_id=row['id'], column_id=column['id'])
                self.assertEqual(row['cells'][column['id']], cell.get_value())

    def test_row_limit_all_returns_every_row(self):
        """row_limit=all devuelve todas las filas (modo no paginado)."""
        response = self.client.get(self._url(row_limit='all'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['rows']), self.ROWS)
        self.assertFalse(response.data['pagination']['has_more_rows'])

    def test_row_limit_zero_returns_every_row(self):
        """row_limit=0 también habilita el modo no paginado."""
        response = self.client.get(self._url(row_limit=0))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['rows']), self.ROWS)
        self.assertFalse(response.data['pagination']['has_more_rows'])

    def test_row_limit_is_clamped_to_maximum(self):
        """Un row_limit mayor al máximo permitido se recorta a 500."""
        response = self.client.get(self._url(row_limit=5000))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['pagination']['row_limit'], 500)
        self.assertEqual(len(response.data['rows']), self.ROWS)
        self.assertFalse(response.data['pagination']['has_more_rows'])

    def test_column_pagination(self):
        """col_limit y col_offset paginan las columnas y calculan has_more_columns."""
        response = self.client.get(self._url(col_limit=1, col_offset=0))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        columns = response.data['columns']
        self.assertEqual(len(columns), 1)
        self.assertEqual(columns[0]['id'], str(self.columns[0].id))

        pagination = response.data['pagination']
        self.assertEqual(pagination['total_columns'], self.COLUMNS)
        self.assertEqual(pagination['col_limit'], 1)
        self.assertEqual(pagination['col_offset'], 0)
        self.assertTrue(pagination['has_more_columns'])

        response2 = self.client.get(self._url(col_limit=2, col_offset=1))
        columns2 = response2.data['columns']
        self.assertEqual([c['id'] for c in columns2], [str(self.columns[1].id), str(self.columns[2].id)])
        self.assertFalse(response2.data['pagination']['has_more_columns'])

    def test_invalid_params_fall_back_to_defaults(self):
        """Parámetros no numéricos o negativos caen a los valores por defecto."""
        response = self.client.get(self._url(row_limit='abc', row_offset=-5))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        pagination = response.data['pagination']
        self.assertEqual(pagination['row_limit'], 50)
        self.assertEqual(pagination['row_offset'], 0)
        self.assertEqual(len(response.data['rows']), 50)


class TabViewRowOrderingTestCase(APITestCase):
    """
    El orden de filas de TabView debe ser determinista aunque `order` empate.

    El modelo Row ordena por `order`, pero la creación desde la UI deja varias
    filas con order=0; sin desempate la paginación puede saltar filas.
    """

    # Órdenes con empates intencionales (la mayoría en 0)
    ORDERS = [0] * 20 + [1] * 3 + [2] * 2

    def setUp(self):
        self.user = User.objects.create_user(username='ordering_user', password='password123')

        self.table = Table.objects.create(name='TabView Ordering Table')
        self.tab = Tab.objects.create(table=self.table, name='Principal', label='Principal', order=0)
        self.column = Column.objects.create(tab=self.tab, name='Col 1', type='text', order=0)

        self.rows = [
            Row.objects.create(table=self.table, name=f'Row {i + 1}', order=order)
            for i, order in enumerate(self.ORDERS)
        ]

        assign_perm('view_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    def _url(self, **params):
        url = reverse('tab_view', kwargs={'table_id': self.table.id, 'tab_id': self.tab.id})
        if params:
            query = '&'.join(f'{key}={value}' for key, value in params.items())
            url = f'{url}?{query}'
        return url

    def _expected_ids(self):
        """Mismo orden determinista esperado: order, created_at, id."""
        return [
            str(row.id) for row in
            Row.objects.filter(table=self.table).order_by('order', 'created_at', 'id')
        ]

    def test_rows_are_ordered_deterministically_when_order_ties(self):
        """Con `order` empatado el resultado sigue order -> created_at -> id."""
        response = self.client.get(self._url(row_limit='all'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned = [row['id'] for row in response.data['rows']]
        self.assertEqual(returned, self._expected_ids())

    def test_tied_order_rows_keep_creation_order(self):
        """Las filas que comparten `order` se devuelven en orden de creación."""
        response = self.client.get(self._url(row_limit='all'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned = [row['id'] for row in response.data['rows']]
        tied_rows = [row for row, order in zip(self.rows, self.ORDERS) if order == 0]
        expected_tied = [str(row.id) for row in tied_rows]
        # El primer bloque corresponde a las filas con order=0 (las creadas primero)
        self.assertEqual(returned[:len(expected_tied)], expected_tied)

    def test_block_pagination_does_not_skip_or_duplicate_rows(self):
        """Recorrer todo el conjunto por bloques no salta ni duplica filas."""
        block = 4
        collected = []
        for offset in range(0, len(self.ORDERS), block):
            response = self.client.get(self._url(row_limit=block, row_offset=offset))
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            pagination = response.data['pagination']
            self.assertEqual(pagination['row_offset'], offset)
            self.assertEqual(pagination['total_rows'], len(self.ORDERS))
            collected.extend(row['id'] for row in response.data['rows'])

        expected = self._expected_ids()
        self.assertEqual(len(collected), len(self.ORDERS))
        self.assertEqual(len(set(collected)), len(self.ORDERS))
        self.assertEqual(collected, expected)

    def test_repeated_requests_return_same_order(self):
        """Dos peticiones idénticas devuelven exactamente el mismo bloque."""
        first = self.client.get(self._url(row_limit=5, row_offset=3))
        second = self.client.get(self._url(row_limit=5, row_offset=3))
        self.assertEqual(
            [row['id'] for row in first.data['rows']],
            [row['id'] for row in second.data['rows']],
        )


class RowCreateOrderTestCase(APITestCase):
    """RowViewSet.create asigna `order` incremental si el cliente no lo envía."""

    def setUp(self):
        self.user = User.objects.create_user(username='row_create_user', password='password123')
        content_type_row = ContentType.objects.get_for_model(Row)
        self.add_row_perm = Permission.objects.get(codename='add_row', content_type=content_type_row)
        self.user.user_permissions.add(self.add_row_perm)

        self.table = Table.objects.create(name='Row Create Order Table')
        self.tab = Tab.objects.create(table=self.table, name='Principal', label='Principal', order=0)
        self.url = f'/api/tables/{self.table.id}/rows/'

        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    def test_create_without_order_on_empty_table_starts_at_zero(self):
        response = self.client.post(self.url, {'name': 'Primera', 'data': {}}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['order'], 0)

    def test_create_without_order_uses_max_plus_one(self):
        Row.objects.create(table=self.table, name='Existente', order=4)
        response = self.client.post(self.url, {'name': 'Nueva', 'data': {}}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['order'], 5)

    def test_consecutive_creates_do_not_tie(self):
        for i in range(3):
            response = self.client.post(
                self.url, {'name': f'Fila {i}', 'data': {}}, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        orders = list(Row.objects.filter(table=self.table).values_list('order', flat=True))
        self.assertEqual(sorted(orders), [0, 1, 2])

    def test_create_with_explicit_order_is_preserved(self):
        Row.objects.create(table=self.table, name='Existente', order=10)
        response = self.client.post(
            self.url, {'name': 'Explicita', 'data': {}, 'order': 2}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['order'], 2)


class RowCellValuesViewTestCase(APITestCase):
    """
    GET /api/tables/<table_id>/rows/<pk>/cellvalues/ (modo revisión).

    Devuelve todas las columnas de la pestaña con el valor de la fila, sin
    paginación y con orden determinista `order, id`.
    """

    COLUMN_SPECS = [
        ('Texto', 'text', None, 'Hola mundo'),
        ('Entero', 'int', None, 42),
        ('Decimal', 'float', None, 3.5),
        ('Activo', 'checkbox', None, True),
        ('Estado', 'select', ['Activo', 'Inactivo', 'Baja'], 'Activo'),
        ('Fecha', 'date', None, '2026-10-15'),
    ]

    # 6 columnas base + 54 extra = 60 columnas en la prueba de N+1.
    EXTRA_COLUMNS = 54

    def setUp(self):
        self.user = User.objects.create_user(
            username='row_cells_user', password='password123')
        self.outsider = User.objects.create_user(
            username='row_cells_outsider', password='password123')

        self.table = Table.objects.create(
            name='Review Row Table', description='Modo revisión')
        self.tab = Tab.objects.create(
            table=self.table, name='General', label='General', order=0)
        self.second_tab = Tab.objects.create(
            table=self.table, name='Extra', label='Extra', order=5)

        self.columns = [
            Column.objects.create(
                tab=self.tab, name=name, type=column_type,
                options=options, order=index)
            for index, (name, column_type, options, _value) in enumerate(self.COLUMN_SPECS)
        ]

        self.row = Row.objects.create(
            table=self.table, name='Cliente 3', order=2)
        self.empty_row = Row.objects.create(
            table=self.table, name='Cliente 4', order=3)

        for column, (_name, _type, _options, value) in zip(self.columns, self.COLUMN_SPECS):
            cell = CellValue.objects.create(row=self.row, column=column)
            cell.set_value(value)
            cell.save()

        # Objetos de otra tabla: sirven para validar los 404 por pertenencia
        other_table = Table.objects.create(name='Review Row Other Table')
        self.other_tab = Tab.objects.create(
            table=other_table, name='General', label='General', order=0)
        self.other_row = Row.objects.create(
            table=other_table, name='Ajena', order=0)

    def _url(self, row_id, table_id=None, **params):
        url = reverse('row_cellvalues', kwargs={
            'table_id': str(table_id or self.table.id),
            'pk': str(row_id),
        })
        if params:
            query = '&'.join(f'{key}={value}' for key, value in params.items())
            url = f'{url}?{query}'
        return url

    def _authenticate(self, view_tab=True):
        assign_perm('view_table', self.user, self.table)
        if view_tab:
            assign_perm('view_tab', self.user, self.tab)
            assign_perm('view_tab', self.user, self.second_tab)
        # Refrescar el usuario limpia la caché de permisos de guardian
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    def test_returns_all_columns_with_values_for_every_type(self):
        """200 con todas las columnas de la pestaña y un valor por tipo."""
        self._authenticate()
        response = self.client.get(self._url(self.row.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['axis'], 'row')
        self.assertEqual(response.data['total'], len(self.COLUMN_SPECS))
        self.assertEqual(len(response.data['items']), len(self.COLUMN_SPECS))

        items = {item['column_name']: item for item in response.data['items']}
        self.assertEqual(items['Texto']['value'], 'Hola mundo')
        self.assertEqual(items['Entero']['value'], 42)
        self.assertIsInstance(items['Entero']['value'], int)
        self.assertAlmostEqual(items['Decimal']['value'], 3.5)
        self.assertIsInstance(items['Decimal']['value'], float)
        self.assertIs(items['Activo']['value'], True)
        self.assertEqual(items['Activo']['type'], 'checkbox')
        self.assertEqual(items['Estado']['value'], 'Activo')
        self.assertEqual(items['Estado']['type'], 'select')
        self.assertEqual(items['Estado']['options'], ['Activo', 'Inactivo', 'Baja'])
        self.assertEqual(items['Fecha']['value'], '2026-10-15')
        self.assertEqual(items['Fecha']['type'], 'date')

    def test_target_and_tab_payload(self):
        """`target` describe la fila y `tab` la pestaña usada."""
        self._authenticate()
        response = self.client.get(self._url(self.row.id))
        self.assertEqual(response.data['target'], {
            'id': str(self.row.id), 'name': 'Cliente 3', 'order': 2,
        })
        self.assertEqual(response.data['tab'], {
            'id': str(self.tab.id), 'name': 'General', 'label': 'General',
        })

    def test_missing_cells_are_null(self):
        """Las celdas que no existen se devuelven como `null` (no se omiten)."""
        self._authenticate()
        response = self.client.get(self._url(self.empty_row.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item['value'] for item in response.data['items']],
            [None] * len(self.COLUMN_SPECS),
        )
        self.assertEqual(response.data['total'], len(self.COLUMN_SPECS))

    def test_items_are_ordered_by_order_then_id_with_ties(self):
        """Con `order` empatado, el desempate es `id` y el orden es estable."""
        Column.objects.create(tab=self.tab, name='Empate A', type='text', order=0)
        Column.objects.create(tab=self.tab, name='Empate B', type='text', order=0)
        self._authenticate()

        response = self.client.get(self._url(self.row.id))
        expected = [
            str(column.id) for column in
            Column.objects.filter(tab=self.tab).order_by('order', 'id')
        ]
        self.assertEqual(
            [item['column_id'] for item in response.data['items']], expected)

        orders = [item['order'] for item in response.data['items']]
        self.assertEqual(orders, sorted(orders))
        # El primer bloque está formado por las columnas con order=0
        self.assertEqual(orders.count(0), 3)

    def test_does_not_scale_queries_with_column_count(self):
        """El número de consultas no crece con las columnas (sin N+1)."""
        self._authenticate()
        # Petición de calentamiento: guardian cachea permisos por usuario.
        self.client.get(self._url(self.row.id))

        with CaptureQueriesContext(connection) as baseline:
            baseline_response = self.client.get(self._url(self.row.id))
        self.assertEqual(
            len(baseline_response.data['items']), len(self.COLUMN_SPECS))

        # Muchas más columnas y celdas para la misma fila.
        extra_columns = [
            Column.objects.create(
                tab=self.tab, name=f'Extra {index}', type='text', order=100 + index)
            for index in range(self.EXTRA_COLUMNS)
        ]
        for column in extra_columns:
            cell = CellValue.objects.create(row=self.row, column=column)
            cell.set_value('Valor extra')
            cell.save()

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(self._url(self.row.id))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            len(response.data['items']),
            len(self.COLUMN_SPECS) + self.EXTRA_COLUMNS)
        self.assertEqual(
            len(captured), len(baseline),
            f'Las consultas crecieron con las columnas: '
            f'{len(baseline)} -> {len(captured)}')
        self.assertLess(
            len(captured), 20,
            f'Se esperaban pocas consultas, se ejecutaron {len(captured)}')

        # Las columnas nuevas también llegan con su valor (no solo el conteo).
        items = {item['column_id']: item for item in response.data['items']}
        for column in extra_columns:
            self.assertEqual(items[str(column.id)]['value'], 'Valor extra')

    def test_explicit_tab_id_returns_only_that_tab_columns(self):
        """`?tab_id=` acota las columnas a la pestaña indicada."""
        extra_column = Column.objects.create(
            tab=self.second_tab, name='Solo Extra', type='text', order=0)
        self._authenticate()

        response = self.client.get(
            self._url(self.row.id, tab_id=self.second_tab.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['tab']['id'], str(self.second_tab.id))
        self.assertEqual(
            [item['column_id'] for item in response.data['items']],
            [str(extra_column.id)],
        )
        self.assertIsNone(response.data['items'][0]['value'])
        self.assertEqual(response.data['total'], 1)

    def test_defaults_to_first_tab_by_order(self):
        """Sin `tab_id` se usa la primera pestaña por `order, id`."""
        Tab.objects.filter(id=self.second_tab.id).update(order=-1)
        self._authenticate()

        response = self.client.get(self._url(self.row.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['tab']['id'], str(self.second_tab.id))

    def test_table_without_tabs_returns_empty_payload(self):
        """Una tabla sin pestañas responde 200 con `items: []` y `tab: null`."""
        table = Table.objects.create(name='Review Empty Tabs Table')
        row = Row.objects.create(table=table, name='Sin pestañas', order=0)
        assign_perm('view_table', self.user, table)
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self._url(row.id, table_id=table.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['axis'], 'row')
        self.assertIsNone(response.data['tab'])
        self.assertEqual(response.data['items'], [])
        self.assertEqual(response.data['total'], 0)

    def test_tab_from_another_table_returns_404(self):
        """Una pestaña de otra tabla no es válida aunque exista."""
        self._authenticate()
        response = self.client.get(
            self._url(self.row.id, tab_id=self.other_tab.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_row_from_another_table_returns_404(self):
        """Una fila de otra tabla responde 404 en la ruta de esta tabla."""
        self._authenticate()
        response = self.client.get(self._url(self.other_row.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_table_not_found_returns_404(self):
        self._authenticate()
        response = self.client.get(self._url(
            self.row.id, table_id='00000000-0000-0000-0000-000000000000'))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_returns_401(self):
        response = self.client.get(self._url(self.row.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_without_permissions_returns_403(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(self._url(self.row.id))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_table_permission_but_without_tab_permission_returns_403(self):
        """Ver la tabla no basta: la pestaña también debe ser visible."""
        self._authenticate(view_tab=False)
        response = self.client.get(self._url(self.row.id))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticates_with_token_header_and_auth_cookie(self):
        """El endpoint acepta `Authorization: Token ...` y la cookie HTTPOnly."""
        token = Token.objects.create(user=self.user)
        assign_perm('view_table', self.user, self.table)
        assign_perm('view_tab', self.user, self.tab)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response_header = self.client.get(self._url(self.row.id))
        self.assertEqual(response_header.status_code, status.HTTP_200_OK)

        self.client.credentials()
        self.client.cookies[settings.AUTH_TOKEN_COOKIE_NAME] = token.key
        response_cookie = self.client.get(self._url(self.row.id))
        self.assertEqual(response_cookie.status_code, status.HTTP_200_OK)


class ColumnCellValuesViewTestCase(APITestCase):
    """
    GET /api/tables/<table_id>/columns/<pk>/cellvalues/ (modo revisión).

    Devuelve todas las filas de la tabla (más de 50, sin paginación) con el
    valor de la columna y orden determinista `order, created_at, id`.
    """

    ROWS = 120

    def setUp(self):
        self.user = User.objects.create_user(
            username='col_cells_user', password='password123')
        self.outsider = User.objects.create_user(
            username='col_cells_outsider', password='password123')

        self.table = Table.objects.create(
            name='Review Column Table', description='Modo revisión')
        self.tab = Tab.objects.create(
            table=self.table, name='General', label='General', order=0)
        self.column = Column.objects.create(
            tab=self.tab, name='Estado', type='select',
            options=['Activo', 'Inactivo'], order=2, is_required=True)
        self.other_column = Column.objects.create(
            tab=self.tab, name='Notas', type='text', order=3)

        # `order` repartido en 5 valores: hay empates reales de orden.
        self.rows = Row.objects.bulk_create([
            Row(table=self.table, name=f'Cliente {index + 1}', order=index % 5)
            for index in range(self.ROWS)
        ])

        # Solo las filas pares tienen celda: las impares deben salir en null.
        for index, row in enumerate(self.rows):
            if index % 2 == 0:
                cell = CellValue.objects.create(row=row, column=self.column)
                cell.set_value('Activo' if index % 4 == 0 else 'Inactivo')
                cell.save()

        other_table = Table.objects.create(name='Review Column Other Table')
        other_tab = Tab.objects.create(
            table=other_table, name='General', label='General', order=0)
        self.other_table_column = Column.objects.create(
            tab=other_tab, name='Estado', type='text', order=0)

    def _url(self, column_id=None, table_id=None):
        return reverse('column_cellvalues', kwargs={
            'table_id': str(table_id or self.table.id),
            'pk': str(column_id or self.column.id),
        })

    def _authenticate(self, view_tab=True):
        assign_perm('view_table', self.user, self.table)
        if view_tab:
            assign_perm('view_tab', self.user, self.tab)
        self.user = User.objects.get(id=self.user.id)
        self.client.force_authenticate(user=self.user)

    def test_returns_every_row_without_pagination(self):
        """Devuelve todas las filas aunque superen el bloque de 50 de TabView."""
        self.assertGreater(self.ROWS, 50)
        self._authenticate()
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['axis'], 'column')
        self.assertEqual(response.data['total'], self.ROWS)
        self.assertEqual(len(response.data['items']), self.ROWS)

    def test_target_contains_column_metadata(self):
        self._authenticate()
        response = self.client.get(self._url())
        self.assertEqual(response.data['target'], {
            'id': str(self.column.id),
            'name': 'Estado',
            'type': 'select',
            'options': ['Activo', 'Inactivo'],
            'order': 2,
            'is_required': True,
            'tab_id': str(self.tab.id),
        })

    def test_values_match_cells_and_missing_cells_are_null(self):
        self._authenticate()
        response = self.client.get(self._url())
        items = {item['row_id']: item for item in response.data['items']}
        self.assertEqual(len(items), self.ROWS)

        for index, row in enumerate(self.rows):
            item = items[str(row.id)]
            self.assertEqual(item['row_name'], row.name)
            if index % 2:
                self.assertIsNone(item['value'])
            else:
                self.assertEqual(
                    item['value'], 'Activo' if index % 4 == 0 else 'Inactivo')

    def test_rows_are_ordered_deterministically_when_order_ties(self):
        """Con `order` empatado el orden es `order, created_at, id` y estable."""
        self._authenticate()
        response = self.client.get(self._url())

        expected = [
            str(row.id) for row in
            Row.objects.filter(table=self.table).order_by('order', 'created_at', 'id')
        ]
        self.assertEqual(
            [item['row_id'] for item in response.data['items']], expected)

        orders = [item['order'] for item in response.data['items']]
        self.assertEqual(orders, sorted(orders))
        # Hay empates: menos valores distintos de `order` que de filas
        self.assertLess(len(set(orders)), len(orders))

        # Dos peticiones idénticas devuelven el mismo orden
        second = self.client.get(self._url())
        self.assertEqual(
            [item['row_id'] for item in second.data['items']], expected)

    def test_does_not_scale_queries_with_row_count(self):
        """El número de consultas no crece con las filas (sin N+1)."""
        self._authenticate()
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['items']), self.ROWS)
        self.assertLess(
            len(captured), 20,
            f'Se esperaban pocas consultas, se ejecutaron {len(captured)}')

    def test_column_from_another_table_returns_404(self):
        self._authenticate()
        response = self.client.get(self._url(column_id=self.other_table_column.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_returns_401(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_without_permissions_returns_403(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_table_permission_but_without_tab_permission_returns_403(self):
        self._authenticate(view_tab=False)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


