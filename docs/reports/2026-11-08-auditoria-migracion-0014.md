# Auditoría de migración — `api/0014_delete_cellvalue` (fase Contract)

- **Fecha:** 2026-11-08
- **Auditor:** `db-migration-guard`
- **Plan auditado:** `docs/plans/2026-11-08-0014-delete-cellvalue-y-merge-main.md`
- **Migración evaluada:** `backend/api/migrations/0014_delete_cellvalue.py`
- **Migración previa:** `backend/api/migrations/0013_rowtabdata_migration.py`
- **Auditoría previa:** `docs/reports/2026-11-06-auditoria-migracion-row-tab-data.md`
- **Entorno verificado:** PostgreSQL 15.17 (Docker, contenedor `tlaix-db-1`), base `tlaix` (12 MB), Django 5.2; prueba de ciclo completo en SQLite descartable
- **Alcance:** solo lectura sobre la base compartida; sin `migrate` sobre PostgreSQL compartido, sin cambios de código ni commits

---

## 1. Resumen ejecutivo

**VEREDICTO: APROBADA CON CONDICIONES.**

`0014_delete_cellvalue` es una migración correcta en su forma: una sola operación `DeleteModel`, dependencia lineal de `0013`, sin dependientes en otras apps y con un DDL atómico y de duración constante (`DROP TABLE ... CASCADE`, sin escaneo de filas). El grafo de migraciones está sincronizado con `models.py` (`makemigrations --check` → `No changes detected`) y el ciclo completo —alta desde cero, Contract y rollback— se validó en una base descartable.

No obstante, **no debe desplegarse sin condiciones** por cinco razones:

1. **La migración ya se aplicó en la base PostgreSQL local fuera del flujo auditado**, sin respaldo verificable (no hay `pg_dump` en el volumen ni en el repositorio). La tabla `cell_values` ya no existe en desarrollo.
2. **La imagen Docker en ejecución está desincronizada con la base**: el contenedor `tlaix-django-1` todavía contiene el modelo `CellValue` y no incluye el archivo `0014`; la base, en cambio, registra `0014` como aplicada.
3. **`0013` fue editada respecto a la versión documentada en la auditoría del 2026-11-06** (se le retiró el `DeleteModel`). En local el orden mtime/aplicación es consistente, pero cualquier entorno que haya aplicado la versión anterior ya no tendrá `cell_values` y `0014` fallará con `relation "cell_values" does not exist`, impidiendo el arranque por `set -e` en `entrypoint.sh`.
4. **`DROP TABLE ... CASCADE` no se verificó contra dependientes en producción** (vistas, FKs entrantes u objetos que PostgreSQL eliminaría en silencio).
5. **`0014` no está versionada** (`git status`: `?? backend/api/migrations/0014_delete_cellvalue.py`) y no existe en `main`.

Se clasifica como **operación destructiva que requiere respaldo verificado y migración en un paso explícito (one-off)**, no como parte implícita del arranque del contenedor.

---

## 2. Migración revisada

| App | Archivo | Dependencias | Operaciones |
|---|---|---|---|
| `api` | `0014_delete_cellvalue.py` | `('api', '0013_rowtabdata_migration')` | `DeleteModel(name='CellValue')` |

### 2.1 DDL hacia adelante (`sqlmigrate api 0014`)

```sql
BEGIN;
--
-- Delete model CellValue
--
DROP TABLE "cell_values" CASCADE;
COMMIT;
```

- Una única sentencia, dentro de una transacción.
- PostgreSQL soporta DDL transaccional: si el `DROP` falla, no queda estado parcial.

### 2.2 DDL inverso (`sqlmigrate --backwards api 0014`)

