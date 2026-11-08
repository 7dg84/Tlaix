# Rebuild y reinicio de `django` — Introducción del modelo `RowTabData` y migración 0013

- **Fecha:** 2026-11-06
- **Rol:** docker-ops
- **Entorno:** Local (Windows / Docker Compose)
- **Cambio:** Integración del modelo `RowTabData` y aplicación de la migración de datos y esquema `backend/api/migrations/0013_rowtabdata_migration.py`.
- **Sin variables de entorno nuevas, sin cambios en `docker-compose.yml`.**

---

## 1. Resumen de la Operación

Debido a que el contenedor de `django` en el entorno local no monta el código de `./backend` mediante bind mounts (el código fuente se empaqueta en la imagen durante el build vía `COPY . /app/` en `backend/Dockerfile`), la adición del modelo `RowTabData` y su archivo de migración `0013_rowtabdata_migration.py` requirió:

1. Reconstrucción de la imagen Docker de `django` (`docker compose build django`).
2. Recreación y reinicio del contenedor del servicio (`docker compose up -d django`).
3. Ejecución automática de las migraciones vía `backend/entrypoint.sh` (`python manage.py migrate --noinput`).
4. Verificación del estado de las migraciones y disponibilidad del servicio Gunicorn.

---

## 2. Comandos Ejecutados

```powershell
# 1. Validación de sintaxis y variables de Docker Compose
docker compose config

# 2. Reconstrucción de la imagen django
docker compose build django

# 3. Recreación y levantamiento del servicio django en segundo plano
docker compose up -d django

# 4. Verificación de migraciones aplicadas
docker compose exec -T django python manage.py showmigrations api

# 5. Comprobación del estado del servicio y conteo de datos migrados
docker compose exec -T django python manage.py check
docker compose exec -T django python manage.py shell -c "from api.models import RowTabData; print('RowTabData count:', RowTabData.objects.count())"

# 6. Verificación de respuesta HTTP contra el endpoint API local
curl.exe -I http://localhost:8000/api/
```

---

## 3. Validación y Resultados

### 3.1 Build de Imagen
El comando `docker compose build django` finalizó exitosamente sin errores de compilación ni de dependencias, empaquetando el contexto actualizado de `./backend` en la imagen `tlaix-django:latest`.

### 3.2 Inicio y Logs de Gunicorn
El contenedor `tlaix-django-1` fue recreado (`Recreate` / `Started`). Los logs confirman que `entrypoint.sh` ejecutó `migrate` y `collectstatic`, e inició Gunicorn en el puerto 8000:
```text
[INFO] Starting gunicorn 23.0.0
[INFO] Listening at: http://0.0.0.0:8000 (1)
[INFO] Using worker: sync
[INFO] Booting worker with pid: 10
```

### 3.3 Verificación de Migraciones (`showmigrations`)
```text
api
 [X] 0001_initial
 [X] 0002_alter_row_data
 [X] 0003_alter_row_data
 [X] 0004_alter_row_data
 [X] 0005_rename_table_row_table_id
 [X] 0006_column_tab_id
 [X] 0007_rename_table_column_table_id_and_more
 [X] 0008_alter_row_options_rename_tab_id_column_tab_and_more
 [X] 0009_alter_table_name
 [X] 0010_alter_tab_label
 [X] 0011_alter_tab_label_alter_column_unique_together_and_more
 [X] 0012_cellvalue_value_date_alter_column_type
 [X] 0013_rowtabdata_migration
```

### 3.4 Conteo de Registros en `RowTabData`
Se ejecutó la consulta en el shell de Django:
```text
RowTabData count: 28
```
Confirmando que la función de migración de datos `transfer_cell_values_to_row_tab_data` pobló adecuadamente la tabla en PostgreSQL a partir de los datos existentes en `CellValue`.

### 3.5 Respuesta HTTP
Llamada a `http://localhost:8000/api/`:
```text
HTTP/1.1 200 OK
Server: gunicorn
Content-Type: application/json
Vary: Accept, origin
Allow: GET, HEAD, OPTIONS
```

---

## 4. Impacto Operativo

| Aspecto | Detalle |
| --- | --- |
| **Downtime** | ~2 a 4 segundos durante la recreación del contenedor `tlaix-django-1`. |
| **Migraciones** | Migración `0013_rowtabdata_migration` crea la tabla `api_rowtabdata` y migra registros existentes de celdas por fila y pestaña a formato JSON consolidado. |
| **Variables de entorno** | Ninguna variable nueva o modificada. |
| **Puertos y Volúmenes** | Sin cambios: puerto `8000:8000` y volumen `django_media`. |
| **Servicios Dependientes** | La base de datos `db` (Postgres 15) y el frontend `react` permanecieron operativos de forma continua. |

---

## 5. Plan de Rollback

Si se requiriera revertir el despliegue local:

1. **Revertir la migración en base de datos**:
   ```powershell
   docker compose exec -T django python manage.py migrate api 0012_cellvalue_value_date_alter_column_type
   ```
2. **Revertir cambios de código o descartar la migración 0013**:
   ```powershell
   git checkout -- backend/api/migrations/0013_rowtabdata_migration.py backend/api/models.py
   ```
3. **Reconstruir la imagen y reiniciar**:
   ```powershell
   docker compose build django
   docker compose up -d django
   ```
4. **Verificar rollback**:
   ```powershell
   docker compose exec -T django python manage.py showmigrations api
   ```
