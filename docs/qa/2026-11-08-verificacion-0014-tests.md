# QA Backend: Verificación de la suite tras `0014_delete_cellvalue` (fase Contract)

- **Fecha:** 2026-11-08
- **Agente:** `test-writer`
- **Plan:** `docs/plans/2026-11-08-0014-delete-cellvalue-y-merge-main.md` (tarea 4)
- **Contexto:** `CellValue` fue retirado de `backend/api/models.py` y la migración `api/0014_delete_cellvalue` (`DeleteModel`) elimina la tabla `cell_values`. Los endpoints `/api/tables/cell/...` siguen operando sobre `RowTabData` mediante `CellValueViewSet` / `CellValueSerializer` (nombres históricos de API, no del modelo).
- **Estado:** suite completa en verde — **129 tests OK**, 0 fallos, 0 errores.

---

## 1. Objetivo

Verificar que:

1. Ningún test importa ni instancia el modelo retirado `CellValue` (`api.models.CellValue`, `CellValue.objects`, `apps.get_model(..., 'CellValue')` como uso funcional).
2. La suite `api asistencia students personal` sigue pasando al 100 % sin el modelo.
3. La ausencia del modelo y de la tabla `cell_values` queda cubierta por un test de guardia permanente.

---

## 2. Archivos modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/api/tests.py` | Modificado | Import de `django.apps.apps` y nueva clase `CellValueModelRemovalTestCase` (2 tests de guardia). Sin cambios en tests existentes. |

No se modificó código de producción, migraciones ni otros documentos. No se hicieron commits.

---

## 3. Casos cubiertos

### 3.1 Verificación estática de dependencias del modelo retirado

Búsqueda sobre los cuatro archivos de test (`backend/api/tests.py`, `backend/asistencia/tests.py`, `backend/students/tests.py`, `backend/personal/tests.py`):

```text
Patrón: from api.models import ... CellValue | CellValue.objects | CellValue( | apps.get_model(..., 'CellValue')
Resultado: solo 2 coincidencias, ambas dentro del test de guardia nuevo
           (api/tests.py:1927 docstring y api/tests.py:1929 aserción intencional).
```

Las demás apariciones de la cadena `CellValue` en tests son nombres de API o rutas, no del modelo:

- `DateCellValueTestCase` (nombre histórico de la suite).
- `CellValueViewSet` en comentarios y docstrings.
- `RowCellValuesViewTestCase` / `ColumnCellValuesViewTestCase` y rutas `row_cellvalues` / `column_cellvalues`.

En código de producción solo quedan referencias legítimas: `CellValueViewSet`/`CellValueSerializer` (nombres de API), `backend/api/migrations/0013_rowtabdata_migration.py` (que resuelve el modelo histórico vía `apps.get_model`, correcto en migraciones) y `0014_delete_cellvalue.py`.

### 3.2 `CellValueModelRemovalTestCase` (nuevo, `backend/api/tests.py`)

- `test_cell_value_model_not_registered_in_app_registry`: `apps.get_model('api', 'CellValue')` lanza `LookupError`, confirmando que el modelo ya no está en el registro de apps de Django.
- `test_cell_values_table_absent_from_database_schema`: `connection.introspection.table_names()` no contiene `cell_values` y sí contiene `row_tab_data`, confirmando que la migración `0014` deja el esquema en el estado Contract.

Ambos tests se ejecutan sobre la base de test creada desde cero por el runner, por lo que también validan que la secuencia completa de migraciones (incluida `0014`) aplica sin errores.

### 3.3 Suite de regresión existente

Se ejecutaron los 127 tests preexistentes sin cambios: CRUD HTTP de celdas, validación por tipo de columna, borrado atómico, permisos globales y por objeto, IDOR/BOLA, `bulk`, `tabview` (paginación y orden), modo revisión por fila/columna, `PATCH` parcial, y chequeos de asistencia en `asistencia`, `students` y `personal`.

---

## 4. Casos no cubiertos (y motivo)

- **Residuos de `django_content_type` / `auth_permission` de `api.cellvalue`:** `DeleteModel` no los elimina (hallazgo H-9 de la auditoría de `0014`). No se añadió aserción porque en una base de test creada desde cero el content type nunca se crea; verificarlo requeriría un test de migración con datos preexistentes, fuera del alcance de esta verificación.
- **Rollback de `0014`:** cubierto por la auditoría de `db-migration-guard`, no por tests unitarios.
- **Estado del contenedor Docker en ejecución:** la imagen puede estar desincronizada respecto al árbol de trabajo (hallazgo H-2); esta verificación se ejecutó con bind mount `-v "${PWD}/backend:/app"`, no contra la imagen desplegada.

---

## 5. Comando y resultado

```bash
docker compose run --rm -v "${PWD}/backend:/app" django python manage.py test api asistencia students personal
```

```text
Found 129 test(s).
Creating test database for alias 'default'...
System check identified some issues:

WARNINGS:
?: (staticfiles.W004) The directory '/app/static' in the STATICFILES_DIRS setting does not exist.

System check identified 1 issue (0 silenced).
.................................................................................................................................
----------------------------------------------------------------------
Ran 129 tests in 122.454s

OK
Destroying test database for alias 'default'...
```

**Resultado:** 129 tests ejecutados (127 preexistentes + 2 de guardia), 0 fallos, 0 errores (100 % OK).

La advertencia `staticfiles.W004` es preexistente y está documentada como H-10 en `docs/reports/2026-11-08-auditoria-migracion-0014.md`; no afecta al resultado del runner.

---

## 6. Observaciones para QA

1. **Nombres históricos de API:** `CellValueViewSet` y `CellValueSerializer` permanecen por compatibilidad de rutas y contrato del frontend; no implican que el modelo exista. No deben confundirse con una regresión de la fase Contract.
2. **Migración `0013`:** sigue conteniendo `CellValue` resuelto con `apps.get_model('api', 'CellValue')`. Es el patrón correcto y no debe "limpiarse": las migraciones históricas se evalúan con el estado del proyecto en su momento.
3. **Los tests de guardia son permanentes:** si alguien reintrodujera `CellValue` en `models.py` o una migración posterior recreara la tabla, `CellValueModelRemovalTestCase` fallaría y bloquearía el merge.
4. **Base de test:** el runner aplica todas las migraciones, incluida `0014`, por lo que la suite certifica el estado Contract desde cero; no depende de `--keepdb` ni de datos locales.
