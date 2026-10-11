import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, Database, Link as LinkIcon } from "lucide-react";

const ApiDocumentation = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Database className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Documentación API
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Especificaciones completas de los endpoints que debe implementar tu API backend (Django/MySQL)
          </p>
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Configuración Base
            </CardTitle>
            <CardDescription>URL base de tu API Django</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg font-mono text-sm">
              <div className="text-muted-foreground mb-2">Variable de entorno:</div>
              <code className="text-primary">VITE_API_URL=http://localhost:8000/api</code>
              <div className="mt-4 text-xs text-muted-foreground">
                Crea un archivo .env.local en la raíz del proyecto con esta variable
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="architecture" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="architecture">Arquitectura Django</TabsTrigger>
            <TabsTrigger value="tables">Tablas</TabsTrigger>
            <TabsTrigger value="rows">Filas</TabsTrigger>
            <TabsTrigger value="columns">Columnas</TabsTrigger>
            <TabsTrigger value="tabs">Pestañas</TabsTrigger>
          </TabsList>

          <TabsContent value="architecture" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Arquitectura del Sistema</CardTitle>
                <CardDescription>Diagrama de la arquitectura completa Frontend + Django + MySQL</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted p-6 rounded-lg">
                  <pre className="text-sm">
{`┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                  │
│  - Componentes de UI (Tablas, Diálogos, Formularios)       │
│  - API Service Layer (api-service.ts)                      │
│  - Gestión de Estado (React State/TanStack Query)          │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST
                       │ (JSON)
┌──────────────────────▼──────────────────────────────────────┐
│                  DJANGO REST API                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │  urls.py - Enrutamiento de endpoints              │    │
│  │  views.py / viewsets.py - Lógica de negocio       │    │
│  │  serializers.py - Validación y transformación     │    │
│  │  models.py - Definición de modelos ORM            │    │
│  └────────────────────┬───────────────────────────────┘    │
└────────────────────────┼──────────────────────────────────┘
                        │ Django ORM
                        │ (SQL Queries)
┌────────────────────────▼──────────────────────────────────┐
│                   MYSQL DATABASE                          │
│  - tables (tablas principales)                           │
│  - columns (columnas/campos)                             │
│  - rows (filas/registros)                                │
│  - tabs (pestañas/vistas)                                │
└──────────────────────────────────────────────────────────┘`}
                  </pre>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">1. Estructura del Proyecto Django</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`mi_proyecto/
├── manage.py
├── config/
│   ├── __init__.py
│   ├── settings.py      # Configuración principal
│   ├── urls.py          # URLs raíz
│   └── wsgi.py
└── api/
    ├── __init__.py
    ├── models.py        # Modelos de DB
    ├── serializers.py   # Serializadores DRF
    ├── views.py         # ViewSets/Vistas
    ├── urls.py          # URLs de la API
    └── admin.py         # Panel admin Django`}
                  </pre>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">2. Instalación y Configuración Inicial</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`# Instalar dependencias
pip install django djangorestframework mysqlclient django-cors-headers

# Crear proyecto
django-admin startproject config .
python manage.py startapp api

# En config/settings.py agregar:
INSTALLED_APPS = [
    # ... apps por defecto
    'rest_framework',
    'corsheaders',
    'api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Al inicio
    # ... middleware existente
]

# CORS - Permitir frontend local
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:3000",
]

# Configuración MySQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'nombre_base_datos',
        'USER': 'usuario_mysql',
        'PASSWORD': 'contraseña',
        'HOST': 'localhost',
        'PORT': '3306',
    }
}`}
                  </pre>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">3. Modelos Django (api/models.py)</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`from django.db import models
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
        ('date', 'Date'),
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
        ordering = ['order']`}
                  </pre>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">4. Serializers (api/serializers.py)</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`from rest_framework import serializers
from .models import Table, Column, Row, Tab

class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = ['id', 'name', 'description', 'icon', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class ColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = ['id', 'table_id', 'name', 'type', 'options', 'order']
        read_only_fields = ['id']

class RowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Row
        fields = ['id', 'table_id', 'name', 'data', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

class TabSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tab
        fields = ['id', 'table_id', 'name', 'label', 'order']
        read_only_fields = ['id']`}
                  </pre>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">5. ViewSets (api/views.py)</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Table, Column, Row, Tab
from .serializers import TableSerializer, ColumnSerializer, RowSerializer, TabSerializer

class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    serializer_class = TableSerializer
    
    @action(detail=True, methods=['get'])
    def columns(self, request, pk=None):
        table = self.get_object()
        columns = table.columns.all()
        serializer = ColumnSerializer(columns, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def rows(self, request, pk=None):
        table = self.get_object()
        rows = table.rows.all()
        serializer = RowSerializer(rows, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def tabs(self, request, pk=None):
        table = self.get_object()
        tabs = table.tabs.all()
        serializer = TabSerializer(tabs, many=True)
        return Response(serializer.data)

class ColumnViewSet(viewsets.ModelViewSet):
    queryset = Column.objects.all()
    serializer_class = ColumnSerializer

class RowViewSet(viewsets.ModelViewSet):
    queryset = Row.objects.all()
    serializer_class = RowSerializer

class TabViewSet(viewsets.ModelViewSet):
    queryset = Tab.objects.all()
    serializer_class = TabSerializer`}
                  </pre>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">6. URLs (config/urls.py y api/urls.py)</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`# config/urls.py
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]

