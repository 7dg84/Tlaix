# Auditoría de Migración de Esquema — 0013_rowtabdata_migration

- **Fecha:** 2026-11-06
- **Auditor:** `db-migration-guard`
- **Plan auditado:** `docs/plans/2026-11-06-row-tab-data-migration.md`
- **Migración evaluada:** `backend/api/migrations/0013_rowtabdata_migration.py`
- **Modelos afectados:** `backend/api/models.py` (`CellValue` eliminado, `RowTabData` incorporado)
- **Entorno:** PostgreSQL 15 (Docker) y SQLite (desarrollo/test)

---

## 1. Resumen Ejecutivo (Dictamen)

**DICTAMEN: APROBADA CON CONDICIONES (REQUIERE AJUSTES PREVIOS A PRODUCCIÓN)**

La migración `0013_rowtabdata_migration` cumple exitosamente con el objetivo arquitectónico de sustituir el modelo EAV disperso `CellValue` por `RowTabData` (agrupamiento por fila y pestaña en formato `JSONB`), reduciendo el volumen de registros en un orden de magnitud y optimizando las consultas de la vista de cuadrícula (`TabView`).

Sin embargo, **no es apta para su aplicación directa e inadvertida en producción** tal como está implementada debido a:
1. **Destrucción inmediata e irreversible de la fuente (`DeleteModel(CellValue)`) en la misma transacción**: Al ejecutarse automáticamente en `entrypoint.sh`, destruye la tabla `cell_values` en el mismo despliegue, impidiendo cualquier rollback de código si la nueva versión de la aplicación presentara regresiones.
2. **Índices duplicados y redundantes en PostgreSQL**: Se generan dos índices idénticos sobre `(row_id, tab_id)` y dos índices idénticos sobre `(tab_id)`.
3. **Riesgo de agotamiento de memoria (OOM)**: Acumula en memoria RAM la totalidad de celdas de la base de datos en un diccionario Python global antes de la inserción por lotes.
4. **Fragilidad de tipos y mutación en la función de rollback (`reverse_transfer`)**: Falta de captura de excepciones en enteros/flotantes y conversión de `None` a `False` en casillas booleanas.

A continuación se detalla la evidencia técnica, la evaluación de riesgos y el plan de mitigación en fases para `backend`.

---

## 2. Migraciones Revisadas

| App | Archivo de Migración | Operaciones Detectadas | Tipo de Operación |
|---|---|---|---|
| `api` | `0013_rowtabdata_migration.py` | `CreateModel(RowTabData)`<br>`AddIndex(row, tab)`<br>`AddIndex(tab)`<br>`AlterUniqueTogether(row, tab)`<br>`RunPython(transfer, reverse)`<br>`DeleteModel(CellValue)` | Estructural (DDL)<br>Transferencia de datos (DML)<br>Destructiva (`DROP TABLE`) |

### DDL Generado por PostgreSQL 15 (`python manage.py sqlmigrate api 0013`)

```sql
BEGIN;
-- 1. Creación de tabla destino
CREATE TABLE "row_tab_data" (
    "id" varchar(50) NOT NULL PRIMARY KEY,
    "data" jsonb NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "row_id" varchar(50) NOT NULL,
    "tab_id" varchar(50) NOT NULL
);

-- 2. Índices manuales
CREATE INDEX "row_tab_dat_row_id_3462da_idx" ON "row_tab_data" ("row_id", "tab_id");
CREATE INDEX "row_tab_dat_tab_id_043d76_idx" ON "row_tab_data" ("tab_id");

-- 3. Constraint de unicidad
ALTER TABLE "row_tab_data" ADD CONSTRAINT "row_tab_data_row_id_tab_id_0d524843_uniq" UNIQUE ("row_id", "tab_id");

-- 4. Ejecución Python (RunPython: transferencia de celdas a JSONB)
-- THIS OPERATION CANNOT BE WRITTEN AS SQL

-- 5. Eliminación destructiva de la tabla origen
DROP TABLE "cell_values" CASCADE;

-- 6. Llaves foráneas e índices automáticos de Django
ALTER TABLE "row_tab_data" ADD CONSTRAINT "row_tab_data_row_id_d79523fb_fk_rows_id" 
    FOREIGN KEY ("row_id") REFERENCES "rows" ("id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "row_tab_data" ADD CONSTRAINT "row_tab_data_tab_id_d03e51a5_fk_tabs_id" 
    FOREIGN KEY ("tab_id") REFERENCES "tabs" ("id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "row_tab_data_id_b1433e6e_like" ON "row_tab_data" ("id" varchar_pattern_ops);
CREATE INDEX "row_tab_data_row_id_d79523fb" ON "row_tab_data" ("row_id");
CREATE INDEX "row_tab_data_row_id_d79523fb_like" ON "row_tab_data" ("row_id" varchar_pattern_ops);
CREATE INDEX "row_tab_data_tab_id_d03e51a5" ON "row_tab_data" ("tab_id");
CREATE INDEX "row_tab_data_tab_id_d03e51a5_like" ON "row_tab_data" ("tab_id" varchar_pattern_ops);
COMMIT;
```

