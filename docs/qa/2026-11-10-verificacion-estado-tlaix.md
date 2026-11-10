# QA Backend: Verificación del estado limpio de Tlaix (`cf42b72`)

- **Fecha:** 2026-11-10
- **Agente:** `test-writer`
- **Commit verificado:** `cf42b72` (`chore: eliminar copia de auditoria Tlaix/ del repositorio`)
- **Contexto:** `main` fue normalizado a la línea limpia de Tlaix: Tlaix hasta el renombrado inline (`cdca080`) más las migraciones `0013_rowtabdata_migration` y `0014_delete_cellvalue`, sin los módulos de Tlaix-ASPACTI (`novedades`, `recent-checks`, `verify-qr`, `api-docs`).
- **Estado:** árbol de trabajo limpio, sin rastros de los módulos retirados, suite completa en verde — **132 tests OK**, 0 fallos, 0 errores.

---

## 1. Objetivo

Verificar que el repositorio local se encuentra en el estado limpio esperado y que la suite de backend sigue pasando sin los módulos eliminados:

1. `git status` limpio y ausencia de `backend/novedades` y de las páginas `Novedades.tsx`, `RecentChecks.tsx`, `VerifyQR.tsx`, `ApiDocumentation.tsx`.
2. Existencia de `backend/api/migrations/0013_rowtabdata_migration.py` y `0014_delete_cellvalue.py`, sin referencias funcionales al modelo `CellValue`.
3. Ejecución de la suite `api asistencia students personal` sin fallos derivados de rutas o imports del estado limpio.

---

## 2. Verificaciones estructurales

| Verificación | Resultado |
|---|---|
| `git status --short` | Sin salida: árbol limpio, sin archivos sin seguimiento ni modificados. |
| `git rev-parse --short HEAD` | `cf42b72`. |
| `backend/` — directorios | `api`, `asistencia`, `config`, `personal`, `students` (+ `media`, `staticfiles`, `.env`). **No existe `backend/novedades`.** |
| `frontend/src/pages/` | `Index.tsx`, `Login.tsx`, `NotFound.tsx`, `TableView.tsx`. **No existen `Novedades.tsx`, `RecentChecks.tsx`, `VerifyQR.tsx`, `ApiDocumentation.tsx`.** |
| `INSTALLED_APPS` (`backend/config/settings.py`) | `guardian`, apps de Django, `rest_framework`, `corsheaders`, `authtoken`, `api`, `students`, `personal` y `asistencia` (append condicional). Sin `novedades`. |
| Referencias residuales en frontend / urls / docs | `git grep -i -E "novedades\|recent.?checks\|verify.?qr\|ApiDocumentation\|api-docs"` solo devuelve menciones históricas en `docs/plans/2026-11-08-0014-delete-cellvalue-y-merge-main.md`. **Cero referencias en `frontend/src`, `backend/config` y `backend/*/urls.py`.** |
| Migración `api/0013_rowtabdata_migration.py` | Presente. `dependencies` → `0012_cellvalue_value_date_alter_column_type`; crea `RowTabData` (`db_table='row_tab_data'`) y ejecuta `transfer_cell_values_to_row_tab_data` / `reverse_transfer`. |
| Migración `api/0014_delete_cellvalue.py` | Presente. `dependencies` → `0013_rowtabdata_migration`; `DeleteModel('CellValue')` (fase Contract). |
| Drift de migraciones | `python manage.py makemigrations --check --dry-run` → **No changes detected** (exit 0). |
| Modelo `CellValue` | Ya no existe en `backend/api/models.py` (clases: `Table`, `Tab`, `Column`, `Row`, `RowTabData`). |

### 2.1 Referencias restantes a la cadena `CellValue`

Ninguna es funcional respecto al modelo retirado:

- `backend/api/serializers.py` (`CellValueSerializer`) y `backend/api/views.py` (`CellValueViewSet`, `RowCellValuesView`, `ColumnCellValuesView`): **nombres históricos de API** que operan sobre `RowTabData` (JSON) y `validate_and_format_cell_value`. No importan ni instancian el modelo.
- `backend/api/urls.py`: rutas `row_cellvalues`, `column_cellvalues` y `tables/cell/...`, servidas por los viewsets anteriores.
- `backend/api/migrations/0013_rowtabdata_migration.py`: `apps.get_model('api', 'CellValue')` dentro de una migración histórica — patrón correcto, no debe "limpiarse".
- `backend/api/migrations/0014_delete_cellvalue.py` y `0012_*`: historial de esquema.
- `backend/api/tests.py`: `CellValueModelRemovalTestCase` (guardia de la fase Contract) y nombres de clases/rutas de tests existentes.

