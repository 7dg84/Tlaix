# Rebuild de `django` y verificación local de la migración 0014 (`DeleteModel CellValue`)

- **Fecha:** 2026-11-08
- **Rol:** docker-ops
- **Entorno:** Local (Windows / Docker Compose), PostgreSQL 15 en `tlaix-db-1`
- **Cambio:** Reconstrucción de la imagen `django` para alinear el runtime con la fase Contract (`backend/api/models.py` sin `CellValue` y `backend/api/migrations/0014_delete_cellvalue.py` incluida en la imagen).
- **Alcance:** solo build, recreación del servicio y verificación de solo lectura. **No se modificó código, migraciones, `docker-compose.yml`, Dockerfiles, `entrypoint.sh`, `nginx.conf` ni `.env`.** No se ejecutaron operaciones destructivas sobre la base.
- **Referencias:** `docs/plans/2026-11-08-0014-delete-cellvalue-y-merge-main.md` (tarea 5), `docs/reports/2026-11-08-auditoria-migracion-0014.md` (hallazgos H-1, H-2, H-7, H-10).

---

## 1. Resumen de la operación

La base PostgreSQL local ya tenía aplicada `0014_delete_cellvalue` (registro en `django_migrations` del 2026-11-09 01:53:53.959+00) y `cell_values` ya no existía. Sin embargo, la imagen `tlaix-django:latest` en ejecución se había construido antes de crear la migración: solo contenía hasta `0013` y seguía definiendo `class CellValue` en `/app/api/models.py:95` (hallazgo H-2 de la auditoría).

Como `docker-compose.yml` construye `django` desde `./backend` sin bind mount del código, el runtime no podía ver `0014` ni reflejar el modelo retirado. La operación consistió en:

1. Capturar la evidencia del desfase imagen ↔ base (pre-check).
2. Reconstruir la imagen con `docker compose build django`.
3. Recrear el servicio con `docker compose up -d django` (el `migrate` de `entrypoint.sh` resultó no-op: `No migrations to apply`).
4. Verificar migraciones, esquema, datos, contenido de la imagen y respuesta HTTP.

**No se re-aplicó `0014`**: ya estaba registrada en la base antes de esta operación; este run solo sincronizó el código desplegado.

---

## 2. Estado de partida (pre-check, solo lectura)

Antes del rebuild se confirmó el desfase descrito en H-2:

```text
$ docker compose exec -T django sh -c "ls /app/api/migrations/ | grep -E '^001[34]' ; grep -n 'class CellValue\|class RowTabData' /app/api/models.py"
0013_rowtabdata_migration.py
79:class RowTabData(models.Model):
95:class CellValue(models.Model)
```

```text
$ docker compose exec -T db psql -U tlaix -d tlaix \
    -c "SELECT to_regclass('public.cell_values') AS cell_values;" \
    -c "SELECT count(*) AS row_tab_data FROM row_tab_data;" \
    -c "SELECT name, applied FROM django_migrations WHERE app='api' AND name LIKE '0013%' OR app='api' AND name LIKE '0014%' ORDER BY id;"
 cell_values
-------------
 NULL

 row_tab_data
-------------
          30

           name            |            applied
---------------------------+-------------------------------
 0013_rowtabdata_migration | 2026-11-07 02:03:16.719773+00
 0014_delete_cellvalue     | 2026-11-09 01:53:53.959+00
```

```text
$ docker compose config --quiet
compose config OK
```

---

## 3. Comandos ejecutados

```powershell
# 1. Validación de sintaxis y resolución de variables de Compose
docker compose config --quiet

# 2. Rebuild de la imagen django con el árbol de trabajo actual
docker compose build django

# 3. Recreación del contenedor (sin tocar db ni react)
docker compose up -d django

# 4. Verificación de migraciones y coherencia modelo ↔ migraciones
docker compose exec -T django python manage.py showmigrations api
docker compose exec -T django python manage.py makemigrations --check --dry-run

# 5. Verificación de esquema y datos en PostgreSQL (solo lectura)
docker compose exec -T db psql -U tlaix -d tlaix `
  -c "SELECT to_regclass('public.cell_values') AS cell_values;" `
  -c "SELECT count(*) AS row_tab_data FROM row_tab_data;" `
  -c "SELECT count(DISTINCT tab_id) AS pestanas, count(*) FILTER (WHERE data <> '{}'::jsonb) AS filas_con_datos FROM row_tab_data;"

