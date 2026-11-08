# Runbook: reconstruir y redesplegar imágenes desde el commit `892e895`

- **Fecha de ejecución:** 2026-10-19
- **Agente:** `docker-ops`
- **Commit origen:** `892e895cdb651093d7d1edda6c37a69d7e605d66` (`asistencia module`)
- **Host:** Windows 11, Docker 29.6.2, Docker Compose v5.3.1
- **Resultado:** ✅ completado. `db`, `django` y `react` en `Up`; build sin caché sin errores.

Este runbook documenta cómo reconstruir las imágenes de `django` y `react` a partir del
**árbol exacto de un commit**, sin arrastrar cambios locales sin commitear del working tree,
y cómo redesplegar reutilizando los contenedores y volúmenes existentes del proyecto `tlaix`.

---

## 1. Por qué no basta un `docker compose build` normal

El working tree principal tiene cambios sin commitear (entre otros `backend/api/views.py`,
`frontend/src/api/tables.ts`, `frontend/src/pages/TableView.tsx`). El `build` toma el
**directorio de contexto del disco**, no el índice de git, por lo que esos cambios entrarían
en la imagen. La solución no destructiva es un **`git worktree` detached** en el commit objetivo:
un segundo checkout del repo, sin tocar el working tree principal y sin `git stash`.

`.env` está versionado en el commit, así que el worktree lo incluye (no hay que copiarlo).

---

## 2. Procedimiento reproducible

Definir la ruta temporal y el commit:

```powershell
$wt   = "C:\Users\uriel\AppData\Local\Temp\opencode\tlaix-892e895"
$repo = "D:\Documents\Proyectos\Tlaix"
$sha  = "892e895cdb651093d7d1edda6c37a69d7e605d66"
```

> **IMPORTANTE — line endings.** El repo tiene `core.autocrlf=true`. Un `git worktree add`
> normal escribe los archivos de texto con **CRLF**, y eso rompe el shebang de
> `backend/entrypoint.sh` dentro de la imagen
> (`exec /app/entrypoint.sh: no such file or directory`, contenedor en `Exited (255)`).
> **Hay que forzar LF en el checkout.** El blob de git está en LF, así que forzar LF reproduce
> el commit fielmente (no es "editar código", es evitar que git lo transforme).

### Paso 1 — Crear el worktree (detached, con LF forzado)

```powershell
# si ya existiera: git -C $repo worktree remove --force $wt
git -C $repo -c core.autocrlf=false -c core.eol=lf worktree add $wt $sha
```

Verificar que el checkout quedó limpio y en LF:

```powershell
git -C $wt rev-parse HEAD          # -> $sha
git -C $wt status --porcelain      # -> vacío
$b = [System.IO.File]::ReadAllBytes("$wt\backend\entrypoint.sh")
($b[0..9] | ForEach-Object { $_.ToString("X2") }) -join ' '
# -> 23 21 2F 62 69 6E 2F 73 68 0A   (#!/bin/sh + LF). Si aparece 0D 0A -> CRLF, NO continuar.
```

### Paso 2 — Build sin caché de `django` y `react`

Se usa el compose del worktree con nombre de proyecto fijo `-p tlaix` para reutilizar los
contenedores y volúmenes existentes (`tlaix_pgdata`, `tlaix_django_media`).

```powershell
docker compose -p tlaix --project-directory $wt -f "$wt\docker-compose.yml" `
  build --no-cache django react
```

### Paso 3 — Redesplegar sin tocar `db`

`--no-deps` garantiza que no se recrea ni reinicia `db` (ya estaba `Up`), y `--no-build`
evita que compose reconstruya desde el directorio actual.

```powershell
docker compose -p tlaix --project-directory $wt -f "$wt\docker-compose.yml" `
  up -d --no-build --force-recreate --no-deps django react
```

### Paso 4 — Verificar

