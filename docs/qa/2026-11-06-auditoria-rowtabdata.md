# Auditoría Integral de Calidad: Migración a RowTabData

- **Fecha:** 2026-11-06
- **Alcance:** Auditoría funcional, contratos de API, seguridad (autenticación, autorización e IDOR), integridad de tipos y regresión tras la migración del modelo EAV `CellValue` hacia `RowTabData`.
- **Entorno:** Local Docker Compose (`tlaix-django-1` con Gunicorn en `http://localhost:8000/`, `tlaix-react-1` con Nginx en `http://localhost/`, PostgreSQL 15 en `tlaix-db-1`).

---

## 1. Resumen Ejecutivo

Se auditó de manera integral la plataforma Tlaix tras la implementación del modelo desnormalizado `RowTabData` con `JSONField` por fila y pestaña (`0013_rowtabdata_migration.py`). La evaluación se realizó mediante peticiones HTTP reales contra los contenedores locales activos, análisis de código estático, validación de suite unitaria (125 tests de backend y 163 tests de frontend) y verificación de directivas de seguridad.

### Estado General
- **Contratos de API:** Cumplidos al 100%. Los endpoints `/api/tables/tabview/<table_id>/<tab_id>/` y `/api/tables/cell/<table_id>/<column_id>/<row_id>/` devuelven la estructura exacta requerida por el frontend y la especificación de `SYSTEM_API_SPECIFICATION.md`.
- **Operaciones CRUD de Celda:** Soporta fluidamente `POST` (201), `GET` (200), `PUT` (200) y `DELETE` (204). El borrado de celda es atómico a nivel de clave en el diccionario `data` de `RowTabData`, preservando intactos los valores de columnas hermanas.
- **Frontend SPA:** Responde `200 OK` en `http://localhost/`, entrega el bundle React compilado sin errores (`index-C-DScxTJ.js`, 508 kB), y la suite de pruebas frontend pasa con 163 tests en verde.
- **Autenticación:** Las rutas protegidas rechazan peticiones sin credenciales respondiendo estrictamente con código HTTP `401 Unauthorized`. La autenticación basada en cookie HTTPOnly `auth_token` opera transparentemente a través del reverse proxy Nginx.

### Principales Riesgos Identificados
Se detectó un hallazgo de severidad **ALTA** de autorización/IDOR en `CellValueViewSet`: el endpoint `GET /api/tables/cell/<table_id>/<column_id>/<row_id>/` permite a cualquier usuario autenticado en el sistema leer valores de celdas de tablas ajenas sobre las que no posee permisos en Django Guardian, debido a que la vista delega en `DjangoModelPermissions` sin verificar permisos de objeto sobre la tabla. Adicionalmente, se identificó una validación permisiva de severidad **MEDIA** en columnas de tipo `select` que no valida el valor contra la lista de opciones (`column.options`).

---

## 2. Matriz de Criterios de Aceptación

| # | Criterio de Aceptación | Estado | Evidencia Clave |
|---|---|---|---|
| 1 | Estructura exacta en `/api/tables/tabview/<table_id>/<tab_id>/` | **CUMPLIDO** | HTTP 200 OK. Entrega `tab`, `pagination`, `columns` y `rows` con diccionario integrado `cells: { column_id: value }`. |
| 2 | CRUD completo en `/api/tables/cell/<table_id>/<column_id>/<row_id>/` y shape `{ id, row_id, column_id, value, updated_at }` | **CUMPLIDO** | HTTP 201 (POST), HTTP 200 (GET), HTTP 200 (PUT), HTTP 204 (DELETE). Shape verificado con campos `id`, `row_id`, `column_id`, `value`, `created_at`, `updated_at`. |
| 3 | SPA frontend en `http://localhost/` responde 200 OK y entrega bundle React | **CUMPLIDO** | HTTP 200 OK. Nginx sirve HTML y assets (`index-C-DScxTJ.js` 508 kB, `index-Bxuix4H4.css` 63.7 kB). Vitest: 163 tests pasando. |
| 4 | Permisos e integridad: accesos no autenticados devuelven 401 | **CUMPLIDO** | HTTP 401 Unauthorized en `/api/tables/`, `/api/tables/tabview/.../` y `/api/tables/cell/.../` al omitir cabecera o cookie. |
| 5 | Documentación de reporte en `docs/qa/2026-11-06-auditoria-rowtabdata.md` | **CUMPLIDO** | Documento generado con detalle de ejecución, reproducción y propuestas de mitigación. |

