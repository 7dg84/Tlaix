# Reinicio de `django` — soporte `PATCH` en detalle de filas, columnas y pestañas

- **Fecha:** 2026-11-05
- **Rol:** backend
- **Cambio:** `backend/api/urls.py` añade `'patch': 'partial_update'` a los mapas de `RowViewSet`, `ColumnViewSet` y `TabViewSet`.
- **Sin migraciones, sin variables de entorno nuevas, sin cambios en `docker-compose.yml`.**

## 1. Impacto operativo

| Aspecto | Impacto |
| --- | --- |
| Migraciones | Ninguna (`python manage.py migrate` no genera cambios). |
| Dependencias | Ninguna. |
| Base de datos | Ninguna modificación de esquema ni de datos. |
| Rendimiento | Ninguno: solo se expone una acción ya existente del `ModelViewSet`. |
| Despliegue | Requiere **reconstruir la imagen** `tlaix-django` (el código se copia con `COPY . /app/` en el `Dockerfile`; no hay bind mount). |

## 2. Por qué no basta con reiniciar en producción

`docker-compose.yml` no monta `backend/` como volumen: la imagen contiene una copia del código y Gunicorn no usa `--reload`. Por tanto:

- En **local**, para ver el cambio sin rebuild se copió el archivo al contenedor y se reinició:

  ```powershell
  docker cp backend/api/urls.py tlaix-django-1:/app/api/urls.py
  docker restart tlaix-django-1
  ```

  El reinicio vuelve a ejecutar `entrypoint.sh` (`migrate` + `collectstatic` + Gunicorn) y recarga el `URLconf`.

- En **cualquier entorno duradero**, el paso correcto es reconstruir y recrear:

  ```powershell
  docker compose build django
  docker compose up -d django
  ```

  (Sin `--build` el contenedor seguiría sirviendo la imagen anterior y `PATCH` continuaría devolviendo `405`.)

## 3. Verificación

```powershell
docker exec tlaix-django-1 python manage.py check
# System check identified 1 issue (0 silenced).
# WARNING preexistente: staticfiles.W004 (/app/static no existe)
```

```text
PATCH rows/{pk}/     -> 200
PATCH columns/{pk}/  -> 200
PATCH tabs/{pk}/     -> 200
Allow: GET, PUT, PATCH, DELETE, HEAD, OPTIONS
```

Detalle de datos y casos límite: `docs/qa/2026-11-05-patch-detalle-rows-columns-tabs.md`.

## 4. Rollback

Revertir el archivo y reconstruir:

```powershell
git checkout -- backend/api/urls.py
docker compose build django
docker compose up -d django
```

Efecto: `PATCH` vuelve a responder `405` en los tres recursos; `GET`, `PUT` y `DELETE` no se ven afectados.

## 5. Reconstrucción efectiva de la imagen (2026-11-05, docker-ops)

El `docker cp` + `restart` de la sección 2 se hizo **solo** para validar rápido. El cambio ya quedó
durable en la imagen: se reconstruyó y se recreó el contenedor.

```powershell
docker compose build django
docker compose up -d django
```

| Artefacto | Antes (docker cp) | Después (rebuild) |
| --- | --- | --- |
| Imagen `tlaix-django:latest` | `sha256:eb75f816e1aa…` (2026-11-04 13:27) | `sha256:5e6281596d0d…` (2026-11-06 01:07 UTC) |
| Contenedor `tlaix-django-1` | imagen vieja + archivo copiado | imagen nueva (`docker inspect .Image` = `5e6281596d0d…`) |

Contenido verificado dentro de la imagen (`grep partial_update /app/api/urls.py`): líneas 33, 37 y 41
con `'patch': 'partial_update'`; `md5sum` de `api/urls.py` y `api/tests.py` idéntico al árbol de trabajo.

### Verificación ejecutada tras el rebuild

```text
docker compose exec -T django python manage.py test api.tests.PartialUpdatePatchTestCase
  -> Ran 9 tests in 6.6s  OK
docker compose exec -T django python manage.py test api
  -> Ran 101 tests in 50.2s  OK
docker compose exec -T django python manage.py check
  -> System check identified 1 issue (0 silenced)  [staticfiles.W004, preexistente]
```

Pruebas HTTP reales contra `localhost:8000` (usuario y tabla temporales, eliminados al terminar):

| Ruta | `OPTIONS` → `Allow` | `PATCH` parcial | Efecto verificado |
| --- | --- | --- | --- |
| `/api/tables/<T>/` | `GET, PUT, PATCH, DELETE, HEAD, OPTIONS` | 200 | `description` actualizada |
| `/api/tables/<T>/rows/<R>/` | idem | 200 | `name` actualizado, `data` previa conservada |
| `/api/tables/<T>/columns/<C>/` | idem | 200 | `name` actualizado, `type`/`tab_id`/`is_required` intactos |
| `/api/tables/<T>/tabs/<P>/` | idem | 200 | `name` y `label` actualizados, `table`/`order` intactos |

`PATCH` sin token → `401` (la ruta existe y está protegida; no es `405`).

### Frontend

No se reconstruyó `react`: la imagen `tlaix-react` (2026-11-04 21:11) es posterior a la última
edición de `frontend/src` (2026-11-04 21:08) y el bundle servido contiene los cambios
(`assets/index-C-DScxTJ.js` con `.patch(`, `Nuevo nombre de`, `Renombrar`). `http://localhost/` sirve
`index-C-DScxTJ.js` (200) y el proxy `/api/` responde 200.

### Healthcheck

`docker-compose.yml` no define `healthcheck` para `django`; `docker inspect` reporta
`Healthcheck = NO definido`, así que `docker compose ps` solo muestra `Up`. La liveness se comprobó por
HTTP (`/api/` → 200) y por los logs de Gunicorn. Si se quiere un estado `healthy` real hace falta
(a) `healthcheck` en el compose y (b) una ruta que exista — hoy `/health` responde 404
(ver `docs/ops/2026-10-26-frontend-rebuild.md`, punto 4). Ninguno de los dos se tocó aquí porque
implica cambiar `docker-compose.yml` y añadir una vista en `backend/`.

## 6. Notas

- El `docker cp` + `docker restart` deja el contenedor local con el código nuevo, pero **no** actualiza la imagen `tlaix-django`. Cualquier `docker compose up --force-recreate` o rebuild posterior debe hacerse desde el código ya modificado (el árbol de trabajo lo tiene).
- El warning `staticfiles.W004` y el mensaje `Exited with code 1` de PowerShell al redirigir `stderr` son preexistentes y no indican fallo del `check`.
- En los logs del contenedor aparecen `400 Bad Request` de los primeros intentos de verificación: fueron cuerpos JSON mal escapados por PowerShell al pasarlos a `curl.exe` (comillas simples recortadas por el parser nativo), no un fallo del servidor. Repetidos con `Invoke-WebRequest` dieron 200.