---

## 3. Hallazgos por Severidad

### ALTO

#### H-1 · Eliminación destructiva no escalonada de la tabla `cell_values` (`DROP TABLE`)

- **Archivo/líneas:** `backend/api/migrations/0013_rowtabdata_migration.py:149-151`
- **Descripción:** La migración define `migrations.DeleteModel(name='CellValue')` inmediatamente después de `RunPython`. Al ejecutarse, PostgreSQL emite `DROP TABLE "cell_values" CASCADE;` en la misma transacción.
- **Evidencia:** 
  - En `backend/entrypoint.sh`, el contenedor ejecuta automáticamente `python manage.py migrate --noinput` en cada inicio.
  - Al destruirse `cell_values`, se elimina cualquier posibilidad de "rollback rápido de código" (volver a la imagen de Docker anterior si surgen bugs o regresiones en la API de `RowTabData`).
  - Si la imagen anterior arranca, el backend fallará inmediatamente con errores 500 al intentar acceder a una tabla inexistente.
- **Impacto:** Pérdida definitiva de los datos de origen una vez completada la migración; imposibilidad de operar bajo esquemas de despliegue blue/green o canary.
- **Propuesta de corrección (`backend`):**
  - Desacoplar la eliminación en un patrón **Expand & Contract**:
    1. **Fase 1 (0013):** Crear `RowTabData` y migrar datos históricos. Dejar `CellValue` existente (marcado como obsoleto en documentación).
    2. **Fase 2:** Despliegue de la versión de software que lee y escribe exclusivamente sobre `RowTabData`.
    3. **Fase 3 (0014 - diferida):** Una vez verificado el comportamiento estable en producción tras 24–48 horas y confirmado un respaldo (dump), aplicar una migración exclusiva `0014_delete_cellvalue.py`.
- **Agente responsable:** `backend` / `docker-ops`

---

### MEDIO

#### H-2 · Acumulación ilimitada en memoria RAM de Python durante la migración de datos

- **Archivo/líneas:** `backend/api/migrations/0013_rowtabdata_migration.py:16-55`
- **Descripción:** Aunque `CellValue.objects.all().iterator(chunk_size=2000)` utiliza un cursor en BD para no desbordar el driver de PostgreSQL, el bucle acumula todas las celdas en un único diccionario en memoria `row_tab_map = {}`. Posteriormente, la lista por comprensión `new_records` instancia todos los objetos del modelo `RowTabData` en memoria de manera simultánea antes de ejecutar `bulk_create`.
- **Evidencia:**
  ```python
  row_tab_map = {}
  for cell in CellValue.objects.all().iterator(chunk_size=2000):
      ...
      row_tab_map[key][str(cell.column_id)] = val  # Acumula toda la BD en RAM

  new_records = [
      RowTabData(id=str(uuid.uuid4()), row_id=row_id, tab_id=tab_id, data=data)
      for (row_id, tab_id), data in row_tab_map.items() # Todos los objetos instanciados simultáneamente
  ]
  ```
- **Impacto:** En tablas con cientos de miles de celdas (patrón EAV de Tlaix con alta concurrencia o tablas con muchas columnas y filas), el proceso Python superará los límites de memoria del contenedor y el kernel ejecutará un `OOM killer` (`SIGKILL`), dejando el despliegue abortado.
- **Propuesta de corrección (`backend`):**
  - Iterar por pestañas (`Tab.objects.all()`) o por lotes de filas (`Row`), persistiendo los `RowTabData` de cada grupo y vaciando el buffer de memoria.
  - Alternativamente, si se ejecuta en PostgreSQL 15, realizar la agregación nativa mediante SQL directo (`INSERT INTO row_tab_data ... SELECT ... jsonb_object_agg(...)`), eliminando por completo la carga de datos hacia el intérprete de Python.