```powershell
docker compose -p tlaix ps
curl.exe -s -o NUL -w "HTTP %{http_code}`n" http://localhost/
curl.exe -s -o NUL -w "HTTP %{http_code}`n" http://localhost:8000/admin/
docker logs tlaix-django-1 2>&1 | Select-Object -First 60
docker inspect tlaix-django-1 --format '{{.State.Status}} restarts={{.RestartCount}}'
```

### Paso 5 — Eliminar el worktree

```powershell
git -C $repo worktree remove --force $wt
git -C $repo worktree list          # no debe aparecer $wt
```

Los contenedores no dependen del worktree en runtime (el código está horneado en la imagen),
así que siguen `Up` tras borrarlo.

---

## 3. Evidencia de la ejecución (2026-10-19)

### Build

```
docker compose -p tlaix ... build --no-cache django react
# -> exit code 0
[react]  naming to docker.io/library/tlaix-react:latest   done
[django] naming to docker.io/library/tlaix-django:latest  done
 Image tlaix-django Built
 Image tlaix-react  Built
```

Imágenes resultantes (ID = el que usa el contenedor en ejecución, por lo que el redeploy
usa realmente lo recién construido):

| Servicio | Imagen | Image ID |
| --- | --- | --- |
| `django` | `tlaix-django:latest` | `sha256:7041460d075f...` |
| `react` | `tlaix-react:latest` | `sha256:a37029a4951c...` |

### Estado de contenedores

```
NAME             SERVICE   STATUS
tlaix-db-1       db        Up 54 minutes
tlaix-django-1   django    Up About a minute   (restarts=0)
tlaix-react-1    react     Up About a minute   (restarts=0)
```

`tlaix-db-1` conservó su ID original: **no fue recreado** (sigue con el volumen `pgdata`).

### HTTP

| URL | Resultado |
| --- | --- |
| `http://localhost/` | `200` |
| `http://localhost:8000/admin/` | `302` → `/admin/login/?next=/admin/` |
| `http://localhost:8000/api/` | `200` |

### Logs de arranque de `tlaix-django-1` (primeros ~60 renglones)

```
System check identified some issues:
WARNINGS:
?: (staticfiles.W004) The directory '/app/static' in the STATICFILES_DIRS setting does not exist.
Operations to perform:
  Apply all migrations: admin, api, asistencia, auth, authtoken, contenttypes, guardian,
                        personal, sessions, students
Running migrations:
  No migrations to apply.
165 static files copied to '/app/staticfiles'.
[INFO] Starting gunicorn 23.0.0
[INFO] Listening at: http://0.0.0.0:8000 (1)
[INFO] Using worker: sync
[INFO] Booting worker with pid: 10
Not Found: /health
```

- **Sin tracebacks** ni errores de `migrate` / `collectstatic`.
- `WARNINGS (staticfiles.W004)` es **preexistente** (el directorio `/app/static` no existe;
  todo el estático servido viene de `/app/staticfiles`). No es causado por este despliegue.
- `Not Found: /health` es una sonda externa que busca `/health`; ese endpoint no existe en
  esta app. No es un error del arranque.

### `entrypoint.sh` dentro de la imagen (verificación POSIX)

```
-rwxr-xr-x 1 root root 218 /app/entrypoint.sh
#!/bin/sh\n          <- shebang correcto, terminador LF
sh -n /app/entrypoint.sh  -> exit 0   (sintaxis POSIX sh válida)
```

---

## 4. Impacto operativo

- **Downtime:** breve. `--force-recreate` detiene y levanta `django` y `react` (segundos de
  indisponibilidad). `db` no se tocó.
- **Migraciones al arrancar:** `entrypoint.sh` ejecuta `migrate` + `collectstatic` + `gunicorn`.
  En esta ejecución no hubo migraciones pendientes (`No migrations to apply.`).
- **Variables nuevas:** ninguna. Se siguen leyendo de `.env` (versionado en el commit).
- **Puertos:** `80` (react/nginx), `8000` (django), `5432` (db) — sin cambios.
- **Volúmenes:** `pgdata` y `django_media` se reutilizaron; no se borró ni se recreó nada.
- **Perfiles:** `npm`, `cloudflare` y `test` **no** se levantaron.

### Nota de metadato

