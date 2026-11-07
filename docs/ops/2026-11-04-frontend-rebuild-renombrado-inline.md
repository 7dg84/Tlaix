# Rebuild del frontend — renombrado inline

Fecha: 2026-11-04
Rol: docker-ops
Alcance: solo infraestructura (build/redeploy del servicio `react`). **Sin cambios de configuración.**
Sin cambios en `frontend/src/**`, backend, base de datos, migraciones, `docker-compose.yml`,
`package.json` ni dependencias. Sin commit y sin despliegue a dominios remotos.

## Motivo

El contenedor `react` servía el bundle `index-DAvO6DDD.js` (imagen de ~6 h de antigüedad), anterior
a los cambios sin commitear del renombrado inline (`frontend/src/lib/rename.ts`,
`frontend/src/components/InlineRename.tsx`, `frontend/src/api/*.ts`, `pages/Index.tsx`,
`pages/TableView.tsx`). Se requería que `http://localhost` sirviera el bundle con esos cambios.

No fue necesario modificar `frontend/nginx.conf`: la política de caché ya estaba correcta y solo se
verificó.

## Configuración confirmada (sin cambios)

| Servicio | Contenedor | Imagen | Puerto publicado |
|---|---|---|---|
| `db` | `tlaix-db-1` | `postgres:15` | `5432:5432` |
| `django` | `tlaix-django-1` | `tlaix-django` (build local) | `8000:8000` |
| `react` | `tlaix-react-1` | `tlaix-react` (build local) | `80:80` |

- `frontend/Dockerfile` multi-stage: `node:26-alpine` (`npm ci` + `npm run build`) → `nginx:stable-alpine`.
- `frontend/.dockerignore` excluye `node_modules`, `dist`, `build`, `.git`, `Dockerfile`, `.env*`, etc.,
  pero **no** `src/`; por eso los archivos nuevos del renombrado inline entraron al contexto de build
  (60.40 kB de contexto transferido) y `COPY . .` los tomó.
- Perfiles `npm` / `cloudflare` / `test` no se levantaron: publican también el puerto `80` y entrarían
  en conflicto con `react`.

## Comandos ejecutados

```powershell
docker compose ps                        # baseline: react Up 6 h, bundle index-DAvO6DDD.js
docker compose build react               # OK — "Image tlaix-react Built"
docker compose up -d react               # OK — solo react recreado; db y django "Running"
docker compose config --quiet            # OK, sin errores de sintaxis/resolución
docker compose exec react nginx -t       # syntax is ok / test is successful
docker compose logs --tail 20 react      # solo notice de arranque + accesos; sin errores
```

Salida relevante del build (`vite v5.4.19`, 2627 módulos, 25.43 s):

```
dist/index.html                   1.16 kB │ gzip:   0.55 kB
dist/assets/index-Bxuix4H4.css   63.77 kB │ gzip:  11.39 kB
dist/assets/index-C-DScxTJ.js   508.00 kB │ gzip: 163.90 kB
```

## Verificación

Bundle: `index-DAvO6DDD.js` → **`index-C-DScxTJ.js`** (CSS `index-CI7OoZ26.css` → `index-Bxuix4H4.css`).

| Prueba | Resultado |
|---|---|
| `docker compose ps react` | `tlaix-react-1` **Up**, `0.0.0.0:80->80/tcp` (recreado); `db` y `django` sin tocar |
| `GET http://localhost/` | **200**; HTML referencia `/assets/index-C-DScxTJ.js` + `/assets/index-Bxuix4H4.css` |
| `GET http://localhost/` (headers) | `Cache-Control: no-store, no-cache, must-revalidate` ✔ |
| `GET /assets/index-C-DScxTJ.js` | 200, `application/javascript`, 508 256 B, `public, max-age=31536000, immutable` ✔ |
| `GET /assets/index-Bxuix4H4.css` | 200, `text/css`, 63 765 B, `public, max-age=31536000, immutable` ✔ |
| `GET /assets/index-DAvO6DDD.js` (bundle viejo) | **404** — ya no existe en la imagen (esperado) |
| `GET /assets/nope.js` | **404** — `try_files $uri =404` impide caer al SPA |
| `GET /tables/123` (fallback SPA) | 200 `text/html` + `no-store, no-cache, must-revalidate` ✔ |
| `GET /index.html` | 200 + `no-store, no-cache, must-revalidate` ✔ |
| `GET /api/` (proxy Django) | **200** — proxy intacto tras el recreate |
| `GET /admin/` (proxy Django) | **302** — redirección normal a login |
| SHA256 bundle servido vs contenedor | idénticos: `9131fd4c211bfbc70ce35a546b47a757cd5825cbf189ab36c778ae04e0d1b03a` |