```sql
BEGIN;
CREATE TABLE "cell_values" (
    "id" varchar(50) NOT NULL PRIMARY KEY,
    "value_text" text NULL,
    "value_int" integer NULL,
    "value_float" double precision NULL,
    "value_bool" boolean NULL,
    "value_json" jsonb NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "column_id" varchar(50) NOT NULL,
    "row_id" varchar(50) NOT NULL,
    "value_date" date NULL
);
ALTER TABLE "cell_values" ADD CONSTRAINT "cell_values_row_id_column_id_5e07d5ff_uniq" UNIQUE ("row_id", "column_id");
ALTER TABLE "cell_values" ADD CONSTRAINT "cell_values_column_id_d646297f_fk_columns_id"
    FOREIGN KEY ("column_id") REFERENCES "columns" ("id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "cell_values" ADD CONSTRAINT "cell_values_row_id_ec6cfe54_fk_rows_id"
    FOREIGN KEY ("row_id") REFERENCES "rows" ("id") DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "cell_values_id_9cfc0776_like" ON "cell_values" ("id" varchar_pattern_ops);
CREATE INDEX "cell_values_column_id_d646297f" ON "cell_values" ("column_id");
CREATE INDEX "cell_values_column_id_d646297f_like" ON "cell_values" ("column_id" varchar_pattern_ops);
CREATE INDEX "cell_values_row_id_ec6cfe54" ON "cell_values" ("row_id");
CREATE INDEX "cell_values_row_id_ec6cfe54_like" ON "cell_values" ("row_id" varchar_pattern_ops);
CREATE INDEX "cell_values_row_id_72cd6c_idx" ON "cell_values" ("row_id", "column_id");
CREATE INDEX "cell_values_column__dd8fa3_idx" ON "cell_values" ("column_id");
COMMIT;
```

**Conclusión:** el rollback reconstruye el esquema, **no los datos**. La tabla se recrea vacía.

---

## 3. Estado del entorno verificado

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `0014` aplicada en PostgreSQL local | **Sí** | `django_migrations`: `api / 0014_delete_cellvalue / 2026-11-09 01:53:53.959+00` |
| `cell_values` existe en PostgreSQL local | **No** | `to_regclass('public.cell_values')` → `NULL` |
| `row_tab_data` existe y conserva datos | **Sí** | 30 filas, 6 pestañas, 27 filas con datos |
| Volumen de la base local | 12 MB | `pg_database_size('tlaix')` |
| Datos de negocio actuales | `tables` = 12, `rows` = 714 | `SELECT count(*)` |
| Migraciones pendientes (todas las apps) | **Ninguna** | `showmigrations` sin líneas `[ ]` |
| `makemigrations --check --dry-run` | `No changes detected` | ejecutado con bind mount del árbol de trabajo |
| `0014` en el repositorio | **No versionada** | `git status`: `?? .../0014_delete_cellvalue.py`; no existe en `main` |
| `0014` dentro de la imagen en ejecución | **No** | `test -f /app/api/migrations/0014_delete_cellvalue.py` → `NO` |
| `CellValue` dentro de la imagen en ejecución | **Sí** | `/app/api/models.py:95` → `class CellValue(models.Model)` |
| API con la imagen antigua y la tabla ya eliminada | 200 OK | `curl http://localhost:8000/api/` |
| Respaldo previo a la aplicación local | **No verificable** | sin `*.dump`/`*.sql` en el volumen; `db/db.sql` (1,263 B) es un esquema MySQL legado, no un respaldo |

### 3.1 Cronología del incidente de proceso

- `0013_rowtabdata_migration.py`: `LastWriteTime` 2026-11-06 20:01:45 local (2026-11-07 02:01:45 UTC).
- `0013` aplicada: 2026-11-07 02:03:16 UTC → **la versión vigente (sin `DeleteModel`) se aplicó después de su última edición**.
- `0014_delete_cellvalue.py`: creada 2026-11-08 19:51:19 local.
- `0014` aplicada: 2026-11-08 19:53:53 local (2026-11-09 01:53:53 UTC), ~2.5 minutos después de su creación y **antes de esta auditoría**.
- El contenedor `tlaix-django-1` llevaba ~34 minutos en ejecución al momento de la revisión y **no** contiene `0014`, por lo que la aplicación se ejecutó desde un contenedor efímero con bind mount (`docker compose run -v ...`), no desde la imagen desplegada.

---

## 4. Hallazgos por severidad

### ALTO

#### H-1 · `0014` ya se aplicó en la base local sin respaldo verificable ni verificación previa

- **Archivo/línea:** `backend/api/migrations/0014_delete_cellvalue.py:17-20`
- **Descripción:** la eliminación de `cell_values` se ejecutó sobre la base PostgreSQL de desarrollo antes de completar las tareas 4 (tests), 5 (Docker local) y 3 (esta auditoría) del plan, y sin evidencia de `pg_dump`.
- **Evidencia:**
  - `django_migrations` registra `0014_delete_cellvalue` aplicada el `2026-11-09 01:53:53.959+00`.
  - `to_regclass('public.cell_values')` devuelve `NULL`.
  - No hay archivos `.dump`/`.backup` en `/var/lib/postgresql/data` ni en el repositorio.