---

## 3. Cobertura de la suite ejecutada

Distribución de los 132 métodos de test:

| Archivo | Tests |
|---|---|
| `backend/api/tests.py` | 116 |
| `backend/asistencia/tests.py` | 8 |
| `backend/students/tests.py` | 4 |
| `backend/personal/tests.py` | 4 |
| **Total** | **132** |

Incluye, entre otros: CRUD HTTP de tablas/tabs/columnas/filas/celdas, validación por tipo de columna (fecha incluida), borrado atómico, permisos globales y por objeto (`guardian`), autenticación (401/403/404), IDOR/BOLA de lectura y escritura, `bulk`, `tabview` (paginación y orden), modo revisión por fila y columna, `PATCH` parcial, renombrado inline, y chequeos de asistencia en `asistencia`, `students` y `personal`.

---

## 4. Casos no cubiertos (y motivo)

- **Frontend:** no existe runner de tests (sin Vitest/Jest ni Testing Library en `package.json`). La ausencia de las páginas retiradas se verificó de forma estática (existencia de archivos y `git grep` de imports/rutas), no con tests automatizados.
- **Residuos de `content_type`/`permission` de `api.cellvalue`:** `DeleteModel` no los elimina; en una base de test creada desde cero nunca se crean, por lo que no son observables desde la suite (hallazgo ya documentado en la auditoría de `0014`).
- **Rollback de `0014` y migración de datos reales de `0013`:** requieren una base con datos preexistentes; fuera del alcance de esta verificación de estado.

---

## 5. Comando y resultado

```bash
docker compose run --rm -v "${PWD}/backend:/app" django python manage.py test api asistencia students personal
```

```text
Found 132 test(s).
Creating test database for alias 'default'...
System check identified some issues:

WARNINGS:
?: (staticfiles.W004) The directory '/app/static' in the STATICFILES_DIRS setting does not exist.

System check identified 1 issue (0 silenced).
....................................................................................................................................
----------------------------------------------------------------------
Ran 132 tests in 121.255s

OK
Destroying test database for alias 'default'...
```

**Resultado:** 132 tests ejecutados, 0 fallos, 0 errores, **exit code 0**.

- Se ejecutó dos veces (PowerShell y `cmd`) con idéntico resultado: 132 tests OK en 137.7 s y 121.3 s.
- La advertencia `staticfiles.W004` es preexistente (código de producción, fuera del alcance de tests) y no afecta al runner.
- No fue necesario modificar ningún test: no aparecieron fallos por rutas ni imports del estado limpio.

---

## 6. Observaciones para QA

1. **Conteo:** la verificación del 2026-11-08 registró 129 tests; el árbol limpio actual define 132 métodos de test (116 + 8 + 4 + 4) y el runner descubre exactamente esos 132. Los cuatro archivos de test no han cambiado desde `5ddbccb`, por lo que la cifra previa correspondía a un estado de rama distinto (feature branch) y no a un cambio introducido en esta verificación.
2. **Exit code en PowerShell:** al canalizar la salida de `docker compose` con `Tee-Object`, PowerShell registra los mensajes de progreso de Docker (stderr) como `NativeCommandError` y el wrapper reporta `1` aunque el runner termine bien. Verificar siempre la línea `OK`/`FAILED` o usar `cmd /c ... & echo %ERRORLEVEL%`.
3. **Nombres históricos de API:** `CellValueViewSet`, `CellValueSerializer` y las rutas `*cellvalues*` son contrato público hacia el frontend; no implican que el modelo exista y no deben renombrarse sin plan de compatibilidad.
4. **Bind mount:** la ejecución usa `-v "${PWD}/backend:/app"`, por lo que valida el árbol de trabajo y no la imagen horneada del contenedor `tlaix-django-1`.

---

## 7. Archivos

| Archivo | Acción |
|---|---|
| `docs/qa/2026-11-10-verificacion-estado-tlaix.md` | Creado (este documento). |

Sin cambios en tests, código de producción, migraciones ni configuración. Sin `git commit` ni push.
