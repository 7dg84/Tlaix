from django.db import models
import uuid

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

class CellValue(models.Model):
    """
    Almacena el valor de cada celda de forma normalizada.
    Cada celda es la intersección de una Row y una Column.
    """
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    row = models.ForeignKey(Row, on_delete=models.CASCADE, related_name='cells')
    column = models.ForeignKey(Column, on_delete=models.CASCADE, related_name='cells')
    
    # Campos para diferentes tipos de datos
    value_text = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_float = models.FloatField(blank=True, null=True)
    value_bool = models.BooleanField(default=False, null=True)
    value_json = models.JSONField(blank=True, null=True)  # Para selects múltiples u otros
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'cell_values'
        unique_together = [['row', 'column']]  # Una celda por combinación row-column
        indexes = [
            models.Index(fields=['row', 'column']),
            models.Index(fields=['column']),
        ]
    
    def get_value(self):
        """Retorna el valor según el tipo de columna"""
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
        return None
    
    def set_value(self, value):
        """Asigna el valor según el tipo de columna"""
        column_type = self.column.type
        if column_type == 'text':
            self.value_text = str(value) if value is not None else None
        elif column_type == 'int':
            self.value_int = int(value) if value is not None else None
        elif column_type == 'float':
            self.value_float = float(value) if value is not None else None
        elif column_type == 'checkbox':
            self.value_bool = bool(value)
        elif column_type == 'select':
            if isinstance(value, (list, dict)):
                self.value_json = value
            else:
                self.value_text = str(value) if value is not None else None