- **Impacto:** en desarrollo, los datos de la tabla original ya no son recuperables de forma fiel. Solo queda la recuperación **derivada** desde `row_tab_data` (`migrate api 0012`), que no restaura identificadores ni celdas huérfanas descartadas por `0013`.
- **Propuesta:** documentar el incidente en `docs/ops/`; a partir de ahora, toda aplicación de `0014` en cualquier entorno exige el respaldo del punto 7. Si la fidelidad de los datos locales importa, comparar `row_tab_data` contra el último respaldo disponible o asumir el riesgo como aceptado (entorno de desarrollo).
- **Responsable:** `docker-ops` (ejecución) / `orchestrator` (registro).

#### H-2 · Deriva imagen Docker ↔ base de datos local

- **Archivo/línea:** `backend/Dockerfile` (`COPY . /app/`, sin bind mount) y `backend/entrypoint.sh:4`
- **Descripción:** la imagen `tlaix-django:latest` en ejecución se construyó antes de que existiera `0014`; conserva `class CellValue` en `/app/api/models.py:95` y no incluye el archivo de migración. La base, en cambio, ya tiene `0014` aplicada.
- **Evidencia:**
  - `docker compose exec django ls /app/api/migrations/` no lista `0014`.
  - `sqlmigrate api 0014` dentro del contenedor en ejecución → `CommandError: Cannot find a migration matching '0014' from app 'api'`.
  - `showmigrations api` dentro del contenedor no imprime la línea de `0014`; con bind mount del árbol de trabajo sí aparece `[X] 0014_delete_cellvalue`.
- **Impacto:** la verificación de la tarea 5 del plan no es válida contra el contenedor actual: `migrate` no verá `0014` y `showmigrations` no la reportará. El runtime no falla hoy porque ninguna vista consulta `CellValue` (solo aparece en el código de `0013`), pero la imagen quedaría inconsistente ante cualquier `makemigrations --check` o prueba que espere el estado Contract.
- **Propuesta:** reconstruir la imagen (`docker compose build django && docker compose up -d django`) después de versionar `0014` y `models.py`, y repetir la verificación sobre la imagen nueva. No re-aplicar `0014` en local: ya está registrada y `migrate` será un no-op.
- **Responsable:** `docker-ops`.

#### H-3 · `0013` cambió respecto a la versión documentada; entornos que aplicaron la versión anterior fallarán en `0014`

- **Archivo/línea:** `backend/api/migrations/0013_rowtabdata_migration.py:135-155` vs. `docs/reports/2026-11-06-auditoria-migracion-row-tab-data.md:32,84,149-151`
- **Descripción:** la auditoría previa describía `0013` con `DeleteModel(CellValue)` como última operación. El archivo actual ya no lo contiene (se retiró conforme a la recomendación H-1 de ese reporte), pero **la edición de una migración ya publicada crea dos variantes de `0013` en circulación**.
- **Evidencia:**
  - Local: `0013` aplicada 2026-11-07 02:03:16 UTC, con mtime 02:01:45 UTC → se aplicó la versión vigente; `cell_values` sobrevivió hasta `0014`.
  - Si un entorno aplicó la variante anterior, `cell_values` ya fue eliminada allí; al ejecutar `0014` el DDL `DROP TABLE "cell_values" CASCADE` fallará con `relation "cell_values" does not exist`, y `entrypoint.sh` (`set -e`) abortará el arranque.
- **Impacto:** fallo de despliegue con caída del servicio (crash-loop) en el entorno afectado; bloqueo del rollback hasta reparar el estado.
- **Propuesta (pre-flight obligatorio en producción y cualquier entorno persistente):**
  ```sql
  SELECT to_regclass('public.cell_values') AS cell_values;
  SELECT name, applied FROM django_migrations WHERE app='api' AND name LIKE '0013%';
  ```
  - `cell_values` presente → `0014` es aplicable.
  - `cell_values` ausente + `0013` aplicada → **no ejecutar `0014`**. Regularizar con una migración específica o `--fake` solo tras justificar el estado real (ver regla 6 del rol); documentar el caso.
- **Responsable:** `docker-ops` (verificación) / `backend` (regularización si aplica).

#### H-4 · `DROP TABLE ... CASCADE` sin verificación de objetos dependientes en producción

- **Archivo/línea:** `0014_delete_cellvalue.py:18-20` → `DROP TABLE "cell_values" CASCADE;`
- **Descripción:** `CASCADE` elimina silenciosamente vistas, FKs entrantes u otros objetos que dependan de `cell_values`. En desarrollo no hay dependientes (la tabla solo tiene FKs **salientes** hacia `rows` y `columns`), pero eso no se ha comprobado en producción.
- **Evidencia (local):**
  - `pg_constraint` sobre `row_tab_data` solo muestra `pkey`, `uniq(row_id,tab_id)` y dos FKs salientes a `rows`/`tabs`.
  - Ninguna migración de `students`, `personal` o `asistencia` referencia `CellValue` ni depende de `api.0013`/`api.0014`.
  - `guardian_userobjectpermission` asociada a `api.cellvalue` = 0.
