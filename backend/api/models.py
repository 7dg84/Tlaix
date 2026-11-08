from django.db import models
import uuid
import datetime

class Table(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tables'
        
    def __str__(self):
        return self.name

class Tab(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='tabs')
    name = models.CharField(max_length=100)
    label = models.CharField(max_length=100)
    order = models.IntegerField(default=0)
    
    class Meta:
        db_table = 'tabs'
        ordering = ['order']
        unique_together = [['table', 'name']]  # The tab name must be unique within the same table
        
    def __str__(self):
        return self.label

class Column(models.Model):
    COLUMN_TYPES = [
        ('text', 'Text'),
        ('checkbox', 'Checkbox'),
        ('int', 'Integer'),
        ('float', 'Float'),
        ('select', 'Select'),
        ('date', 'Date'),
    ]
    
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    tab = models.ForeignKey(Tab, on_delete=models.CASCADE, related_name='columns')
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=20, choices=COLUMN_TYPES, blank=False, null=False)
    options = models.JSONField(blank=True, null=True) # TODO: paque sirve
    order = models.IntegerField(default=0)
    is_required = models.BooleanField(default=False) # TODO: pa que sirve
    
    class Meta:
        db_table = 'columns'
        ordering = ['order']
        unique_together = [['tab', 'name']]  # The column name must be unique within the same tab
    
    @property
    def table(self):
        return self.tab.table
    
    def __str__(self):
        return self.name

class Row(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='rows')
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True) # TODO: revisar si es necesario
    
    class Meta:
        db_table = 'rows'
        ordering = ['order']
        
    def __str__(self):
        return self.name

class RowTabData(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    row = models.ForeignKey(Row, on_delete=models.CASCADE, related_name='tab_data')
    tab = models.ForeignKey(Tab, on_delete=models.CASCADE, related_name='row_data')
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'row_tab_data'
        unique_together = [['row', 'tab']]

    def __str__(self):
        return f"RowTabData(row={self.row_id}, tab={self.tab_id})"


class CellValue(models.Model):
    """
    DEPRECATED: Retenido temporalmente en la base de datos para el patron Expand & Contract (Fase Expand).
    Sera eliminado en una migracion posterior (Fase Contract).
    La aplicacion opera exclusivamente sobre RowTabData.
    """
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    row = models.ForeignKey(Row, on_delete=models.CASCADE, related_name='cells')
    column = models.ForeignKey(Column, on_delete=models.CASCADE, related_name='cells')
    value_text = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_float = models.FloatField(blank=True, null=True)
    value_bool = models.BooleanField(default=False, null=True)
    value_json = models.JSONField(blank=True, null=True)
    value_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cell_values'
        unique_together = [['row', 'column']]
        indexes = [
            models.Index(fields=['row', 'column']),
            models.Index(fields=['column']),
        ]

    def __str__(self):
        return f"CellValue(row={self.row_id}, col={self.column_id})"

    def get_value(self):
        """Retorna el valor segun el tipo de columna"""
        column_type = self.column.type
        if column_type == 'text':
            return self.value_text
        elif column_type == 'int':
            return self.value_int
        elif column_type == 'float':
            return self.value_float
        elif column_type == 'checkbox':
            return self.value_bool
        elif column_type == 'select':
            return self.value_json or self.value_text
        elif column_type == 'date':
            return self.value_date.isoformat() if self.value_date else None
        return None

    def set_value(self, value):
        """Asigna el valor segun el tipo de columna"""
        column_type = self.column.type
        if column_type == 'text':
            self.value_text = str(value) if value is not None else None
        elif column_type == 'int':
            self.value_int = int(value) if value is not None else None
        elif column_type == 'float':
            self.value_float = float(value) if value is not None else None
        elif column_type == 'checkbox':
            self.value_bool = bool(value) if value is not None else None
        elif column_type == 'select':
            if isinstance(value, (list, dict)):
                self.value_json = value
            else:
                self.value_text = str(value) if value is not None else None
        elif column_type == 'date':
            if value is None or value == '':
                self.value_date = None
            elif isinstance(value, datetime.date) and not isinstance(value, datetime.datetime):
                self.value_date = value
            elif isinstance(value, datetime.datetime):
                self.value_date = value.date()
            elif isinstance(value, str):
                self.value_date = datetime.date.fromisoformat(value[:10])


def validate_and_format_cell_value(column, value):
    """
    Valida y formatea el valor de una celda según el tipo de columna.
    Lanza ValueError si el valor no es compatible.
    """
    if value is None:
        return None

    column_type = column.type if hasattr(column, 'type') else str(column)

    if column_type == 'text':
        if not isinstance(value, str):
            raise ValueError("A string value is required for this column.")
        return value
    elif column_type == 'checkbox':
        if not isinstance(value, bool):
            raise ValueError("A boolean value is required for this column.")
        return value
    elif column_type == 'int':
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("A numeric value is required for this column.")
        return int(value)
    elif column_type == 'float':
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("A numeric value is required for this column.")
        return float(value)
    elif column_type == 'select':
        if not isinstance(value, (str, list, dict)):
            raise ValueError("A string, list or dict value is required for this column.")
        options = getattr(column, 'options', None)
        if options and isinstance(options, list):
            allowed = set()
            for opt in options:
                if isinstance(opt, dict):
                    if 'value' in opt:
                        allowed.add(str(opt['value']))
                    if 'id' in opt:
                        allowed.add(str(opt['id']))
                else:
                    allowed.add(str(opt))

            if isinstance(value, str):
                if value not in options and str(value) not in allowed:
                    raise ValueError(f"Valor '{value}' no es una opción válida para la columna select.")
            elif isinstance(value, list):
                for item in value:
                    if item not in options and str(item) not in allowed:
                        raise ValueError(f"Valor '{item}' no es una opción válida para la columna select.")
            elif isinstance(value, dict):
                pass
            elif str(value) not in allowed:
                raise ValueError(f"Valor '{value}' no es una opción válida para la columna select.")
        return value
    elif column_type == 'date':
        if not isinstance(value, (datetime.date, datetime.datetime, str)):
            raise ValueError("A valid date string (YYYY-MM-DD) or date is required for this column.")
        if isinstance(value, datetime.datetime):
            return value.date().isoformat()
        if isinstance(value, datetime.date):
            return value.isoformat()
        if isinstance(value, str):
            if value == '':
                return None
            try:
                parsed = datetime.date.fromisoformat(value[:10])
                return parsed.isoformat()
            except (ValueError, TypeError):
                raise ValueError("Date has wrong format. Use YYYY-MM-DD format.")
    return value