---

## 3. Evidencia de Pruebas Funcionales y Contratos

### 3.1 Endpoint `TabView` (`/api/tables/tabview/<table_id>/<tab_id>/`)

Petición HTTP autenticada vía cookie `auth_token`:
```bash
curl.exe -i -s -b "auth_token=[ENMASCARADO]" \
  http://localhost/api/tables/tabview/ce1ddf2b-73d5-463c-81fa-280c7744a730/00a114fd-4755-4525-969d-65cfa9bc92d2/?row_limit=2
```

Respuesta obtenida:
```http
HTTP/1.1 200 OK
Server: nginx/1.30.6
Content-Type: application/json
Vary: Accept, origin
Allow: GET, HEAD, OPTIONS
```
```json
{
  "tab": {
    "id": "00a114fd-4755-4525-969d-65cfa9bc92d2",
    "table": "ce1ddf2b-73d5-463c-81fa-280c7744a730",
    "name": "Asistencia",
    "label": "Asistencia",
    "order": 0
  },
  "pagination": {
    "total_rows": 688,
    "row_limit": 2,
    "row_offset": 0,
    "has_more_rows": true,
    "total_columns": 21,
    "col_limit": 100,
    "col_offset": 0,
    "has_more_columns": false
  },
  "columns": [
    {
      "id": "e852932e-e9d2-4811-88dd-e8799a049d99",
      "name": "2026-05-13_asistencia",
      "type": "checkbox",
      "options": null,
      "order": 0,
      "is_required": false
    },
    {
      "id": "4582d673-3119-42bd-9d2b-71d9839741bb",
      "name": "2026-05-13_hora",
      "type": "text",
      "options": null,
      "order": 0,
      "is_required": false
    }
  ],
  "rows": [
    {
      "id": "6b21f4b3-de63-42b6-ac42-84434aa4744f",
      "name": "LUZ JANET TAPIA BLANCARTE (00012545)",
      "order": 0,
      "cells": {
        "e852932e-e9d2-4811-88dd-e8799a049d99": false,
        "4582d673-3119-42bd-9d2b-71d9839741bb": null
      }
    }
  ]
}
```

### 3.2 Endpoint de Celda Individual (`/api/tables/cell/<table_id>/<column_id>/<row_id>/`)

#### A. Creación de Celda (POST)
- **URL:** `POST /api/tables/cell/ce1ddf2b-73d5-463c-81fa-280c7744a730/4582d673-3119-42bd-9d2b-71d9839741bb/6b21f4b3-de63-42b6-ac42-84434aa4744f/`
- **Payload:** `{"value": "08:30 AM"}`
- **Respuesta:** `HTTP/1.1 201 Created`
```json
{
  "id": "f51200ad-8ab0-42db-a7cd-8a2d67647297:4582d673-3119-42bd-9d2b-71d9839741bb",
  "row_id": "6b21f4b3-de63-42b6-ac42-84434aa4744f",
  "column_id": "4582d673-3119-42bd-9d2b-71d9839741bb",
  "value": "08:30 AM",
  "created_at": "2026-11-07T02:03:16.675510+00:00",
  "updated_at": "2026-11-07T02:37:48.438134+00:00"
}
```

#### B. Lectura de Celda (GET)
- **URL:** `GET /api/tables/cell/ce1ddf2b-73d5-463c-81fa-280c7744a730/4582d673-3119-42bd-9d2b-71d9839741bb/6b21f4b3-de63-42b6-ac42-84434aa4744f/`
- **Respuesta:** `HTTP/1.1 200 OK`
- **Cuerpo:** Mantiene shape exacto `{ id, row_id, column_id, value, created_at, updated_at }`.