# 6. Verificación del contenido de la imagen nueva
docker compose exec -T django sh -c "ls -l /app/api/migrations/0014_delete_cellvalue.py; grep -n 'class CellValue' /app/api/models.py || echo 'NO CellValue'"

# 7. Verificación HTTP
curl.exe -s -I http://localhost:8000/api/
```

---

## 4. Validación y resultados

### 4.1 Build

`docker compose build django` finalizó correctamente (capas cacheadas salvo `COPY . /app/`, `chmod` y export). Imagen resultante:

```text
tlaix-django:latest
ID/manifest: sha256:bac7891c2c588919f97c19e7bfc6bc626233407b8aa54d3963465a1e98f42ea3
Creada:      2026-11-09T02:24:00.363347913Z
```

### 4.2 Recreación del contenedor y logs

```text
 Container tlaix-db-1 Running
 Container tlaix-django-1 Recreate
 Container tlaix-django-1 Recreated
 Container tlaix-django-1 Starting
 Container tlaix-django-1 Started
```

Logs relevantes del arranque:

```text
WARNINGS:
?: (staticfiles.W004) The directory '/app/static' in the STATICFILES_DIRS setting does not exist.
Operations to perform:
  Apply all migrations: admin, api, asistencia, auth, authtoken, contenttypes, guardian, personal, sessions, students
Running migrations:
  No migrations to apply.
...
165 static files copied to '/app/staticfiles'.
[2026-11-09 02:24:24 +0000] [1] [INFO] Starting gunicorn 23.0.0
[2026-11-09 02:24:24 +0000] [1] [INFO] Listening at: http://0.0.0.0:8000 (1)
[2026-11-09 02:24:24 +0000] [1] [INFO] Using worker: sync
[2026-11-09 02:24:24 +0000] [1] [INFO] Booting worker with pid: 8
```

- Sin crash-loop: el contenedor permanece `Up` y Gunicorn arrancó el worker.
- `No migrations to apply` confirma que `0014` ya estaba aplicada y que el arranque no ejecutó DDL.

### 4.3 Migraciones (`showmigrations api`)

```text
api
 [X] 0001_initial
 ...
 [X] 0012_cellvalue_value_date_alter_column_type
 [X] 0013_rowtabdata_migration
 [X] 0014_delete_cellvalue
```

`python manage.py makemigrations --check --dry-run` → `No changes detected` (grafo de migraciones sincronizado con `models.py`).

### 4.4 Esquema y datos en PostgreSQL

```text
 cell_values
-------------
 NULL

 row_tab_data
-------------
          30

 pestanas | filas_con_datos
----------+-----------------
        6 |              30
```

- `cell_values` no existe (`to_regclass` → `NULL`).
- `row_tab_data` conserva **30 registros** (6 pestañas), todos con JSON no vacío (`data <> '{}'`), 0 NULL y 0 objetos vacíos.
- Nota: la auditoría citaba 27 filas con datos; la medición con `data <> '{}'::jsonb` da 30/30. La diferencia es de criterio de conteo, no de estado: el total de 30 registros se mantiene intacto tras el rebuild.

### 4.5 Contenido de la imagen nueva

```text
-rwxr-xr-x 1 root root 552 Nov  9 01:51 /app/api/migrations/0014_delete_cellvalue.py
NO CellValue
79:class RowTabData(models.Model):
```

- La imagen incluye `0014_delete_cellvalue.py`.
- `models.py` dentro del contenedor ya no define `CellValue` (solo `RowTabData`).

### 4.6 Respuesta HTTP

```text
$ curl.exe -s -I http://localhost:8000/api/
HTTP/1.1 200 OK
Server: gunicorn
Date: Mon, 09 Nov 2026 02:25:16 GMT
Content-Type: application/json
Vary: Accept, origin
Allow: GET, HEAD, OPTIONS
X-Frame-Options: DENY
Content-Length: 46
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Cross-Origin-Opener-Policy: same-origin
```

### 4.7 Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | `docker compose build django` exitoso | ✅ |
| 2 | `docker compose up -d django` sin crash-loop; Gunicorn arriba | ✅ |
| 3 | `showmigrations api` marca `[X] 0014_delete_cellvalue` | ✅ |
| 4 | `cell_values` → `NULL`; `row_tab_data` conserva 30 registros | ✅ |
| 5 | `curl -I http://localhost:8000/api/` → `200` | ✅ |
| 6 | La imagen contiene `0014` y `models.py` sin `CellValue` | ✅ |

---

## 5. Impacto operativo

