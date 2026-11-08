from rest_framework.permissions import BasePermission
# from rest_framework.authentication import TokenAuthentication
# from django.conf import settings
# from guardian.shortcuts import get_objects_for_user, assign_perm
# from rest_framework.permissions import BasePermission, SAFE_METHODS
# from guardian.shortcuts import get_objects_for_user


# Custom permision class to support guardian object permisions
class CanModifyStructure(BasePermission):
    def has_permission(self, request, view):
        # Primero requiere estar autenticado
        return request.user.is_authenticated
    def has_object_permission(self, request, view, obj):
        # 'obj' es la tabla relacionada
        # Comprueba si el usuario tiene el permiso de objeto 'modify_table_structure'
        return request.user.has_perm('api.modify_table_structure', obj)