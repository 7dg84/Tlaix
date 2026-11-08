# Rebuild del frontend — validación de calendario en columnas + 401 global

Fecha: 2026-10-26
Rol: docker-ops
Alcance: solo infraestructura (build/redeploy del servicio `react`). Sin cambios en `frontend/src/**`.

## Motivo

Validar en runtime los cambios de `frontend/src/**` (selector de fecha en el diálogo de creación de
columnas y redirección global al login ante 401). El contenedor `react` sirve el build de Vite
generado **dentro** de la imagen, por lo que era necesario reconstruirla.

## Configuración confirmada

| Servicio | Contenedor | Imagen | Puerto publicado |
|---|---|---|---|
| `db` | `tlaix-db-1` | `postgres:15` | `5432:5432` |
| `django` | `tlaix-django-1` | `7dg84/tlaix-backend:latest` | `8000:8000` |
| `react` | `tlaix-react-1` | `7dg84/tlaix-frontend:latest` | `80:80` |

- `frontend/Dockerfile`: multi-stage `node:26-alpine` (`npm ci` + `npm run build`) → `nginx:stable-alpine`.
  El `dist/` se copia desde el stage de build; `frontend/.dockerignore` excluye `node_modules` y `dist`
  locales, así que `COPY . .` siempre toma el código fuente actual del host.
- `frontend/nginx.conf`: `try_files $uri $uri/ /index.html` (SPA) y proxy de `/api/`, `/media/`,
  `/admin/`, `/static/` hacia `http://django:8000`.
- Perfiles `npm` / `cloudflare` / `test` no se levantaron (publican también el puerto 80, entrarían en
  conflicto con `react`).

## Comandos ejecutados

```powershell
docker compose config --quiet                 # OK (exit 0)
docker compose build --no-cache react         # OK (exit 0)
docker compose up -d                          # 1er intento: exit 1 (race al recrear), 2do: exit 0
docker compose ps
docker compose port react 80                  # 0.0.0.0:80
docker exec tlaix-react-1 nginx -t            # syntax is ok
```

### Incidencia del primer `up -d`

```
Container tlaix-react-1 Recreate
Error response from daemon: removal of container 45ff70c1... is already in progress
```

El contenedor viejo quedó renombrado a `45ff70c17cc9_tlaix-react-1` (artefacto del recreate
interrumpido) y el `up` abortó con exit 1. Se reintentó `docker compose up -d` (exit 0) y se restauró
el nombre esperado con:

```powershell
docker rename 45ff70c17cc9_tlaix-react-1 tlaix-react-1
```

Sin downtime adicional: el contenedor ya corría la imagen nueva cuando se renombró.

## Verificación

Bundle: `index-BHpExVko.js` → **`index-C5TCfKNo.js`** (CSS `index-BFiXwF9g.css`).

| URL | Resultado |
|---|---|
| `http://localhost/` | 200, HTML del SPA (1160 B) |
| `http://localhost/login` | 200, mismo `index.html` (fallback SPA) |
| `http://localhost/table/1` | 200, fallback SPA |
| `http://localhost/assets/index-C5TCfKNo.js` | 200, `application/javascript`, 486 429 B |
| `http://localhost/api/` (vía nginx → django) | 200 |
| `http://localhost/api/user/` (sonda de sesión, sin cookie) | 401 (dispara el redirect global) |
| `http://localhost/api/user/login/` (POST `{}`) | 400 (validación, no 401: no redirige) |

Marcadores encontrados en el bundle servido: `mes en nombre`, `mes en número`, `fecha completa`,
`octubre` (locale `es` de date-fns), `Comprobando sesión` (ProtectedRoute), `isAuthRedirect`,
`returnTo`, `/login?`.

## Warnings conocidos (no bloqueantes)

1. `npm ci` reporta **30 vulnerabilidades (8 moderate, 19 high, 3 critical)** en dependencias del
   frontend. No se ejecutó `npm audit fix`. Requiere triage aparte.
2. `npm warn install-scripts`: `@swc/core`, `core-js`, `esbuild` tienen postinstall no aprobado en el
   `npm` de `node:26-alpine`; el build funciona igual (Vite resolvió esbuild/swc correctamente).
3. `Browserslist: caniuse-lite is 16 months old`.
4. Logs de Django muestran `Not Found: /health` repetidos: algo externo (monitor/túnel) sondea
   `/health`, que no existe ni en Django ni en `nginx.conf`. Si se quiere healthcheck real, agregar la
   ruta en el backend o un `location /health` en Nginx — no se hizo para no tocar lógica.
5. Riesgo preexistente: `db` publica `5432` en `0.0.0.0` y `react` publica `80` en `0.0.0.0`. En
   producción conviene cerrar el puerto de Postgres y dejar solo el proxy.

## Rollback

No queda imagen previa con tag (el build sobrescribió `7dg84/tlaix-frontend:latest`), por lo que el
rollback es por código + rebuild:

```powershell
git stash push -- frontend          # o: git checkout -- frontend
docker compose build --no-cache react
docker compose up -d
```

Rollback solo de infraestructura (sin tocar código): `docker compose up -d` con la imagen previa
requiere haberla retagueado antes (`docker tag <id> 7dg84/tlaix-frontend:rollback`); no se hizo en
esta sesión.

## Estado final

Stack operativo: `db`, `django` y `react` en `Up`, frontend sirviendo el bundle nuevo en
`http://localhost` (puerto 80).
