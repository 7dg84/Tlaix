# Publicación automática de imágenes Docker (GitHub Actions)

- **Fecha:** 2026-10-19
- **Agente:** `docker-ops`
- **Workflow:** `.github/workflows/docker-publish.yml`
- **Estado:** creado y validado sintácticamente (YAML). Pendiente de la primera ejecución real en GitHub.

Este runbook describe cómo GitHub Actions construye y publica en Docker Hub las dos imágenes
de la aplicación Tlaix en cada push a `main` o `deploy`, qué tags genera y cómo consumirlas.

---

## 1. Resumen

En cada push a `main` o `deploy` se ejecuta un job de matriz con dos entradas independientes
(`fail-fast: false`), de modo que un fallo en una imagen no cancela la otra:

| Entrada | Contexto | Dockerfile | Imagen publicada |
| --- | --- | --- | --- |
| `backend` | `./backend` | `./backend/Dockerfile` | `<DOCKER_USERNAME>/tlaix-backend` |
| `frontend` | `./frontend` | `./frontend/Dockerfile` | `<DOCKER_USERNAME>/tlaix-frontend` |

- `db/Dockerfile` **no** participa: es un remanente MySQL que `docker-compose.yml` no usa
  (el servicio `db` emplea `postgres:15`).
- El frontend consume `API_BASE_URL = '/api/'` (ruta relativa), por lo que **no** requiere
  *build args* ni variables de entorno en el build. La imagen es autocontenida.
- El workflow no modifica el repositorio ni ejecuta migraciones: solo construye y publica.

---

## 2. Requisitos previos (una sola vez)

### 2.1 Repositorios en Docker Hub

Crear dos repositorios **públicos o privados** (según se necesite) en
<https://hub.docker.com/repositories>:

1. `tlaix-backend`
2. `tlaix-frontend`

Deben pertenecer al mismo namespace de Docker Hub cuyo usuario se guardará en el secret
`DOCKER_USERNAME`. Si los repositorios son privados, el *pull* requerirá autenticación
(`docker login`).

### 2.2 Secrets en GitHub

En el repositorio de GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Contenido | Ejemplo de formato |
| --- | --- | --- |
| `DOCKER_USERNAME` | Usuario de Docker Hub | `<dockerhub-user>` |
| `DOCKER_PASSWORD` | Token de acceso de Docker Hub (recomendado) o contraseña | `<dockerhub-access-token>` |

Recomendaciones:

- Usar un **Personal Access Token** de Docker Hub con permiso de lectura/escritura, no la
  contraseña de la cuenta.
- No imprimir ni versionar los valores. El workflow solo los consume como `${{ secrets.* }}`.
- Si el token se filtra, rotarlo en Docker Hub y actualizar el secret en GitHub.

> Sin estos secrets el step `Log in to Docker Hub` falla y las imágenes no se publican.

---

## 3. Disparador

```yaml
on:
  push:
    branches: [main, deploy]
```

- **Sí** se dispara con push a `main` y a `deploy`.
- **No** se dispara con `pull_request`, tags, ni push a otras ramas (`base-sync`, etc.).
- No hay `concurrency`, por lo que dos pushes seguidos pueden solaparse; en ese caso el último
  en terminar sobrescribe los tags móviles (`main`/`deploy`/`latest`) de la misma imagen.

---

## 4. Tags generados

Configurados con `docker/metadata-action@v5`:

```yaml
tags: |
  type=ref,event=branch
  type=sha,format=long,prefix=sha-
  type=raw,value=latest,enable={{is_default_branch}}
```

Resultado por evento:

| Push a | `tlaix-backend` / `tlaix-frontend` reciben |
| --- | --- |
| `main` (rama por defecto) | `main`, `sha-<sha40>`, `latest` |
| `deploy` | `deploy`, `sha-<sha40>` |

Notas:

- `<sha40>` es el SHA completo del commit (40 caracteres). Para un commit `892e895…`, el tag
  sería `sha-892e895…` (40 caracteres exactos, sin abreviar).
- `latest` **solo** se publica desde `main` porque es la rama por defecto del repositorio.
  Un push a `deploy` nunca mueve `latest`.
- Los tags `main` y `deploy` son móviles (apuntan al último commit publicado de esa rama).
  Para despliegues reproducibles, fijar el tag `sha-<sha40>`.

Ejemplo de nombres resultantes (con placeholders):

```
<dockerhub-user>/tlaix-backend:main
<dockerhub-user>/tlaix-backend:sha-<sha40>
<dockerhub-user>/tlaix-backend:latest
<dockerhub-user>/tlaix-frontend:main
<dockerhub-user>/tlaix-frontend:sha-<sha40>
<dockerhub-user>/tlaix-frontend:latest
```

---

## 5. Cómo consumir las imágenes

### 5.1 Descargar

```bash
# Backend
docker pull <dockerhub-user>/tlaix-backend:latest
docker pull <dockerhub-user>/tlaix-backend:main
docker pull <dockerhub-user>/tlaix-backend:sha-<sha40>

# Frontend
docker pull <dockerhub-user>/tlaix-frontend:latest
docker pull <dockerhub-user>/tlaix-frontend:deploy
docker pull <dockerhub-user>/tlaix-frontend:sha-<sha40>
```

Si los repositorios son privados:

```bash
docker login -u <dockerhub-user>
# introducir el Personal Access Token como contraseña
```

### 5.2 Ejecución manual (sin compose)

El backend mantiene el mismo contrato que el servicio `django` del `docker-compose.yml`
(puerto `8000`, `env_file: .env`, volumen de media) y el frontend el del servicio `react`
(puerto `80`). Un ejemplo mínimo:

```bash
docker network create tlaix_net 2>/dev/null || true

docker run -d --name tlaix-db --network tlaix_net \
  -e POSTGRES_DB=<db> -e POSTGRES_USER=<user> -e POSTGRES_PASSWORD=<password> \
  -v tlaix_pgdata:/var/lib/postgresql/data postgres:15

docker run -d --name tlaix-django --network tlaix_net \
  --env-file .env -p 8000:8000 \
  -v tlaix_django_media:/app/media \
  <dockerhub-user>/tlaix-backend:sha-<sha40>

docker run -d --name tlaix-react --network tlaix_net \
  -p 80:80 <dockerhub-user>/tlaix-frontend:sha-<sha40>
```

> El `nginx.conf` del frontend resuelve el upstream `django` por nombre de servicio: el
> contenedor del backend debe llamarse `django` en la misma red, o ajustar la resolución.
> Ver `docs/ops/deploy-892e895.md` (riesgo latente sobre resolución de upstream).

### 5.3 Relación con `docker-compose.yml`

`docker-compose.yml` sigue usando `build:` para `django` y `react`; este workflow **no lo
modifica**. Es decir:

- **Desarrollo local:** `docker compose up --build -d` continúa construyendo desde el código
  local (comportamiento actual, sin cambios).
- **Distribución / servidores sin el código fuente:** consumir las imágenes publicadas con
  `docker pull` + `docker run`, o mediante un archivo *override* local (fuera del repositorio)
  que reemplace `build:` por `image:`. Cualquier cambio permanente en el compose debe
  coordinarse con `docker-ops` y documentarse aparte.

---

## 6. Operación y diagnóstico

### 6.1 Dónde ver la ejecución

GitHub → pestaña **Actions** → workflow *Build and publish Docker images*. Cada ejecución
muestra dos jobs: `Build and publish tlaix-backend to Docker Hub` y
`Build and publish tlaix-frontend to Docker Hub`.

### 6.2 Caché de build

`docker/build-push-action@v6` usa caché de GitHub Actions:

```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```

Reduce minutos en rebuilds sucesivos. La caché es por repositorio y se puede limpiar desde
**Actions → Caches**.

### 6.3 Fallos frecuentes

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `unauthorized: incorrect username or password` | Secrets ausentes/incorrectos o token revocado | Revisar `DOCKER_USERNAME`/`DOCKER_PASSWORD` y regenerar el token |
| `denied: requested access to the resource is denied` | El repositorio no existe en Docker Hub o el token no tiene escritura | Crear el repo y/o ampliar permisos del token |
| `npm ci` falla en el frontend | `package-lock.json` desincronizado con `package.json` | Corregir en `frontend/**` (fuera del alcance de este workflow) |
| `pip install` falla en el backend | Dependencia del sistema faltante o `requirements.txt` inválido | Revisar `backend/Dockerfile`/`requirements.txt` |
| Job cancelado por timeout | Build lento sin caché | Verificar que la caché `gha` esté activa |

---

## 7. Rollback

Como cada commit publica un tag inmutable `sha-<sha40>`, el rollback consiste en desplegar
el tag del commit anterior:

```bash
docker pull <dockerhub-user>/tlaix-backend:sha-<sha40-anterior>
docker pull <dockerhub-user>/tlaix-frontend:sha-<sha40-anterior>
```

Luego recrear los contenedores apuntando a esos tags. Consideraciones:

- **Datos:** revertir la imagen no revierte migraciones de base de datos. Si el commit nuevo
  aplicó migraciones incompatibles, coordinar con `db-migration-guard`.
- No ejecutar `docker compose down -v`, `docker volume rm` ni `docker system prune`.
- Los tags `main`/`deploy`/`latest` son móviles y **no** sirven como referencia estable de
  rollback; usar siempre `sha-<sha40>`.

---

## 8. Seguridad y permisos

- `permissions: contents: read` es el único permiso del `GITHUB_TOKEN`; el workflow no necesita
  escribir en el repositorio, ni en paquetes de GitHub, ni en issues.
- Las credenciales de Docker Hub viajan solo como secrets y se pasan a `docker/login-action`.
- No hay usuarios, tokens ni namespace reales escritos en el workflow ni en este documento.
- Los repositorios de Docker Hub privados requieren `docker login` también para el *pull*.

---

## 9. Mantenimiento del workflow

- Actualizar las versiones de las actions (`checkout@v4`, `setup-buildx-action@v3`,
  `login-action@v3`, `metadata-action@v5`, `build-push-action@v6`) de forma coordinada.
- Si se añade una tercera imagen, agregar una entrada a `matrix.include` con `name`, `context`,
  `file` e `image`; el resto del job se reutiliza.
- Si se quiere construir también en PRs (sin publicar), añadir un job separado con
  `push: ${{ github.event_name != 'pull_request' }}`; no ampliar el trigger actual sin
  decisión explícita, para no consumir minutos en cada PR.