Tras este procedimiento, las etiquetas `com.docker.compose.project.working_dir` /
`config_files` de `tlaix-django-1` y `tlaix-react-1` apuntan al worktree temporal ya eliminado.
Es informativo: `docker compose` localiza los contenedores por la etiqueta de **proyecto**
(`tlaix`), por lo que `docker compose ps/up/logs` desde la raíz del repo siguen funcionando
con normalidad. Si se quiere normalizar, basta un `up -d --force-recreate` desde la raíz en
un momento de mantenimiento.

---

## 5. Rollback

Las imágenes anteriores quedan etiquetadas solo como `tlaix-django:latest` / `tlaix-react:latest`,
por lo que **este procedimiento sobrescribe la imagen previa**. Para volver atrás:

1. **Rebuild desde el árbol deseado** (el commit anterior, p. ej. `da0d4fb`) repitiendo los
   pasos 1–3 con ese `$sha`. Es el rollback fiable.
2. Si se conservó el Image ID anterior (p. ej. `a363cfb0a79f` para django, `db61792922b8` para
   react, los que estaban en ejecución antes de este despliegue), se puede re-etiquetar:
   ```powershell
   docker tag <image-id-anterior> tlaix-django:latest
   docker compose -p tlaix up -d --no-build --force-recreate --no-deps django
   ```
3. **Datos:** solo se revierte el contenedor. `pgdata` no se toca, por lo que un rollback de
   código que dependa de migraciones nuevas requiere revertir la migración de forma explícita
   (coordinar con `db-migration-guard`). No ejecutar `docker compose down -v` ni `docker volume rm`.

---

## 6. Errores encontrados y su corrección

| Error | Causa | Corrección aplicada |
| --- | --- | --- |
| `tlaix-django-1` → `Exited (255)`, log: `exec /app/entrypoint.sh: no such file or directory` | `core.autocrlf=true` escribió `entrypoint.sh` con CRLF en el checkout del worktree → shebang `#!/bin/sh\r` inválido | Recrear el worktree con `-c core.autocrlf=false -c core.eol=lf` y reconstruir |
| `tlaix-react-1` → `Exited (1)`, log: `host not found in upstream "django" in /etc/nginx/conf.d/default.conf:13` | Efecto en cascada: nginx resuelve el upstream `django` al arrancar y el contenedor `django` ya había muerto | Se resolvió al corregir el punto anterior; `react` arrancó sin cambios |

**Riesgo latente (no corregido, fuera de alcance):** `frontend/nginx.conf` resuelve el
upstream `django` en tiempo de arranque. Si `django` está caído cuando `react` arranca, nginx
muere y `react` queda en `Exited`. Además, `react` no tiene `restart: unless-stopped` en el
compose, así que no se recupera solo. Mitigación recomendada para `docker-ops`: usar
`resolver 127.0.0.11 valid=10s;` + variable en `proxy_pass` (resolución diferida) y/o añadir
`restart: unless-stopped` a `react`. Requiere cambiar `frontend/nginx.conf` y el compose.

---

## 7. Comandos de referencia rápida

```powershell
# Estado
docker compose -p tlaix ps
docker logs tlaix-django-1 --tail 100
docker inspect tlaix-django-1 --format '{{.State.Status}} restarts={{.RestartCount}}'

# Verificación HTTP
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost/
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8000/admin/

# Reconstrucción completa desde un commit (resumen)
$wt = "C:\Users\uriel\AppData\Local\Temp\opencode\tlaix-892e895"
git -C D:\Documents\Proyectos\Tlaix -c core.autocrlf=false -c core.eol=lf worktree add $wt 892e895
docker compose -p tlaix --project-directory $wt -f "$wt\docker-compose.yml" build --no-cache django react
docker compose -p tlaix --project-directory $wt -f "$wt\docker-compose.yml" up -d --no-build --force-recreate --no-deps django react
docker compose -p tlaix ps
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost/
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8000/admin/
git -C D:\Documents\Proyectos\Tlaix worktree remove --force $wt
```

> Ningún valor de `.env` aparece en este documento. Usa `.env.example` con placeholders
> (`POSTGRES_PASSWORD=<password>`, `DJANGO_SECRET_KEY=<secret>`, etc.) como referencia.