- **Impacto:** pérdida silenciosa de objetos de base de datos no inventariados; el `CASCADE` no pide confirmación.
- **Propuesta (consulta de pre-flight antes del `DROP`):**
  ```sql
  -- FKs entrantes
  SELECT conrelid::regclass AS tabla_origen, conname
  FROM pg_constraint
  WHERE confrelid = 'public.cell_values'::regclass AND contype = 'f';

  -- Vistas/materializaciones que referencian la tabla
  SELECT schemaname, viewname
  FROM pg_views
  WHERE definition ILIKE '%cell_values%';

  -- Dependencias normales registradas en el catálogo
  SELECT classid::regclass, objid, deptype
  FROM pg_depend
  WHERE refobjid = 'public.cell_values'::regclass AND deptype = 'n';
  ```
  Si cualquiera devuelve filas: **detener** y evaluar antes de desplegar.
- **Responsable:** `docker-ops`.

#### H-5 · `0014` no está versionada y no existe en `main`

- **Archivo/línea:** `backend/api/migrations/0014_delete_cellvalue.py` (untracked)
- **Descripción:** el archivo y el cambio de `models.py` están sin commitear. La rama actual es `feature/row-tab-data-migration` (`fe89349`), y `main` (`a0e4648`) no contiene `0014`.
- **Evidencia:** `git status --short` → `M backend/api/models.py`, `?? backend/api/migrations/0014_delete_cellvalue.py`; `git cat-file -e main:backend/api/migrations/0014_delete_cellvalue.py` → no existe.
- **Impacto:** si se construye la imagen o se fusiona sin incluir el archivo, el código quedará sin el `DeleteModel` mientras algunas bases ya registran `0014`. En un entorno nuevo, `cell_values` nunca se eliminaría y `makemigrations --check` pasaría a reportar una migración pendiente. La suite de tests y el QA de la tarea 4/6 no pueden certificar el estado Contract sin este archivo.
- **Propuesta:** incluir `0014_delete_cellvalue.py` y la eliminación de `CellValue` de `models.py` en el mismo commit de la entrega, antes de la tarea 7 (commit) y del merge de la tarea 8.
- **Responsable:** `orchestrator` / `backend`.

### MEDIO

#### H-6 · `entrypoint.sh` aplica la migración sin puerta operativa entre respaldo y `DROP`

- **Archivo/línea:** `backend/entrypoint.sh:2-4`
- **Descripción:** `set -e` + `python manage.py migrate --noinput` ejecuta `0014` automáticamente al arrancar el contenedor. El operador no tiene un punto de control para confirmar el respaldo ni para fijar `lock_timeout`.
- **Impacto:** un `docker compose up -d --build` desencadena la destrucción de la tabla en el mismo instante del despliegue; si el respaldo no está verificado o hay una transacción larga, el arranque queda bloqueado o la pérdida de datos es inmediata.
- **Propuesta:** aplicar `0014` explícitamente con un contenedor one-off **después** del respaldo verificado y **antes** de recrear el servicio:
  ```bash
  docker compose run --rm -e "PGOPTIONS=-c lock_timeout=5s -c statement_timeout=60s" \
    django python manage.py migrate api 0014
  ```
  Al arrancar luego el servicio, el `migrate` de `entrypoint.sh` será un no-op.
- **Responsable:** `docker-ops`.

#### H-7 · Rollback limitado: `0013` recrea la tabla vacía; solo `0012` repuebla datos derivados

- **Archivo/línea:** `0014_delete_cellvalue.py:9-10` (docstring) y `0013_rowtabdata_migration.py:64-126` (`reverse_transfer`)
- **Descripción:** el rollback de `0014` solo ejecuta el inverso de `DeleteModel` (`CREATE TABLE`). No hay recuperación de datos hasta revertir también `0013`, cuya función `reverse_transfer` reconstruye `CellValue` a partir de `row_tab_data`.
- **Evidencia (prueba en SQLite descartable, ver §9):**
  - `migrate api 0013` → `CELL_VALUES_AFTER_0013: 0`.
  - `migrate api 0012` → `CELL_VALUES_AFTER_0012: 2`, con `('c1','hola',NULL)` y `('c2',NULL,42)` restaurados desde el JSONB.
