# Rebuild del frontend + política de caché en Nginx

Fecha: 2026-10-27
Rol: docker-ops
Alcance: solo infraestructura (build/redeploy del servicio `react` y `frontend/nginx.conf`).
Sin cambios en `frontend/src/**`, backend, base de datos ni migraciones.

## Motivo

1. El contenedor `react` servía un build obsoleto: `index-C5TCfKNo.js`, mientras el código actual
   en `frontend/src/**` (cambios sin commitear de modo revisión) compila a `index-DYKgNdbn.js`.
2. `frontend/nginx.conf` no enviaba cabeceras de caché, por lo que el HTML del SPA podía quedar
   cacheado en el navegador y seguir apuntando a bundles que ya no existen tras un despliegue.

## Cambio de configuración

En `frontend/nginx.conf` se agregaron dos `location` (el resto quedó intacto, sin tocar puertos ni
`proxy_pass`):

```nginx
# El HTML de entrada nunca debe cachearse: referencia los bundles con hash.
location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}

# Assets con hash en el nombre: cacheables de forma inmutable.
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

Detalles de comportamiento:

- El fallback SPA (`try_files $uri $uri/ /index.html`) hace un redirect interno a `/index.html`,
  que coincide con el `location = /index.html`; por eso las rutas profundas (p. ej. `/table/123`)
  también reciben `no-store`.
- `try_files $uri =404` en `/assets/` evita que un asset inexistente devuelva el `index.html`
  con 200 (lo que enmascararía errores de despliegue como fallos de parseo en el navegador).

## Configuración confirmada

| Servicio | Contenedor | Imagen | Puerto publicado |
|---|---|---|---|
| `db` | `tlaix-db-1` | `postgres:15` | `5432:5432` |
| `django` | `tlaix-django-1` | `tlaix-django` (build local) | `8000:8000` |
| `react` | `tlaix-react-1` | `tlaix-react` (build local) | `80:80` |

- `frontend/Dockerfile`: multi-stage `node:26-alpine` (`npm ci` + `npm run build`) → `nginx:stable-alpine`.
- `frontend/.dockerignore` excluye `dist`, así que `COPY . .` toma el código fuente del host y el
  `dist/` se regenera dentro de la imagen (no se reutiliza el `dist/` local).
- Perfiles `npm` / `cloudflare` / `test` no se levantaron: publican también el puerto `80` y
  entrarían en conflicto con `react`.

## Comandos ejecutados

```powershell
docker compose ps                              # baseline: react Up con bundle viejo
docker compose build react                     # OK — "Image tlaix-react Built"
docker compose up -d --force-recreate react    # OK (exit 0) — db y django intactos
docker compose exec react nginx -t             # syntax is ok / test is successful
docker compose logs --tail=50 react            # sin errores
```

Salida relevante del build:

```
dist/index.html                   1.16 kB │ gzip:   0.55 kB
dist/assets/index-Dg5gTxlT.css   64.23 kB │ gzip:  11.41 kB
dist/assets/index-DYKgNdbn.js   500.82 kB │ gzip: 161.86 kB
✓ built in 10.15s
```

## Verificación

Bundle (rebuild inicial; el vigente es `index-DdSnc6b_.js`, ver §Reconstrucciones posteriores): `index-C5TCfKNo.js` → **`index-DYKgNdbn.js`** (CSS `index-BFiXwF9g.css` → `index-Dg5gTxlT.css`).

| Prueba | Resultado |
|---|---|
| `docker compose ps` | `tlaix-react-1` **Up**, `0.0.0.0:80->80/tcp` (recreado); `db` y `django` sin cambios |
| `curl -s http://localhost/` | referencia `assets/index-DYKgNdbn.js` + `assets/index-Dg5gTxlT.css` |
| `curl -I http://localhost/` | 200, `Cache-Control: no-store, no-cache, must-revalidate` |
| `curl -I /assets/index-DYKgNdbn.js` | 200, `application/javascript`, 501 074 B, `Cache-Control: public, max-age=31536000, immutable` |
| `curl -I /assets/index-Dg5gTxlT.css` | 200, `text/css`, 64 228 B, misma cabecera inmutable |
| `curl -I /table/123` (fallback SPA) | 200 `text/html` + `no-store, no-cache, must-revalidate` |
| `curl -I /assets/index-DOESNOTEXIST.js` | **404** (no cae al SPA) |
| `curl -o /dev/null -w %{http_code} http://localhost/api/` | 200 (proxy a Django operativo) |
| SHA256 bundle servido vs `frontend/dist` | idénticos: `BEA2698F46BC1A67C997FFC035FCFC82AC3DBEBB3BD75095EDA257B527F551A0` |

