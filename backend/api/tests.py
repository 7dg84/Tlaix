from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
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