#### C. Actualización de Celda (PUT)
- **URL:** `PUT /api/tables/cell/ce1ddf2b-73d5-463c-81fa-280c7744a730/4582d673-3119-42bd-9d2b-71d9839741bb/6b21f4b3-de63-42b6-ac42-84434aa4744f/`
- **Payload:** `{"value": "09:15 AM"}`
- **Respuesta:** `HTTP/1.1 200 OK`
```json
{
  "id": "f51200ad-8ab0-42db-a7cd-8a2d67647297:4582d673-3119-42bd-9d2b-71d9839741bb",
  "row_id": "6b21f4b3-de63-42b6-ac42-84434aa4744f",
  "column_id": "4582d673-3119-42bd-9d2b-71d9839741bb",
  "value": "09:15 AM",
  "created_at": "2026-11-07T02:03:16.675510+00:00",
  "updated_at": "2026-11-07T02:37:58.104416+00:00"
}
```

#### D. Eliminación Atómica de Celda (DELETE)
- **URL:** `DELETE /api/tables/cell/ce1ddf2b-73d5-463c-81fa-280c7744a730/4582d673-3119-42bd-9d2b-71d9839741bb/6b21f4b3-de63-42b6-ac42-84434aa4744f/`
- **Respuesta:** `HTTP/1.1 204 No Content`
- **Verificación 1:** GET a la celda eliminada responde `HTTP 404 Not Found` (`{"error":"CellValue not found for the given row and column"}`).
- **Verificación 2:** GET a la columna vecina (`e852932e-e9d2-4811-88dd-e8799a049d99`) de la misma fila responde `HTTP 200 OK` preservando su valor `false` en `RowTabData`.

### 3.3 Validación de Tipos de Columna

Se ejecutó una batería de pruebas de inserción y actualización sobre una fila controlada para todos los tipos de datos soportados:

| Tipo | Payload Probado | Status HTTP Real | Resultado |
|---|---|---|---|
| `int` | `{"value": 42}` | `200 OK` | Aceptado como entero `42` |
| `int` | `{"value": "not_an_int"}` | `400 Bad Request` | Rechazado con mensaje descriptivo |
| `float` | `{"value": 9.75}` | `200 OK` | Aceptado como decimal `9.75` |
| `float` | `{"value": "not_a_float"}` | `400 Bad Request` | Rechazado con mensaje descriptivo |
| `checkbox` | `{"value": true}` | `200 OK` | Aceptado como booleano `True` |
| `checkbox` | `{"value": "no_bool"}` | `400 Bad Request` | Rechazado con mensaje descriptivo |
| `date` | `{"value": "2026-11-06"}` | `200 OK` | Aceptado formato ISO YYYY-MM-DD |
| `date` | `{"value": "fecha_invalida"}` | `400 Bad Request` | Rechazado con formato incorrecto |
| `text` | `{"value": "Texto QA"}` | `200 OK` | Aceptado como cadena |
| `select` | `{"value": "eq1"}` (opción válida) | `200 OK` | Aceptado |
| `select` | `{"value": "opcion_invalida"}` | `200 OK` *(Anomalía)* | Almacenado sin validar contra `options` (Ver Hallazgo 2) |

---

## 4. Hallazgos de Calidad y Seguridad

### ALTO — H-1 · Exposición de datos por omisión de permisos por objeto (IDOR / BOLA) en `CellValueViewSet.retrieve`

- **Archivo/líneas:** `backend/api/views.py:341-400`
- **Descripción y causa raíz:** La vista `CellValueViewSet` declara `permission_classes = [IsAuthenticated, DjangoModelPermissions]`. En DRF, `DjangoModelPermissions` no impone restricciones sobre métodos seguros (`GET`, `HEAD`, `OPTIONS`). En los métodos `list` y `retrieve`, la vista recupera la tabla, columna y fila mediante `get_object_or_404(Table, id=table_id)` directamente contra el queryset global de Django, **sin** verificar los permisos de objeto guardian del usuario (`self.check_object_permissions(request, table)`). Como consecuencia, cualquier usuario autenticado en la plataforma puede consultar el valor de celdas de cualquier tabla, incluso cuando no tiene ningún permiso asignado sobre la misma.
- **Pasos de reproducción:**
  1. Identificar un usuario sin permisos asignados sobre una tabla (ej. usuario `test_user_perm` con `get_all_permissions() == set()`).
  2. Generar o utilizar su token de autenticación.
  3. Ejecutar una petición HTTP GET directa a una celda de una tabla ajena:
     ```bash
     curl.exe -i -s -H "Authorization: Token [TOKEN_TEST_USER_PERM]" \
       http://localhost:8000/api/tables/cell/ce1ddf2b-73d5-463c-81fa-280c7744a730/e852932e-e9d2-4811-88dd-e8799a049d99/6b21f4b3-de63-42b6-ac42-84434aa4744f/
     ```
  4. Observar la respuesta.