- **Impacto:** quien ejecute `migrate api 0013` creerá haber recuperado la tabla y encontrará 0 filas. La recuperación derivada no preserva IDs originales, ni celdas huérfanas ignoradas por `0013`, ni valores normalizados.
- **Propuesta:** documentar en el runbook de `docs/ops/` las tres alternativas y su semántica exacta:
  1. `migrate api 0013` → esquema vacío.
  2. `migrate api 0012` → datos derivados desde `row_tab_data` (mejor esfuerzo).
  3. `pg_restore` del respaldo → recuperación real.
- **Responsable:** `docker-ops`.

#### H-8 · Locks: `ACCESS EXCLUSIVE` sobre `cell_values` y bloqueos breves sobre `rows`/`columns`

- **Archivo/línea:** `0014_delete_cellvalue.py:18-20`
- **Descripción:** `DROP TABLE` toma `ACCESS EXCLUSIVE` sobre `cell_values`. Como la tabla tiene FKs **salientes** hacia `rows` y `columns`, PostgreSQL debe retirar los triggers de integridad en las tablas referenciadas, lo que implica bloqueos breves sobre `rows` y `columns`. La operación es de metadatos: **no escanea filas**, por lo que la duración no crece con el volumen de `cell_values`.
- **Evidencia:** DDL generado (§2.1); catálogo local sin FKs entrantes; la tabla pesa poco y el `DROP` es O(1). El riesgo real es la **espera** detrás de una transacción larga, no el tamaño.
- **Impacto:** si existe una transacción larga que retiene locks sobre `rows`/`columns`, el `DROP` espera, y mientras espera encola un `ACCESS EXCLUSIVE` que bloquea nuevas lecturas/escrituras. Con `lock_timeout` se convierte en un fallo rápido y seguro.
- **Propuesta:** ejecutar el one-off con `PGOPTIONS='-c lock_timeout=5s -c statement_timeout=60s'`, en ventana de baja actividad, y revisar antes:
  ```sql
  SELECT pid, state, now() - xact_start AS duracion, left(query, 120) AS query
  FROM pg_stat_activity
  WHERE datname = current_database() AND state <> 'idle'
    AND now() - xact_start > interval '30 seconds';
  ```
  **No se requiere ventana de mantenimiento prolongada**; sí una ventana breve de despliegue.
- **Responsable:** `docker-ops`.

### BAJO

#### H-9 · Content type y permisos huérfanos tras el `DeleteModel`

- **Descripción:** `DeleteModel` elimina la tabla, pero no las filas de `django_content_type` ni `auth_permission`.
- **Evidencia (local):** `django_content_type` id `13`, `api / cellvalue`; 4 filas en `auth_permission`; 0 permisos de objeto en `guardian`.
- **Impacto:** ruido en el admin y en `remove_stale_contenttypes`; sin impacto de esquema ni de integridad.
- **Propuesta:** limpieza opcional post-despliegue con `python manage.py remove_stale_contenttypes` (interactivo) o dejarlo documentado como residuo aceptado. No forma parte de `0014`.
- **Responsable:** `backend`.

#### H-10 · La advertencia `staticfiles.W004` hace que los comandos de verificación salgan con código 1

- **Descripción:** `/app/static` no existe en la imagen; Django emite `WARNINGS: (staticfiles.W004)` y los comandos `showmigrations`, `sqlmigrate` y `makemigrations` terminan con exit code 1 aunque su salida sea correcta.
- **Impacto:** un pipeline que dependa del exit code puede interpretar un falso fallo.
- **Propuesta:** crear el directorio en la imagen o ajustar `STATICFILES_DIRS`; mientras tanto, evaluar la salida, no solo el código de retorno.
- **Responsable:** `docker-ops` / `backend`.

#### H-11 · Documentación desactualizada respecto al estado real

- **Descripción:** el plan marca las tareas 2–6 como pendientes, pero `0014` ya está aplicada en desarrollo; la auditoría del 2026-11-06 sigue describiendo `0013` con `DeleteModel`.
- **Propuesta:** actualizar el plan y anotar en el reporte previo (o en este) que `0013` fue editada antes de su aplicación en local. Enlazar este documento desde el plan.
- **Responsable:** `orchestrator`.

---

## 5. Análisis de dependencias y orden de despliegue

### 5.1 Dependencias

