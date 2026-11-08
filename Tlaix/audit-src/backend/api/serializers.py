import datetime
from rest_framework import serializers
from .models import Table, Column, Row, Tab, RowTabData, validate_and_format_cell_value
from django.contrib.auth.models import User
from rest_framework.validators import UniqueValidator


class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all())]
    )

    class Meta:
        model = User
        fields = ('id', 'username', 'email',)
        read_only_fields = ('id', 'email', )


class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = ['id', 'name', 'description',
                  'icon', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ColumnSerializer(serializers.ModelSerializer):
    tab_id = serializers.PrimaryKeyRelatedField(
        queryset=Tab.objects.all(), source='tab', required=False
    )
    table_id = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Column
        fields = ['id', 'table_id', 'tab_id', 'name',
                  'type', 'options', 'order', 'is_required']
        read_only_fields = ['id']

    def get_table_id(self, obj):
        return str(obj.tab.table_id) if obj.tab_id else None


class RowSerializer(serializers.ModelSerializer):
    # table_id = serializers.PrimaryKeyRelatedField(
    #     queryset=Table.objects.all(), source='table', required=True
    # )
    data = serializers.JSONField(required=True, write_only=True)

    class Meta:
        model = Row
        fields = ['id', 'table', 'name', 'order',
                  'data', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'data']

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        # Inject computed data from row_tab_data
        tab_records = instance.tab_data.all()
        merged_data = {}
        for rtd in tab_records:
            if isinstance(rtd.data, dict):
                merged_data.update(rtd.data)
        representation['data'] = merged_data
        return representation

    def _set_cells(self, row, data):
        if not data:
            return

        column_ids = list(data.keys())
        columns = Column.objects.filter(
            id__in=column_ids, tab__table=row.table).select_related('tab')

        tab_updates = {}
        for column in columns:
            col_id_str = str(column.id)
            if col_id_str in data:
                val = data[col_id_str]
                try:
                    formatted_val = validate_and_format_cell_value(column, val)
                except ValueError:
                    formatted_val = val
                tab_updates.setdefault(column.tab, {})[col_id_str] = formatted_val

        for tab, updates in tab_updates.items():
            rtd, _ = RowTabData.objects.get_or_create(row=row, tab=tab)
            if rtd.data is None:
                rtd.data = {}
            rtd.data.update(updates)
            rtd.save()

    def create(self, validated_data):
        data = validated_data.pop('data', {})
        row = Row.objects.create(**validated_data)
        self._set_cells(row, data)
        return row

    def update(self, instance, validated_data):
        data = validated_data.pop('data', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if data is not None:
            self._set_cells(instance, data)
        return instance


class TabSerializer(serializers.ModelSerializer):
    # table_id = serializers.PrimaryKeyRelatedField(
    #     queryset=Table.objects.all(), source='table', required=False
    # )

    class Meta:
        model = Tab
        fields = ['id', 'table', 'name', 'label', 'order']
        read_only_fields = ['id']


class CellValueSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    row_id = serializers.PrimaryKeyRelatedField(
        queryset=Row.objects.all(), source='row', required=True
    )
    column_id = serializers.PrimaryKeyRelatedField(
        queryset=Column.objects.all(), source='column', required=True
    )
    value = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def get_value(self, obj):
        if isinstance(obj, dict):
            return obj.get('value')
        return getattr(obj, 'value', None)

    def validate(self, attrs):
        value = self.initial_data.get('value')
        # Si se está actualizando y 'value' no está en initial_data, pasa
        if self.instance is not None and 'value' not in self.initial_data:
            return attrs

        if value is None and self.instance is None:
            raise serializers.ValidationError(
                {"value": "This field is required."})

        column = attrs.get('column')
        if not column and self.instance:
            column = self.instance.get('column') if isinstance(self.instance, dict) else getattr(self.instance, 'column', None)

        if column and value is not None:
            try:
                validate_and_format_cell_value(column, value)
            except ValueError as e:
                raise serializers.ValidationError({"value": str(e)})

        return attrs

    def create(self, validated_data):
        row = validated_data['row']
        column = validated_data['column']
        value = self.initial_data.get('value')
        if value is None:
            raise serializers.ValidationError(
                {"value": "This field is required."})

        try:
            formatted_val = validate_and_format_cell_value(column, value)
        except ValueError as e:
            raise serializers.ValidationError({"value": str(e)})

        rtd, _ = RowTabData.objects.get_or_create(row=row, tab=column.tab)
        if rtd.data is None:
            rtd.data = {}
        rtd.data[str(column.id)] = formatted_val
        rtd.save()

        return {
            'id': f"{rtd.id}:{column.id}",
            'row_id': str(row.id),
            'column_id': str(column.id),
            'row': row,
            'column': column,
            'value': formatted_val,
            'created_at': rtd.created_at,
            'updated_at': rtd.updated_at,
        }

    def update(self, instance, validated_data):
        row = validated_data.get('row', instance.get('row') if isinstance(instance, dict) else getattr(instance, 'row', None))
        column = validated_data.get('column', instance.get('column') if isinstance(instance, dict) else getattr(instance, 'column', None))

        rtd, _ = RowTabData.objects.get_or_create(row=row, tab=column.tab)
        if rtd.data is None:
            rtd.data = {}

        if 'value' in self.initial_data:
            value = self.initial_data.get('value')
            if value is not None:
                try:
                    formatted_val = validate_and_format_cell_value(column, value)
                except ValueError as e:
                    raise serializers.ValidationError({"value": str(e)})
            else:
                formatted_val = None
            rtd.data[str(column.id)] = formatted_val
            rtd.save()
        else:
            formatted_val = rtd.data.get(str(column.id))

        return {
            'id': f"{rtd.id}:{column.id}",
            'row_id': str(row.id),
            'column_id': str(column.id),
            'row': row,
            'column': column,
            'value': formatted_val,
            'created_at': rtd.created_at,
            'updated_at': rtd.updated_at,
        }

    def to_representation(self, instance):
        if isinstance(instance, dict):
            row_val = instance.get('row')
            row_id = str(row_val.id if hasattr(row_val, 'id') else instance.get('row_id'))
            col_val = instance.get('column')
            col_id = str(col_val.id if hasattr(col_val, 'id') else instance.get('column_id'))
            created_at = instance.get('created_at')
            updated_at = instance.get('updated_at')
            cell_id = instance.get('id', f"{row_id}_{col_id}")
            return {
                'id': str(cell_id),
                'row_id': row_id,
                'column_id': col_id,
                'value': instance.get('value'),
                'created_at': created_at.isoformat() if hasattr(created_at, 'isoformat') else str(created_at or ''),
                'updated_at': updated_at.isoformat() if hasattr(updated_at, 'isoformat') else str(updated_at or ''),
            }
        return super().to_representation(instance)

# Serilizer for tab view serilizer


class TabViewColumnSerializer(serializers.ModelSerializer):

    class Meta:
        model = Column
        fields = ['id', 'name', 'type', 'options', 'order', 'is_required']
        read_only_fields = ['id']


class TabViewRowSerializer(serializers.ModelSerializer):

    class Meta:
        model = Row
        fields = ['id', 'name', 'order',]
        read_only_fields = ['id', ]


class TableBulkUploadSerializer(serializers.Serializer):
    tabs = serializers.ListField(
        required=False,
        default=list
    )
    rows = serializers.ListField(
        required=False,
        default=list
    )

    def validate(self, attrs):
        tabs = attrs.get('tabs', [])
        rows = attrs.get('rows', [])
        if not tabs and not rows:
            raise serializers.ValidationError(
                "Debe proporcionar al menos una lista no vacía en 'tabs' o 'rows'."
            )
        return attrs