Logs de `react`: solo `notice` de arranque y líneas de acceso; **sin errores de Nginx**. El
entrypoint reporta `default.conf differs from the packaged version`, esperado al montar una config
propia.

## Impacto operativo

- **Downtime**: ~5 s (recreate de un único contenedor). `db` y `django` no se recrearon.
- **Migraciones**: ninguna (no se tocó el backend).
- **Variables de entorno nuevas**: ninguna.
- **Puertos/volúmenes**: sin cambios.
- **Efecto en clientes**: al ser `/index.html` `no-store`, los navegadores con HTML viejo en caché
  lo revalidan en la siguiente carga y reciben el bundle nuevo. Los assets viejos con hash siguen
  siendo servibles hasta que se limpien, lo cual es seguro.

## Warnings conocidos (no bloqueantes)

1. `vite build` advierte que un chunk supera 500 kB (`index-DYKgNdbn.js`, 500.82 kB). Sugiere
   `manualChunks` / code-splitting. Es una optimización de rendimiento, fuera del alcance de
   infraestructura.
2. `Browserslist: caniuse-lite is 16 months old`. Informativo.
3. Riesgo preexistente sin cambios: `db` publica `5432` en `0.0.0.0` y `react` publica `80` en
   `0.0.0.0`. En producción conviene no exponer Postgres y dejar solo el proxy/TLS por delante.
4. El exit code `1` que PowerShell reporta en `docker compose build` / `nginx -t` proviene de
   `NativeCommandError` al redirigir stderr nativo; la operación en sí termina correctamente
   (`Image tlaix-react Built`, `test is successful`).

## Rollback

Rollback de la política de caché (sin tocar el bundle):

```powershell
git checkout -- frontend/nginx.conf
docker compose build react
docker compose up -d --force-recreate react
```

Rollback completo del frontend al estado anterior (descarta también los cambios de `src/**`):

```powershell
git stash push -- frontend/src
docker compose build react
docker compose up -d --force-recreate react
```

No se retagueó la imagen previa en esta sesión, por lo que no existe rollback por tag; el rollback
es por código + rebuild.

## Reconstrucciones posteriores

| Fecha | Bundle | CSS | Motivo |
|---|---|---|---|
| 2026-10-27 | `index-DYKgNdbn.js` | `index-Dg5gTxlT.css` | Rebuild inicial + política de caché |
| 2026-10-27 | `index-DdSnc6b_.js` | `index-Dg5gTxlT.css` | Fix: guard del `Select` abierto |

En ambos casos `frontend/nginx.conf` ya estaba configurado: solo se ejecutó
`docker compose build react` + `docker compose up -d --force-recreate react`. Cabeceras verificadas
sin cambios (`/` → `no-store, no-cache, must-revalidate`; `/assets/*` → `public, max-age=31536000,
immutable`). El bundle anterior deja de existir en la imagen y pasa a devolver `404`, lo cual es
seguro porque `/index.html` es `no-store` y siempre apunta al hash vigente.

## Estado final

Stack operativo: `db`, `django` y `react` en `Up`. El frontend sirve `index-DdSnc6b_.js` en
`http://localhost` (puerto 80) con la política de caché aplicada y verificada. Sin commit.