- **Evidencia:**
  - `GET /api/tables/ce1ddf2b-.../` responde `404 Not Found` (ocultado por guardian).
  - `GET /api/tables/tabview/ce1ddf2b-.../.../` responde `403 Forbidden` (`{"detail":"You do not have permission to perform this action."}`).
  - `GET /api/tables/cell/ce1ddf2b-.../.../.../` responde **`200 OK`** y expone el valor de la celda:
    ```json
    {"id":"f51200ad-8ab0-42db-a7cd-8a2d67647297:e852932e-e9d2-4811-88dd-e8799a049d99","row_id":"6b21f4b3-de63-42b6-ac42-84434aa4744f","column_id":"e852932e-e9d2-4811-88dd-e8799a049d99","value":false,"created_at":"2026-11-07T02:03:16.675510+00:00","updated_at":"2026-11-07T02:38:11.444467+00:00"}
    ```
- **Impacto:** Fuga de información confidencial y violación de aislamiento entre organizaciones o usuarios (Broken Object Level Authorization / IDOR).
- **Propuesta de corrección:**
  Configurar en `CellValueViewSet` la clase de permisos `CompleteDjangoObjectPermissions` y validar explícitamente los permisos sobre la tabla y la pestaña en todos los métodos de acción:
  ```python
  # backend/api/views.py en CellValueViewSet
  permission_classes = [IsAuthenticated, CompleteDjangoObjectPermissions]

  # En list, retrieve, create, update, destroy:
  table = get_object_or_404(Table, id=table_id)
  self.check_object_permissions(request, table)
  column = get_object_or_404(Column, id=column_id, tab__table=table)
  self.check_object_permissions(request, column.tab)
  ```
- **Agente responsable:** `backend`

---

### MEDIO — H-2 · Ausencia de validación de pertenencia en columnas tipo `select`

- **Archivo/líneas:** `backend/api/models.py:194-197`
- **Descripción y causa raíz:** En la función de saneamiento `validate_and_format_cell_value`, cuando el tipo de columna es `select`, únicamente se comprueba que el tipo de dato en Python sea cadena, lista o diccionario:
  ```python
  elif column_type == 'select':
      if not isinstance(value, (str, list, dict)):
          raise ValueError("A string, list or dict value is required for this column.")
      return value
  ```
  No se comprueba si el valor proporcionado pertenece al listado `column.options`.
- **Pasos de reproducción:**
  1. Tomar una columna tipo `select` con opciones definidas (por ejemplo columna `Proyecto` con `options: ['eq1', 'eq2']`).
  2. Enviar mediante `PUT` o `POST` un valor arbitrario que no exista en la lista (ej. `{"value": "opcion_invalida"}`).
- **Evidencia:**
  La API devuelve `HTTP 200 OK` y persiste `"opcion_invalida"` en el `JSONField` de `RowTabData`.
- **Impacto:** Pérdida de integridad en datos tabulares y estados inconsistentes en filtros o selectores del frontend.
- **Propuesta de corrección:**
  Verificar la existencia en `column.options` cuando dicha propiedad esté configurada:
  ```python
  elif column_type == 'select':
      if not isinstance(value, (str, list, dict)):
          raise ValueError("A string, list or dict value is required for this column.")
      options = getattr(column, 'options', None)
      if options and isinstance(options, list) and value not in options:
          raise ValueError(f"Value '{value}' is not a valid option.")
      return value
  ```
- **Agente responsable:** `backend`

---

### INFORMATIVO — H-3 · Discrepancia en documentación canónica y código comentado residual

- **Archivo/líneas:**
  - `SYSTEM_API_SPECIFICATION.md:637`
  - `backend/personal/views.py:120-125`