# api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TableViewSet, ColumnViewSet, RowViewSet, TabViewSet

router = DefaultRouter()
router.register(r'tables', TableViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('tables/<str:table_id>/columns', 
         ColumnViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/columns/<str:pk>', 
         ColumnViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
    path('tables/<str:table_id>/rows', 
         RowViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/rows/<str:pk>', 
         RowViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
    path('tables/<str:table_id>/tabs', 
         TabViewSet.as_view({'get': 'list', 'post': 'create'})),
    path('tables/<str:table_id>/tabs/<str:pk>', 
         TabViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
]`}
                  </pre>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">7. Comandos de Despliegue</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`# Crear migraciones
python manage.py makemigrations

# Aplicar migraciones a MySQL
python manage.py migrate

# Crear superusuario para admin
python manage.py createsuperuser

# Ejecutar servidor de desarrollo
python manage.py runserver 8000

# El API estará disponible en:
# http://localhost:8000/api/tables
# http://localhost:8000/api/tables/1/columns
# etc.`}
                  </pre>
                </div>

                <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Próximos Pasos
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li>✅ 1. Instalar Django y dependencias</li>
                    <li>✅ 2. Crear proyecto y configurar settings.py</li>
                    <li>✅ 3. Definir modelos en models.py</li>
                    <li>✅ 4. Crear serializers y viewsets</li>
                    <li>✅ 5. Configurar URLs</li>
                    <li>✅ 6. Ejecutar migraciones</li>
                    <li>✅ 7. Configurar VITE_API_URL en .env.local del frontend</li>
                    <li>✅ 8. Probar endpoints con Postman o desde el frontend</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tables" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Endpoints de Tablas</CardTitle>
                <CardDescription>Gestión de tablas principales</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Método</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Body/Params</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/tables</code></TableCell>
                      <TableCell>Listar todas las tablas</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/tables/:id</code></TableCell>
                      <TableCell>Obtener una tabla específica</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="secondary">POST</Badge></TableCell>
                      <TableCell><code>/tables</code></TableCell>
                      <TableCell>Crear nueva tabla</TableCell>
                      <TableCell>
                        <pre className="text-xs bg-muted p-2 rounded mt-2">
{`{
  "name": "string",
  "description": "string",
  "icon": "string"
}`}
                        </pre>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="outline">PUT</Badge></TableCell>
                      <TableCell><code>/tables/:id</code></TableCell>
                      <TableCell>Actualizar tabla</TableCell>
                      <TableCell>Campos parciales de tabla</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="destructive">DELETE</Badge></TableCell>
                      <TableCell><code>/tables/:id</code></TableCell>
                      <TableCell>Eliminar tabla</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="mt-6 space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Respuesta de ejemplo (GET /tables)
                  </h4>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`[
  {
    "id": "1",
    "name": "Inventario",
    "description": "Control de productos",
    "icon": "Package",
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z"
  }
]`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rows" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Endpoints de Filas</CardTitle>
                <CardDescription>Gestión de filas dentro de cada tabla</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Método</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Body/Params</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/rows</code></TableCell>
                      <TableCell>Listar filas de una tabla</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="secondary">POST</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/rows</code></TableCell>
                      <TableCell>Crear nueva fila</TableCell>
                      <TableCell>
                        <pre className="text-xs bg-muted p-2 rounded mt-2">
{`{
  "name": "string",
  "data": {
    "campo1": "valor",
    "campo2": true,
    "campo3": 123
  }
}`}
                        </pre>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="outline">PUT</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/rows/:rowId</code></TableCell>
                      <TableCell>Actualizar fila</TableCell>
                      <TableCell>Campos parciales de fila</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="destructive">DELETE</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/rows/:rowId</code></TableCell>
                      <TableCell>Eliminar fila</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="mt-6 space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Respuesta de ejemplo (GET /tables/1/rows)
                  </h4>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`[
  {
    "id": "row-1",
    "table_id": "1",
    "name": "Producto A",
    "data": {
      "completed": false,
      "priority": true,
      "stock": 100,
      "price": 29.99
    },
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z"
  }
]`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="columns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Endpoints de Columnas</CardTitle>
                <CardDescription>Gestión de columnas/campos de las tablas</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Método</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Body/Params</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/columns</code></TableCell>
                      <TableCell>Listar columnas de una tabla</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="secondary">POST</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/columns</code></TableCell>
                      <TableCell>Crear nueva columna</TableCell>
                      <TableCell>
                        <pre className="text-xs bg-muted p-2 rounded mt-2">
{`{
  "name": "string",
  "type": "text|checkbox|int|float|select",
  "options": ["opt1", "opt2"],
  "order": 0
}`}
                        </pre>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="outline">PUT</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/columns/:columnId</code></TableCell>
                      <TableCell>Actualizar columna</TableCell>
                      <TableCell>Campos parciales de columna</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="destructive">DELETE</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/columns/:columnId</code></TableCell>
                      <TableCell>Eliminar columna</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="mt-6 space-y-4">
                  <h4 className="font-semibold">Tipos de Columnas Soportados</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted p-3 rounded">
                      <Badge className="mb-2">text</Badge>
                      <p className="text-xs text-muted-foreground">Campo de texto libre</p>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <Badge className="mb-2">checkbox</Badge>
                      <p className="text-xs text-muted-foreground">Valor booleano (true/false)</p>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <Badge className="mb-2">int</Badge>
                      <p className="text-xs text-muted-foreground">Número entero</p>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <Badge className="mb-2">float</Badge>
                      <p className="text-xs text-muted-foreground">Número decimal</p>
                    </div>
                    <div className="bg-muted p-3 rounded col-span-2">
                      <Badge className="mb-2">select</Badge>
                      <p className="text-xs text-muted-foreground">Lista desplegable (requiere campo "options")</p>
                    </div>
                  </div>

                  <h4 className="font-semibold flex items-center gap-2 mt-6">
                    <Code className="w-4 h-4" />
                    Respuesta de ejemplo (GET /tables/1/columns)
                  </h4>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`[
  {
    "id": "col-1",
    "table_id": "1",
    "name": "Completado",
    "type": "checkbox",
    "order": 0
  },
  {
    "id": "col-2",
    "table_id": "1",
    "name": "Estado",
    "type": "select",
    "options": ["Pendiente", "En Proceso", "Completado"],
    "order": 1
  }
]`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tabs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Endpoints de Pestañas</CardTitle>
                <CardDescription>Gestión de pestañas/vistas dentro de cada tabla</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Método</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Body/Params</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><Badge>GET</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/tabs</code></TableCell>
                      <TableCell>Listar pestañas de una tabla</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="secondary">POST</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/tabs</code></TableCell>
                      <TableCell>Crear nueva pestaña</TableCell>
                      <TableCell>
                        <pre className="text-xs bg-muted p-2 rounded mt-2">
{`{
  "name": "string",
  "label": "string",
  "order": 0
}`}
                        </pre>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="outline">PUT</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/tabs/:tabId</code></TableCell>
                      <TableCell>Actualizar pestaña</TableCell>
                      <TableCell>Campos parciales de pestaña</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="destructive">DELETE</Badge></TableCell>
                      <TableCell><code>/tables/:tableId/tabs/:tabId</code></TableCell>
                      <TableCell>Eliminar pestaña</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="mt-6 space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Respuesta de ejemplo (GET /tables/1/tabs)
                  </h4>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
{`[
  {
    "id": "tab-1",
    "table_id": "1",
    "name": "all",
    "label": "Todos",
    "order": 0
  },
  {
    "id": "tab-2",
    "table_id": "1",
    "name": "active",
    "label": "Activos",
    "order": 1
  }
]`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Modelo de Base de Datos Sugerido (MySQL)</CardTitle>
            <CardDescription>Estructura de tablas recomendada para Django</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-background p-4 rounded-lg text-sm overflow-auto">
{`-- Tabla: tables
CREATE TABLE tables (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla: columns
CREATE TABLE columns (
    id VARCHAR(50) PRIMARY KEY,
    table_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('text', 'checkbox', 'int', 'float', 'select') NOT NULL,
    options JSON,
    \`order\` INT DEFAULT 0,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
);

-- Tabla: rows
CREATE TABLE rows (
    id VARCHAR(50) PRIMARY KEY,
    table_id VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
);

-- Tabla: tabs
CREATE TABLE tabs (
    id VARCHAR(50) PRIMARY KEY,
    table_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    label VARCHAR(100) NOT NULL,
    \`order\` INT DEFAULT 0,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
);`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ApiDocumentation;