- **Agente responsable:** `backend`

#### H-3 · Fragilidad de conversión y pérdida de valores nulos en el Rollback (`reverse_transfer`)

- **Archivo/líneas:** `backend/api/migrations/0013_rowtabdata_migration.py:84-89`
- **Descripción:** 
  1. Las conversiones `int(val)` y `float(val)` asumen que si `val is not None`, el valor es estrictamente parseable. Si un registro en JSON almacena una cadena vacía `""` o texto malformado, la ejecución fallará con `ValueError: invalid literal for int()`. A diferencia de `date`, no hay bloque de captura de excepciones.
  2. Para columnas booleanas (`checkbox`), se utiliza `bool(val)`. En la tabla `CellValue`, el campo era `value_bool = models.BooleanField(default=False, null=True)`. Si `val` es `None`, `bool(None)` lo transforma en `False`, destruyendo la distinción entre un valor no especificado (`NULL`) y una casilla desmarcada explícitamente (`False`).
- **Evidencia:**
  ```python
  elif col_type == 'int':
      cell_kwargs['value_int'] = int(val) if val is not None else None  # int("") -> ValueError
  elif col_type == 'checkbox':
      cell_kwargs['value_bool'] = bool(val)  # bool(None) -> False (mutación de datos)
  ```
- **Impacto:** Fallo fatal al intentar ejecutar `python manage.py migrate api 0012` si existen celdas numéricas con valores vacíos; alteración semántica de datos en columnas de tipo checkbox al revertir.
- **Propuesta de corrección (`backend`):**
  1. Envolver conversiones de `int` y `float` en `try...except (ValueError, TypeError)` asignando `None` en caso de error.
  2. Ajustar el booleano:
     ```python
     elif col_type == 'checkbox':
         cell_kwargs['value_bool'] = bool(val) if val is not None else None
     ```
- **Agente responsable:** `backend`

---

### BAJO

#### H-4 · Creación de índices btree redundantes e idénticos en PostgreSQL

- **Archivo/líneas:** 
  - `backend/api/models.py:89-93`
  - `backend/api/migrations/0013_rowtabdata_migration.py:133-144`
- **Descripción:** La tabla `row_tab_data` genera 9 índices en total, de los cuales 2 son completamente redundantes:
  1. **Duplicado sobre `(row_id, tab_id)`**: `unique_together = [['row', 'tab']]` crea automáticamente un índice único btree `row_tab_data_row_id_tab_id_0d524843_uniq`. A la par, `models.Index(fields=['row', 'tab'])` crea `row_tab_dat_row_id_3462da_idx`. Ambos son btree sobre las mismas dos columnas.
  2. **Duplicado sobre `(tab_id)`**: `tab = models.ForeignKey(Tab)` genera automáticamente el índice `row_tab_data_tab_id_d03e51a5`. A la par, `models.Index(fields=['tab'])` crea `row_tab_dat_tab_id_043d76_idx`. Ambos son btree sobre `tab_id`.
- **Evidencia (inspección de catálogo PostgreSQL `\d row_tab_data`):**
  ```text
  Indexes:
      "row_tab_data_pkey" PRIMARY KEY, btree (id)
      "row_tab_dat_row_id_3462da_idx" btree (row_id, tab_id)                  <-- DUPLICADO
      "row_tab_data_row_id_tab_id_0d524843_uniq" UNIQUE CONSTRAINT, btree (row_id, tab_id)
      "row_tab_dat_tab_id_043d76_idx" btree (tab_id)                          <-- DUPLICADO
      "row_tab_data_tab_id_d03e51a5" btree (tab_id)
      "row_tab_data_id_b1433e6e_like" btree (id varchar_pattern_ops)
      "row_tab_data_row_id_d79523fb" btree (row_id)
      "row_tab_data_row_id_d79523fb_like" btree (row_id varchar_pattern_ops)
      "row_tab_data_tab_id_d03e51a5_like" btree (tab_id varchar_pattern_ops)
  ```