Contenido del bundle nuevo (prueba de que el renombrado inline está incluido, no solo un hash nuevo):

| Marcador en `index-C-DScxTJ.js` | Ocurrencias |
|---|---|
| `Nuevo nombre de ` (`aria-label` del input de `InlineRename`) | 1 |
| `Renombrar ` (`title`/`aria-label` del disparador del lápiz) | 7 |
| `aria-busy` (estado de guardado) | 2 |
| `Spacebar` (soporte de teclado del disparador `span`) | 2 |
| `DAvO6DDD` (hash del bundle viejo) | **0** |

Imagen resultante: `tlaix-react:latest`, ID `ba5423ae2118`, 26.2 MB, `linux/amd64`.

## Impacto operativo

- **Downtime**: ~5 s (recreate de un único contenedor). `db` y `django` no se recrearon ni reiniciaron;
  no hubo migraciones ni reinicio de Gunicorn.
- **Migraciones**: ninguna (backend no tocado).
- **Variables de entorno nuevas**: ninguna.
- **Puertos/volúmenes**: sin cambios (`80:80`; el servicio `react` no usa volúmenes).
- **Efecto en clientes**: `/index.html` es `no-store`, así que un navegador con HTML viejo en caché lo
  revalida en la siguiente carga y recibe el bundle nuevo. El bundle anterior pasa a 404, lo cual es
  seguro porque ningún HTML vigente lo referencia.

## Incidencias y warnings (no bloqueantes)

1. **PowerShell reporta `exit code 1` en `docker compose build` y `nginx -t`**: es `NativeCommandError`
   al redirigir stderr nativo. La operación termina correctamente (`Image tlaix-react Built`,
   `test is successful`). No es un fallo del build.
2. `vite build` advierte chunk > 500 kB (`index-C-DScxTJ.js`, 508.00 kB). Sugiere `manualChunks` /
   code-splitting. Optimización de rendimiento, fuera del alcance de infraestructura.
3. `Browserslist: caniuse-lite is 17 months old`. Informativo; no afecta el artefacto.
4. **Riesgo preexistente (sin cambios, requiere decisión de otro rol):** el servicio `react` en
   `docker-compose.yml` **no tiene `restart: unless-stopped`**, a diferencia de `db`,
   `nginx-proxy-manager` y `cloudflare-tunnel`. Tras un reinicio del host o del daemon Docker, el
   frontend no volvería a levantarse solo. No se corrigió porque esta tarea prohíbe editar
   `docker-compose.yml`; se reporta al orquestador.
5. **Riesgo preexistente:** `db` publica `5432` en `0.0.0.0` y `react` publica `80` en `0.0.0.0`.
   En producción conviene no exponer Postgres y dejar solo proxy/TLS por delante.
6. La verificación fue **solo HTTP** (curl/Invoke-WebRequest). No se hizo prueba de navegador real
   (interacción de UI del renombrado inline); corresponde a QA.

## Rollback

No se retagueó la imagen previa, por lo que el rollback es por código + rebuild:

```powershell
# volver al estado de fuente anterior (descarta los cambios sin commitear del renombrado inline)
git stash push -- frontend/src
docker compose build react
docker compose up -d react
```

Para revertir solo a la imagen anterior sin tocar fuente, si se hubiera retagueado:

```powershell
docker tag tlaix-react:pre-inline tlaix-react:latest
docker compose up -d --force-recreate react
```

> Nota: el bundle `index-DAvO6DDD.js` ya no está en la imagen vigente; no hay rollback por hash de
> asset, solo por reconstrucción.

## Estado final

Stack operativo: `db` (Up 8 h), `django` (Up 8 h) y `react` (recreado, Up) en `http://localhost`
(puerto 80). El frontend sirve `index-C-DScxTJ.js` con el renombrado inline incluido, HTML `no-store`
y assets `immutable` verificados. Sin commit, sin cambios en el árbol de trabajo y sin despliegue remoto.
