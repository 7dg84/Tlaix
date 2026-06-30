from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from api.models import Table, Tab, Column, Row

class TablePermissionsTestCase(APITestCase):
    def setUp(self):
        # Create users
        self.admin_user = User.objects.create_superuser(username='admin', password='adminpassword')
        self.regular_user = User.objects.create_user(username='user', password='userpassword')
        
        # Create a table and related items
        self.table = Table.objects.create(name='Test Table', description='A description')
        self.tab = Tab.objects.create(table=self.table, name='Test Tab', label='Test Tab', order=0)
        self.column = Column.objects.create(tab=self.tab, name='Test Column', type='text')
        self.row = Row.objects.create(table=self.table, name='Test Row', order=0)
        
        # Get permissions
        content_type = ContentType.objects.get_for_model(Table)
        self.add_table_perm = Permission.objects.get(codename='add_table', content_type=content_type)
        self.change_table_perm = Permission.objects.get(codename='change_table', content_type=content_type)
        self.delete_table_perm = Permission.objects.get(codename='delete_table', content_type=content_type)

    def test_anonymous_user_denied(self):
        """Anonymous users should be denied access to the table endpoints (401 Unauthorized)."""
        url = reverse('table-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_read(self):
        """Authenticated users can read (GET) tables even without specific model permissions."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authenticated_user_without_permission_cannot_create(self):
        """Authenticated users cannot create (POST) tables without 'add_table' permission."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-list')
        data = {'name': 'New Table', 'description': 'Some description'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_with_permission_can_create(self):
        """Authenticated users with 'add_table' permission can create (POST) tables."""
        # Grant add_table permission
        self.regular_user.user_permissions.add(self.add_table_perm)
        
        # Re-fetch user to clear cached permissions
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)
        
        url = reverse('table-list')
        data = {'name': 'New Table', 'description': 'Some description'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_authenticated_user_without_permission_cannot_delete(self):
        """Authenticated users cannot delete tables without 'delete_table' permission."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('table-detail', kwargs={'pk': self.table.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_with_permission_can_delete(self):
        """Authenticated users with 'delete_table' permission can delete tables."""
        self.regular_user.user_permissions.add(self.delete_table_perm)
        
        # Re-fetch user to clear cached permissions
        self.regular_user = User.objects.get(id=self.regular_user.id)
        self.client.force_authenticate(user=self.regular_user)
        
        url = reverse('table-detail', kwargs={'pk': self.table.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_tab_view_permission(self):
        """Authenticated users can read (GET) the tabview endpoint."""
        self.client.force_authenticate(user=self.regular_user)
        url = reverse('tab_view', kwargs={'table_id': self.table.id, 'tab_id': self.tab.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