- **Impacto:** Sobrecarga innecesaria de I/O en disco durante escrituras (`INSERT` y `UPDATE`), mayor consumo de memoria caché en el motor de base de datos (`shared_buffers`) y espacio en disco desperdiciado.
- **Propuesta de corrección (`backend`):**
  En `backend/api/models.py`, retirar `models.Index(fields=['row', 'tab'])` y `models.Index(fields=['tab'])` de la lista `indexes`. Las consultas por `(row, tab)` utilizarán el índice único de la constraint, y las consultas por `tab` utilizarán el índice automático del ForeignKey.
- **Agente responsable:** `backend`

---

### INFORMATIVO

#### H-5 · Descarte silencioso de celdas asociadas a columnas no encontradas

- **Archivo/líneas:** `backend/api/migrations/0013_rowtabdata_migration.py:19-21`
- **Descripción:** Si en la base de datos existieran registros de `CellValue` apuntando a `column_id` inexistentes (por ejemplo, remanentes de pruebas o inconsistencias históricas sin integridad referencial limpia), el código hace `continue` silencioso sin emitir advertencia.
- **Impacto:** Pérdida no notificada de registros huérfanos.
- **Propuesta de corrección (`backend`):** Agregar una cuenta de registros ignorados e imprimir un mensaje de log con `schema_editor.connection` o `print` durante la migración si `ignored_count > 0`.
- **Agente responsable:** `backend`

---

## 4. Análisis de Bloqueos (Locking) en PostgreSQL 15

| Objeto / Tabla | Nivel de Bloqueo | ¿Bloquea Lecturas? | ¿Bloquea Escrituras? | Duración Estimada |
|---|---|---|---|---|
| `row_tab_data` (nueva) | `EXCLUSIVE` | No (tabla no existía) | No | Instantánea |
| `cell_values` (en `RunPython`) | `ACCESS SHARE` | No | No | Minutos (según volumen de filas) |
| `cell_values` (en `DeleteModel`) | `ACCESS EXCLUSIVE` | **SÍ** | **SÍ** | Hasta fin de transacción |
| `rows` (en `ADD CONSTRAINT FK`) | `SHARE ROW EXCLUSIVE` | No | **SÍ** | Milisegundos |
| `tabs` (en `ADD CONSTRAINT FK`) | `SHARE ROW EXCLUSIVE` | No | **SÍ** | Milisegundos |

**Evaluación de concurrencia:**
Dado que Django ejecuta las migraciones dentro de una transacción única (`atomic=True`), el bloqueo `ACCESS EXCLUSIVE` sobre `cell_values` y los bloqueos `SHARE ROW EXCLUSIVE` sobre `rows` y `tabs` se mantienen activos durante toda la fase de inserción masiva de `RunPython`. 
Si la base de datos cuenta con más de 100,000 celdas, este bloqueo detendrá temporalmente escrituras de filas concurrentes en el sistema.

---

## 5. Análisis de Reversibilidad (Rollback)

Se verificó el DDL inverso mediante el comando:
```bash
python manage.py sqlmigrate --backwards api 0013_rowtabdata_migration
```

### Comportamiento del Rollback
1. **Re-creación de esquema:** Django genera correctamente la sentencia `CREATE TABLE "cell_values"` con sus campos originales (`value_text`, `value_int`, `value_float`, `value_bool`, `value_json`, `value_date`).
2. **Re-población de datos (`reverse_transfer`):** Itera en bloques de 1,000 sobre `RowTabData` y desglosa el diccionario `data` en filas individuales de `CellValue`.
3. **Pérdida de identificadores primarios originales:** El rollback genera nuevos UUIDs (`str(uuid.uuid4())`) para cada celda re-creada. Dado que ninguna tabla externa posee FK hacia `cell_values`, no se produce ruptura de integridad referencial.
4. **Vulnerabilidad detectada:** Como se especificó en el hallazgo **H-3**, si existen datos numéricos vacíos o cadenas no parseables en `rtd.data`, el rollback abortará por `ValueError` dejando la base de datos en estado inconsistente.

---

## 6. Plan Recomendado de Despliegue en Fases (Zero-Downtime)