| Verificación | Resultado |
|---|---|
| `0014` depende de `0013` | Sí, dependencia única y lineal |
| Otras apps dependen de `api.0014` | **No** |
| Otras apps dependen de `api.0013` | **No** (`asistencia.0001` → `api.0012`; `students.0001` → `api.0008`; `personal.0001` → `api.0011`) |
| Modelos de otras apps con FK a `CellValue` | **No** (grep en `backend/**/*.py`) |
| Consultas runtime a `CellValue` | **No**; solo aparece en el código histórico de `0013` |
| Migraciones pendientes en cualquier app | **Ninguna** |

`0014` es una hoja del grafo: no bloquea ni reordena migraciones de otras apps. El único requisito de orden es `0013` aplicada y `cell_values` presente.

### 5.2 Orden de despliegue recomendado

```text
1. Commit de 0014 + models.py (misma entrega)      → orchestrator/backend
2. Suite de tests (tarea 4)                        → test-writer
3. Build de la imagen nueva                        → docker-ops
4. Respaldo verificado + pre-flight SQL            → docker-ops
5. One-off: migrate api 0014 con lock_timeout      → docker-ops
6. docker compose up -d (nueva imagen)             → docker-ops
7. Verificación funcional y de esquema             → docker-ops/qa
```

La migración debe ejecutarse **antes** de que la nueva versión atienda tráfico (paso 5 antes del 6). El código nuevo ya no referencia `CellValue`, por lo que no existe ventana de incompatibilidad. Si se prefiere el orden inverso (código primero), solo es viable si la imagen anterior ya no escribe en `cell_values`; no es el caso garantizado.

### 5.3 Frontera de rollback

- **Imagen:** solo se puede volver a una imagen que opere exclusivamente sobre `RowTabData` (posterior a `0013`). Una imagen anterior a `0013` fallará con errores 500 al consultar `cell_values`.
- **Base de datos:** `migrate api 0013` (tabla vacía), `migrate api 0012` (datos derivados) o `pg_restore` (recuperación real).
- **Respaldo:** imprescindible si se exige fidelidad de datos.

---

## 6. Respaldo obligatorio (dictamen)

**Sí, obligatorio y verificado antes de aplicar `0014` en producción.**

Requisitos mínimos:

1. `pg_dump` en formato custom comprimido, fuera del volumen de la base:
   ```bash
   docker compose exec -T db pg_dump -U tlaix -d tlaix -Fc -Z 9 -f /tmp/pre_0014.dump
   docker compose cp db:/tmp/pre_0014.dump ./backups/pre_0014_$(date +%Y%m%d_%H%M).dump
   ```
2. Verificación de legibilidad (no basta con que el archivo exista):
   ```bash
   docker compose exec -T db pg_restore --list /tmp/pre_0014.dump | head -20
   ```
3. Registrar tamaño y checksum (`sha256sum`) del archivo.
4. Confirmar que el respaldo contiene `cell_values` **y** `row_tab_data`:
   ```bash
   docker compose exec -T db pg_restore --list /tmp/pre_0014.dump | grep -E "cell_values|row_tab_data"
   ```
5. Preferible: restore de prueba en una base auxiliar (`tlaix_restore_test`) y conteo de `cell_values`. Si no se puede, dejar constancia escrita de que solo se validó el listado.

Sin estos pasos, `0014` **no debe aprobarse para producción**.

---

## 7. Plan recomendado paso a paso

### Fase 0 — Cerrar la entrega en el repositorio

1. Añadir `backend/api/migrations/0014_delete_cellvalue.py` al control de versiones junto con `backend/api/models.py`.
2. Ejecutar la suite completa (tarea 4) y confirmar que no quedan referencias al modelo retirado.
3. Actualizar el plan y `SYSTEM_API_SPECIFICATION.md` (retirar `CellValue` del catálogo y del diagrama).

### Fase 1 — Pre-flight en el entorno destino (solo lectura)

```sql
-- ¿Existe la tabla?
SELECT to_regclass('public.cell_values') AS cell_values;

-- Estado de 0013 y 0014
SELECT name, applied FROM django_migrations
WHERE app = 'api' AND name IN ('0013_rowtabdata_migration', '0014_delete_cellvalue')
ORDER BY id;

-- Dependientes que CASCADE eliminaría
SELECT conrelid::regclass AS tabla_origen, conname
FROM pg_constraint
WHERE confrelid = 'public.cell_values'::regclass AND contype = 'f';

SELECT schemaname, viewname FROM pg_views WHERE definition ILIKE '%cell_values%';
```

**Criterio de aborto:** `cell_values` inexistente, `0014` ya aplicada, o cualquier dependiente listado.

### Fase 2 — Completitud de la migración de datos