| Aspecto | Detalle |
|---|---|
| **Downtime** | Recreación del contenedor `tlaix-django-1`; unos segundos (arranque de Gunicorn a las 02:24:24 UTC). `db` y `react` no se recrearon. |
| **Migraciones** | `migrate` al arrancar: `No migrations to apply`. No se ejecutó DDL en este run; `0014` ya estaba aplicada desde el 2026-11-09 01:53:53 UTC. |
| **Variables de entorno** | Ninguna nueva ni modificada. |
| **Puertos y volúmenes** | Sin cambios: `8000:8000`, volumen `django_media`; `db` mantiene `5432:5432` y `pgdata`. `internal_net` sin cambios. |
| **Servicios dependientes** | `react` sigue sirviendo en el puerto 80; `db` permanece `Up`. |
| **Compatibilidad** | La imagen nueva opera exclusivamente sobre `RowTabData` (estado post-`0013`/`0014`). |

---

## 6. Observaciones y riesgos residuales

1. **`staticfiles.W004` persiste** (H-10): `/app/static` no existe en la imagen. En este rebuild, `showmigrations`, `check` y `makemigrations --check` terminaron con **exit code 0**; la advertencia solo aparece en stderr. Se documenta para pipelines que inspeccionen stderr.
2. **Respaldo previo ausente** (H-1): `0014` se aplicó antes de esta operación sin `pg_dump` verificable. Es un riesgo aceptado en desarrollo; cualquier aplicación en un entorno persistente exige el respaldo del §6 del reporte de auditoría.
3. **Imagen anterior no retenida**: `docker image ls -a --filter dangling=true` no muestra la imagen previa; fue reemplazada por el rebuild. Un rollback de imagen requiere reconstruir desde el commit anterior (ver §7).
4. **`/health` responde 404**: los logs muestran `Not Found: /health` por un sondeo externo. No existe esa ruta en Django; no afecta los criterios de aceptación ni el endpoint `/api/`.
5. **Sin cambios de infraestructura**: no fue necesario tocar `docker-compose.yml`, Dockerfiles, `entrypoint.sh`, `nginx.conf`, `.env` ni `.env.example`. `README.md` no requiere actualización por este cambio (no hay variables, puertos ni comandos nuevos).

---

## 7. Plan de rollback

Esta operación **no alteró datos ni esquema**. El rollback solo aplica si se decide revertir la entrega Contract completa.

### 7.1 Revertir solo el contenedor

```powershell
docker compose restart django
# o, si hiciera falta recrear desde la imagen actual:
docker compose up -d --force-recreate django
```

### 7.2 Revertir imagen/código

La imagen previa no está retenida localmente. Para volver al estado anterior:

```powershell
# Revertir el commit de la entrega (o hacer checkout del commit previo)
git revert <commit_de_0014>
docker compose build django
docker compose up -d django
```

> Advertencia: reintroducir `CellValue` en el código con `0014` aún registrada en `django_migrations` deja el modelo sin tabla y `makemigrations --check` reportará diferencias. Un rollback de código debe coordinarse con el rollback de base de datos.

### 7.3 Revertir base de datos (tres variantes, semántica distinta)

| Objetivo | Comando | Resultado |
|---|---|---|
| Recuperar solo el esquema | `docker compose exec -T django python manage.py migrate api 0013` | Recrea `cell_values` **vacía** (0 filas). No recupera datos. |
| Recuperar datos derivados | `docker compose exec -T django python manage.py migrate api 0012` | Repuebla `cell_values` desde `row_tab_data` (mejor esfuerzo; IDs nuevos; no fiel byte a byte). |
| Recuperación real | `pg_restore` de un respaldo `pg_dump -Fc` verificado | Estado exacto al momento del respaldo. **No existe respaldo local previo a `0014`** (H-1). |

### 7.4 Prohibiciones

- No ejecutar `docker compose down -v`, `docker volume rm`, `docker system prune` ni borrar `pgdata`/`django_media` sin autorización explícita.
- No prometer recuperación de datos con `migrate api 0013`: solo reconstruye la tabla vacía.

---

## 8. Documentación relacionada

- Plan: `docs/plans/2026-11-08-0014-delete-cellvalue-y-merge-main.md` (tarea 5).
- Auditoría: `docs/reports/2026-11-08-auditoria-migracion-0014.md` (H-1, H-2, H-7, H-10).
- Nota previa de rebuild: `docs/ops/2026-11-06-django-rebuild-rowtabdata.md`.
- QA posterior: `docs/qa/2026-11-08-regresion-0014.md` (a cargo de `qa`).
