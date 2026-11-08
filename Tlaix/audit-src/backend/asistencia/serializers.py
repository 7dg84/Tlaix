from rest_framework import serializers
from .models import AttendanceMember, AttendanceRelation
from api.models import Table, Row


class AttendanceMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceMember
        fields = [
            'identifier',
            'member_type',
            'first_name',
            'last_name',
            'second_last_name',
            'email',
            'phone',
            'photo',
            'extra_attributes',
            'is_active',
        ]


class AttendanceRelationSerializer(serializers.ModelSerializer):
    member_detail = AttendanceMemberSerializer(source='member', read_only=True)
    table_name = serializers.CharField(source='table.name', read_only=True)
    row_name = serializers.CharField(source='row.name', read_only=True)

    class Meta:
        model = AttendanceRelation
        fields = [
            'id',
            'member',
            'table',
            'row',
            'member_detail',
            'table_name',
            'row_name',
        ]


class AttendanceUploadSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=20)
    member_type = serializers.ChoiceField(choices=AttendanceMember.MEMBER_TYPE_CHOICES)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    second_last_name = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True, default='')
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True, default=None)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, allow_null=True, default=None)
    photo = serializers.ImageField(required=False, allow_null=True, default=None)
    extra_attributes = serializers.DictField(required=False, default=dict)
    group = serializers.CharField(max_length=255)