Antes de destruir la fuente, verificar que `row_tab_data` cubre todas las celdas existentes:

```sql
-- Celdas cuya pareja (row, tab) no tiene registro RowTabData
SELECT count(*) AS celdas_sin_padre
FROM cell_values cv
JOIN columns c ON c.id = cv.column_id
WHERE NOT EXISTS (
  SELECT 1 FROM row_tab_data rtd
  WHERE rtd.row_id = cv.row_id AND rtd.tab_id = c.tab_id
);

-- Celdas cuya clave de columna no está en el JSONB
SELECT count(*) AS celdas_sin_clave
FROM cell_values cv
JOIN columns c ON c.id = cv.column_id
LEFT JOIN row_tab_data rtd ON rtd.row_id = cv.row_id AND rtd.tab_id = c.tab_id
WHERE rtd.id IS NULL OR NOT (rtd.data ? cv.column_id::text);
```

Si cualquiera devuelve > 0, **no aplicar `0014`** hasta explicar la diferencia (columnas huérfanas, filas huérfanas o transferencia incompleta).

### Fase 3 — Respaldo y aplicación explícita

1. Respaldo verificado (§6).
2. Aplicación one-off con límites de lock:
   ```bash
   docker compose run --rm \
     -e "PGOPTIONS=-c lock_timeout=5s -c statement_timeout=60s" \
     django python manage.py migrate api 0014
   ```
   Si falla por `lock_timeout`, reintentar en otro momento; **no** subir el timeout sin revisar `pg_stat_activity`.
3. Confirmar `DROP` y ausencia de la tabla.

### Fase 4 — Despliegue y verificación

```bash
docker compose build django
docker compose up -d django
docker compose exec -T django python manage.py showmigrations api
docker compose exec -T db psql -U tlaix -d tlaix -c "SELECT to_regclass('public.cell_values');"
docker compose exec -T db psql -U tlaix -d tlaix -c "SELECT count(*) FROM row_tab_data;"
curl.exe -I http://localhost:8000/api/
```

Esperado: `[X] 0014_delete_cellvalue`, `cell_values` → `NULL`, conteo de `row_tab_data` sin cambios, HTTP 200. Probar edición de una celda y verificar que persiste en el JSONB.

### Fase 5 — Rollback (si fuera necesario)

| Objetivo | Comando | Resultado |
|---|---|---|
| Recuperar esquema | `migrate api 0013` | Tabla vacía (0 filas) |
| Recuperar datos derivados | `migrate api 0012` | Repuebla desde `row_tab_data`; IDs nuevos; no fiel byte a byte |
| Recuperación real | `pg_restore` del dump | Estado exacto al momento del respaldo |
| Volver a imagen anterior | Solo imágenes que operen sobre `RowTabData` | Una imagen pre-`0013` fallará |

---

## 8. Comandos de verificación ejecutados y resultado

| # | Comando | Resultado |
|---|---|---|
| 1 | `docker compose exec -T django python manage.py showmigrations api` | Hasta `[X] 0013`; **no lista 0014** (imagen antigua) |
| 2 | `docker compose run --rm -v "${PWD}/backend:/app" django python manage.py showmigrations api` | `[X] 0013`, `[X] 0014` |
| 3 | `... showmigrations` (todas las apps) | Sin líneas `[ ]` |
| 4 | `... sqlmigrate api 0014` | `BEGIN; DROP TABLE "cell_values" CASCADE; COMMIT;` |
| 5 | `... sqlmigrate --backwards api 0014` | `CREATE TABLE cell_values` + constraints + 8 índices |
| 6 | `... makemigrations --check --dry-run` | `No changes detected` |
| 7 | `psql: SELECT to_regclass('public.cell_values')` | `NULL` |
| 8 | `psql: SELECT count(*) FROM row_tab_data` | `30` (6 pestañas, 27 filas con datos) |
| 9 | `psql: django_migrations` | `0014` aplicada 2026-11-09 01:53:53.959+00 |
| 10 | `psql: django_content_type` / `auth_permission` | `api.cellvalue` (id 13) + 4 permisos huérfanos |
| 11 | `curl http://localhost:8000/api/` | `200` |
| 12 | Ciclo completo en SQLite descartable | Alta hasta `0014` OK; `0014→0013` deja 0 filas; `0014→0012` repuebla 2/2 celdas con valores `'hola'` y `42` |

> Nota: los comandos 2–6 se ejecutaron con bind mount del árbol de trabajo porque la imagen en ejecución no contiene `0014` (H-2). Los comandos terminan con exit code 1 por la advertencia `staticfiles.W004` (H-10), no por errores de migración.