- **Descripción:**
  - En `SYSTEM_API_SPECIFICATION.md` línea 637, la descripción del endpoint de filas aún menciona: `"crea/actualiza los registros en CellValue"`, a pesar de que la arquitectura opera en su totalidad sobre `RowTabData`.
  - En `backend/personal/views.py` líneas 120-125, persisten líneas comentadas que instanciaban el modelo deprecado `CellValue` (`# cell_lugar, created = CellValue.objects.get_or_create(...)`).
- **Impacto:** Confusión para futuros mantenedores e inconsistencia documental.
- **Propuesta de corrección:**
  Actualizar la redacción en `SYSTEM_API_SPECIFICATION.md` hacia `RowTabData` y remover el bloque comentado en `personal/views.py`.
- **Agente responsable:** `backend`

---

## 5. Cobertura de la Auditoría

- **Revisado:**
  - Contenedores Docker activos: `tlaix-django-1`, `tlaix-react-1`, `tlaix-db-1`.
  - Endpoints HTTP inspeccionados en vivo:
    - `GET /` (SPA bundle)
    - `GET /assets/index-C-DScxTJ.js` (React bundle estático)
    - `GET /api/tables/` (Autenticación e integridad)
    - `GET /api/tables/tabview/<table_id>/<tab_id>/` (Estructura, paginación, celdas)
    - `POST /api/tables/cell/<table_id>/<column_id>/<row_id>/` (Creación)
    - `GET /api/tables/cell/<table_id>/<column_id>/<row_id>/` (Lectura y shape de respuesta)
    - `PUT /api/tables/cell/<table_id>/<column_id>/<row_id>/` (Actualización)
    - `DELETE /api/tables/cell/<table_id>/<column_id>/<row_id>/` (Borrado atómico)
  - Control de acceso por objeto con Django Guardian en tablas y vistas satélite.
  - Validación de tipos de datos (`int`, `float`, `checkbox`, `date`, `select`, `text`).
  - Suite de tests unitarios: 125 tests de backend (`api`, `asistencia`, `students`, `personal`) y 163 tests de frontend (`vitest`).
  - Build de producción del frontend (`npm run build`).

- **No revisado (Fuera de alcance):**
  - Carga masiva concurrente de alto estrés (>100,000 registros simultáneos en una sola petición).
  - Pruebas en navegadores móviles nativos iOS/Android.

---

## 6. Casos de Prueba Sugeridos para la Suite de QA

Para prevenir regresiones al implementar las correcciones propuestas, se sugiere añadir a la suite de tests (`backend/api/tests.py`):

1. **`test_cell_viewset_enforces_guardian_table_permissions`**:
   - Crear un usuario autenticado `user_sin_permisos`.
   - Intentar `GET /api/tables/cell/<table_id>/<column_id>/<row_id>/` sobre una tabla ajena.
   - Aserción esperada: `HTTP 403 Forbidden` (o `404 Not Found`).

2. **`test_cell_validation_select_invalid_option_raises_400`**:
   - Crear columna tipo `select` con `options=['A', 'B']`.
   - Intentar `PUT /api/tables/cell/.../` con payload `{"value": "C"}`.
   - Aserción esperada: `HTTP 400 Bad Request` con mensaje de opción inválida.

---

## 7. Riesgos Residuales y Priorización

1. **Prioridad 1 (Inmediata - `backend`):** Corregir la verificación de permisos guardian en `CellValueViewSet` para mitigar la fuga de datos por IDOR (`H-1`).
2. **Prioridad 2 (Próximo sprint - `backend`):** Implementar validación estricta de opciones en columnas `select` (`H-2`).
3. **Prioridad 3 (Mantenimiento - `backend`):** Limpiar código muerto en `personal/views.py` y sincronizar texto residual en `SYSTEM_API_SPECIFICATION.md` (`H-3`).

---

## 8. Veredicto Final

**APROBADA CON OBSERVACIONES DE SEGURIDAD (APROBADA CONDICIONADA A CORRECCIÓN DE H-1)**

La migración a `RowTabData` ha sido exitosa en términos de estabilidad funcional, preservación del contrato público hacia el frontend y reducción drástica de complejidad de persistencia EAV. Sin embargo, no debe darse por concluido el ciclo de seguridad hasta aplicar la validación de permisos de objeto guardian en `CellValueViewSet`.
