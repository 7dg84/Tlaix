from django.db import models
import uuid

class Table(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tables'
    
    def __str__(self):
        return self.name

class Column(models.Model):
    COLUMN_TYPES = [
        ('text', 'Text'),
        ('checkbox', 'Checkbox'),
        ('int', 'Integer'),
        ('float', 'Float'),
        ('select', 'Select'),
    ]
    
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='columns')
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=20, choices=COLUMN_TYPES)
    options = models.JSONField(blank=True, null=True)
    order = models.IntegerField(default=0)
    
    class Meta:
        db_table = 'columns'
        ordering = ['order']

class Row(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='rows')
    name = models.CharField(max_length=200)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'rows'

class Tab(models.Model):
    id = models.CharField(max_length=50, primary_key=True, default=uuid.uuid4)
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='tabs')
    name = models.CharField(max_length=100)
    label = models.CharField(max_length=100)
    order = models.IntegerField(default=0)
    
    class Meta:
        db_table = 'tabs'
        ordering = ['order']
