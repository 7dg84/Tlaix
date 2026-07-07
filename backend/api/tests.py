from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from api.models import Table, Tab
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
        
        # Has view permission on the tab -> 200 OK
        assign_perm('view_tab', self.regular_user, self.tab)
        response2 = self.client.get(url)
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