### 8.1 Prueba de ciclo completo (SQLite descartable)

Base `/tmp/tlaix_0014_scratch.sqlite3` dentro de un contenedor efímero; no se tocó PostgreSQL compartido.

```text
1. migrate (todas las apps)            → api.0014_delete_cellvalue ... OK
2. migrate api 0012                    → Unapplying 0014 OK / Unapplying 0013 OK
3. seed 2 CellValue                    → CELL_VALUES_SEEDED: 2
4. migrate api 0014                    → Applying 0013 OK / Applying 0014 OK
5. post-0014                           → CELL_VALUES_EXISTS: False
                                         RTD_COUNT: 1
                                         RTD_DATA: [('r1','tab1',{'c1':'hola','c2':42})]
6. migrate api 0013                    → CELL_VALUES_AFTER_0013: 0
7. migrate api 0012                    → CELL_VALUES_AFTER_0012: 2
                                         ROWS: [('c1','hola',None), ('c2',None,42)]
```

Conclusión: el grafo es reversible; la reversión de `0014` por sí sola no recupera datos.

---

## 9. Criterios de aceptación del encargo

| # | Criterio | Estado |
|---|---|---|
| 1 | Verificar DDL de `sqlmigrate api 0014` (`DROP TABLE ... CASCADE`) | ✅ Verificado |
| 2 | Analizar locks (`ACCESS EXCLUSIVE`), dependencia `0013` y orden con `entrypoint.sh` | ✅ Verificado (§4 H-6/H-8, §5) |
| 3 | Dictaminar sobre respaldo obligatorio y limitación de rollback (tabla vacía) | ✅ Dictaminado (§6, §4 H-7) |
| 4 | Confirmar que ninguna otra app/migración depende de `cell_values` | ✅ Confirmado (§5.1) |
| 5 | Emitir veredicto y recomendaciones operativas | ✅ Aprobada con condiciones |

---

## 10. Condiciones para aprobar el despliegue

1. **Versionar** `0014_delete_cellvalue.py` y el cambio de `models.py` en el mismo commit; verificar que `main` los contiene tras el merge.
2. **Respaldo `pg_dump -Fc` verificado** (listado legible + presencia de `cell_values` y `row_tab_data` + checksum) antes de cualquier aplicación en un entorno persistente.
3. **Pre-flight obligatorio**: `cell_values` existe, `0014` no está aplicada, sin FKs entrantes ni vistas dependientes.
4. **Verificar completitud** de `row_tab_data` contra `cell_values` antes del `DROP` (§7, Fase 2).
5. **Aplicar `0014` como one-off explícito** con `lock_timeout`, no confiar en el `migrate` automático de `entrypoint.sh`.
6. **Rebuild de la imagen** y verificación sobre la imagen nueva (la actual está desincronizada).
7. **Rollback documentado** con las tres variantes y su semántica; prohibido prometer recuperación de datos con `migrate api 0013`.

Cumplidas 1–7, la migración es segura para producción dentro de una ventana breve de despliegue.

---

## 11. Documentación actualizada y responsables

| Documento | Acción | Responsable |
|---|---|---|
| `docs/reports/2026-11-08-auditoria-migracion-0014.md` | Creado (este reporte) | `db-migration-guard` |
| `docs/plans/2026-11-08-0014-delete-cellvalue-y-merge-main.md` | Marcar tarea 3 completada; reflejar que `0014` ya está aplicada en local | `orchestrator` |
| `docs/ops/2026-11-08-aplicacion-0014-local.md` | Registrar la aplicación local, la ausencia de respaldo y el rebuild pendiente | `docker-ops` |
| `docs/qa/2026-11-08-regresion-0014.md` | QA sobre la imagen reconstruida | `qa` |
| `SYSTEM_API_SPECIFICATION.md` | Retirar `CellValue` del catálogo y del diagrama | `backend` |
| `TODO.md` | Marcar fase Contract | `orchestrator` |

---

## 12. Riesgo residual aceptado

- **Pérdida de datos en desarrollo:** `cell_values` ya fue eliminada sin respaldo. Solo es recuperable de forma derivada desde `row_tab_data`; se acepta por tratarse de un entorno de desarrollo.
- **Ventana de bloqueo:** milisegundos en condiciones normales; puede extenderse si hay transacciones largas. Mitigado con `lock_timeout` y ventana breve.
- **Divergencia de `0013` entre entornos:** no detectable sin el pre-flight del §7, Fase 1. Es el riesgo con mayor probabilidad de causar un fallo de despliegue.