Para mitigar los riesgos identificados, se instruye a `backend` y `docker-ops` a implementar el siguiente plan de migración en fases:

### Paso 1: Ajuste de la Migración 0013 (Fase Expand)
1. Modificar `backend/api/models.py`:
   - Mantener temporalmente el modelo `CellValue` (marcado como `@deprecated`) o remover los índices redundantes de `RowTabData`.
2. Modificar `backend/api/migrations/0013_rowtabdata_migration.py`:
   - **Retirar `migrations.DeleteModel(name='CellValue')`** de las operaciones de `0013`. La tabla `cell_values` permanecerá intacta en base de datos.
   - Corregir el manejo de excepciones en `reverse_transfer` (`int`, `float`, y chequeo de `None` en `checkbox`).
   - Optimizar el consumo de RAM en `transfer_cell_values_to_row_tab_data` (procesando por pestañas o chunks de filas).
   - Eliminar las operaciones `AddIndex` redundantes que duplican la constraint de unicidad y el FK.

### Paso 2: Ejecución y Validación en Entorno de Pruebas
1. Ejecutar migración:
   ```bash
   python manage.py migrate api 0013
   ```
2. Verificar recuento e integridad de registros:
   ```bash
   python manage.py shell -c "from api.models import RowTabData; print('RowTabData count:', RowTabData.objects.count())"
   ```
3. Probar rollback controlado:
   ```bash
   python manage.py migrate api 0012
   python manage.py migrate api 0013
   ```

### Paso 3: Despliegue a Producción
1. Generar backup obligatorio de PostgreSQL previo al despliegue:
   ```bash
   docker compose exec db pg_dump -U tlaix -d tlaix -F c -b -v -f /var/lib/postgresql/data/backup_pre_0013.dump
   ```
2. Desplegar el nuevo contenedor Django con el código que lee y escribe sobre `RowTabData`.
3. Validar el funcionamiento de la SPA, edición de celdas y reportes de asistencia.

### Paso 4: Fase Contract (Migración 0014 diferida)
Tras un periodo de observación de 24 a 48 horas sin incidencias:
1. Crear la migración destructiva `0014_delete_cellvalue.py` conteniendo únicamente:
   ```python
   operations = [
       migrations.DeleteModel(name='CellValue'),
   ]
   ```
2. Desplegar y aplicar la migración para liberar el espacio de almacenamiento de la tabla antigua.

---

## 7. Comandos de Verificación Ejecutados

1. **Chequeo de cambios de modelo pendientes:**
   ```bash
   docker compose run --rm -v "${PWD}/backend:/app" django python manage.py makemigrations --check --dry-run
   # Resultado: No changes detected (Esquema sincronizado con migraciones)
   ```
2. **Generación DDL hacia adelante:**
   ```bash
   docker compose run --rm -v "${PWD}/backend:/app" django python manage.py sqlmigrate api 0013_rowtabdata_migration
   ```
3. **Generación DDL hacia atrás (rollback):**
   ```bash
   docker compose run --rm -v "${PWD}/backend:/app" django python manage.py sqlmigrate --backwards api 0013_rowtabdata_migration
   ```
4. **Inspección de catálogo de índices en PostgreSQL 15:**
   ```bash
   docker compose exec db psql -U tlaix -d tlaix -c "\d row_tab_data"
   ```
5. **Auditoría de volumen de datos en desarrollo:**
   - Tablas: 4
   - Pestañas: 6
   - Columnas: 34
   - Filas: 710
   - RowTabData: 28 registros consolidados.

---

## 8. Asignación de Tareas

- **Agente `backend`**:
  - Eliminar los dos índices redundantes de `RowTabData` en `models.py` y en la migración.
  - Corregir el manejo de tipos y preservación de `None` en `reverse_transfer`.
  - Desacoplar `DeleteModel(CellValue)` de la migración `0013` (posponer a migración `0014`).
  - Optimizar la acumulación en memoria en `transfer_cell_values_to_row_tab_data`.
- **Agente `docker-ops`**:
  - Asegurar la toma del dump de base de datos antes de reiniciar el contenedor con la nueva migración en producción.
- **Agente `test-writer`**:
  - Actualizar los tests en `backend/api/tests.py` y `backend/asistencia/tests.py` que aún intentan importar el modelo retirado `CellValue`.
