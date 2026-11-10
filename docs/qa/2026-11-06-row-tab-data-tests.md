# QA Backend: Validación y Cobertura de Tests para Migración a `RowTabData`

- **Fecha:** 2026-11-06
- **Agente:** `test-writer`
- **Contexto:** Migración de modelo EAV `CellValue` hacia JSONField agrupado por pestaña `RowTabData` (`docs/plans/2026-11-06-row-tab-data-migration.md`).
- **Estado:** 100% de la suite pasando en verde (`125 tests OK`).

---

## 1. Resumen de Cobertura Añadida y Adaptada

Se adaptaron todas las pruebas unitarias y de integración que interactuaban directamente con `CellValue` o dependían de sus permisos en base de datos hacia el nuevo modelo `RowTabData`, preservando intactos los contratos públicos de los endpoints (`/api/tables/cell/...`, `/api/tables/tabview/...`, `/api/tables/<id>/bulk/`, `/api/tables/<id>/rows/<pk>/cellvalues/`, `/api/tables/<id>/columns/<pk>/cellvalues/`, `/api/asistencia/check/`, `/students/check/`, `/personal/check/`).

Adicionalmente, se expandió la suite con cobertura exhaustiva para:
1. Operaciones CRUD completas por HTTP sobre `/api/tables/cell/<table_id>/<column_id>/<row_id>/` para todos los tipos de columna (`text`, `int`, `float`, `checkbox`, `select`, `date`).
2. Eliminación atómica de celdas (`DELETE` HTTP): valida la remoción selectiva de la clave en `RowTabData.data` sin afectar las demás columnas de la misma pestaña.
3. Validación de errores de tipo por HTTP (400 Bad Request) y no encontrados (404 Not Found).
4. Restricción de modelo `unique_together = [['row', 'tab']]` e integridad en concurrencia / inserción repetida.
5. Aislamiento de pestañas a nivel de fila (Security & Domain Isolation).
6. Chequeo de asistencia en los submódulos `students` y `personal`.

---

## 2. Archivos Creados o Modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/api/tests.py` | Modificado | Adaptación de permisos de modelo (`add_rowtabdata`, `change_rowtabdata`, etc.), adaptación de `DateCellValueTestCase`, `TableBulkUploadTestCase`, `TabViewPaginationTestCase`, `RowCellValuesViewTestCase`, `ColumnCellValuesViewTestCase`, `PartialUpdatePatchTestCase`. Incorporación de suite `RowTabDataCRUDTestCase` (7 nuevos tests). |
| `backend/asistencia/tests.py` | Modificado | Adaptación de aserciones de `CellValue` a `RowTabData` en `test_check_attendance_success`. |
| `backend/students/tests.py` | Modificado | Suite `StudentCheckAttendanceTestCase` (4 tests) validando creación y persistencia de asistencia en `RowTabData`. |
| `backend/personal/tests.py` | Creado | Suite `PersonalCheckAttendanceTestCase` (4 tests) validando persistencia de asistencia y hora de registro en `RowTabData`. |

---

## 3. Matriz de Casos de Prueba Cubiertos

### 3.1 API de Celdas (`RowTabDataCRUDTestCase` en `api/tests.py`)
- `test_http_cell_crud_all_supported_types`: POST (201), GET (200), PUT (200) para `text`, `int`, `float`, `checkbox`, `select`, `date`. Verifica que todas las celdas de una fila en la misma pestaña coexisten en un único registro `RowTabData`.
- `test_http_cell_delete_removes_column_key_atomically`: DELETE (204) remueve la clave de columna en `RowTabData.data` preservando intactas las demás columnas. El GET subsiguiente responde 404, mientras que la celda hermana responde 200.
- `test_http_cell_delete_non_existent_returns_404`: DELETE a celda inexistente responde 404.
- `test_http_cell_get_non_existent_returns_404`: GET a celda inexistente responde 404.
- `test_http_cell_validation_errors`: POST con datos incompatibles (`int` con string alfabético, `checkbox` con string, `date` con fecha inválida) responde 400 Bad Request.
- `test_row_tab_data_model_unique_together_constraint`: Validación de integridad; no permite dos registros para el mismo par `(row, tab)`.
- `test_row_tab_data_tab_isolation`: Dos pestañas de la misma fila generan dos registros `RowTabData` independientes sin solapamiento de columnas.

### 3.2 Modos Revisión y TabView (`api/tests.py`)
- `DateCellValueTestCase`: Validación de permisos DRF `DjangoModelPermissions` para `RowTabData` y soporte de fechas ISO/date.
- `TableBulkUploadTestCase.test_bulk_upload_with_cell_values`: Carga masiva persiste correctamente en `RowTabData`.
- `TabViewPaginationTestCase`: Paginación por lotes de 50 filas leyendo desde `RowTabData`.
- `RowCellValuesViewTestCase`: Modo revisión por fila recuperando valores desde `RowTabData` sin queries N+1.
- `ColumnCellValuesViewTestCase`: Modo revisión por columna recuperando valores desde `RowTabData` con celdas nulas para filas sin valor.
- `PartialUpdatePatchTestCase`: `PATCH` parcial de fila preserva los datos de celda existentes en `RowTabData`.

### 3.3 Módulos de Asistencia Satélite
- `asistencia/tests.py`: Chequeo idempotente y persistencia de booleano de asistencia en `RowTabData`.
- `students/tests.py`: Endpoint `/students/check/` crea pestaña 'Asistencia', columna de fecha actual y marca `True` en `RowTabData`.
- `personal/tests.py`: Endpoint `/personal/check/` crea pestaña 'Asistencia', columnas `{fecha}_asistencia` y `{fecha}_hora`, persistiendo ambos valores en `RowTabData`.

---

## 4. Comando de Ejecución y Evidencia

### Comando
```bash
docker compose run --rm -v "${PWD}/backend:/app" django python manage.py test api asistencia students personal
```

### Salida
```text
Found 125 test(s).
Creating test database for alias 'default'...
System check identified some issues:

WARNINGS:
?: (staticfiles.W004) The directory '/app/static' in the STATICFILES_DIRS setting does not exist.

System check identified 1 issue (0 silenced).
.............................................................................................................................
----------------------------------------------------------------------
Ran 125 tests in 75.624s

OK
Destroying test database for alias 'default'...
```

**Resultado:** 125 pruebas ejecutadas, 0 fallos, 0 errores (100% OK).

---

## 5. Observaciones Técnicas para QA
1. **Peticiones HTTP con payload numérico/booleano**: En los tests de DRF, cuando se envía un valor tipado (`int`, `float`, `bool`) mediante `self.client.post(...)` o `self.client.put(...)`, es necesario enviar con `format='json'` para que los valores no se transformen en cadenas de texto como ocurre en `multipart/form-data`.
2. **Volúmenes en Docker**: El servicio `django` en `docker-compose.yml` no monta por defecto `./backend:/app` en desarrollo interactivo, por lo que las pruebas deben ejecutarse utilizando `-v "${PWD}/backend:/app"`.
3. **Fase Contract de Migración**: Una vez que se elimine definitivamente el modelo deprecado `CellValue` en la Fase Contract, ningún test depende de su tabla ni de sus permisos.
