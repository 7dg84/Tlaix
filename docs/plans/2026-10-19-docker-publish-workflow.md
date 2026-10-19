# GitHub Action: construir y publicar imágenes Docker en cada commit

**Fecha:** 2026-10-19
**Responsable de ejecución:** `docker-ops`

## Objetivo

Añadir un workflow de GitHub Actions que, en cada push a `main` o `deploy`, construya las dos
imágenes Docker del proyecto (backend Django y frontend React+Nginx) y las publique en Docker Hub.

## Contexto

- Repo: `https://github.com/7dg84/Tlaix-ASPACTI.git` (origin). Ramas a construir: `main`, `deploy`.
- Imágenes existentes y activas: `backend/Dockerfile` (python:3.11-slim) y `frontend/Dockerfile`
  (node:26-alpine build + nginx:stable-alpine).
- `db/Dockerfile` es un remanente MySQL no usado por `docker-compose.yml` (que usa `postgres:15`); queda fuera.
- El frontend consume `API_BASE_URL = '/api/'` (relativa), por lo que **no** necesita *build args* ni variables de entorno en el build.
- No existe directorio `.github/` en el repo.
- No hay Dockerfiles multi-stage que requieran `target`.

## Decisiones (confirmadas por el usuario)

1. **Dos repositorios en Docker Hub**: `<DOCKER_USERNAME>/tlaix-backend` y `<DOCKER_USERNAME>/tlaix-frontend`.
2. **Disparador**: `on: push` limitado a `branches: [main, deploy]`.
3. **Tags**: `type=ref,event=branch`, `type=sha,format=long,prefix=sha-` y `latest` solo en la rama por defecto.
4. **Credenciales**: secrets `DOCKER_USERNAME` y `DOCKER_PASSWORD` en el repo de GitHub.
5. Construcción de cada imagen como job independiente (matriz), con `fail-fast: false`.

## Tareas

1. Crear `.github/workflows/docker-publish.yml` (agente: `docker-ops`).
2. Validar sintaxis YAML y coherencia de referencias `steps`/`matrix`.
3. Documentar en `docs/ops/docker-publish.md` los secrets requeridos, tags generados y cómo consumir las imágenes.

## Criterios de aceptación

- El workflow existe, es YAML válido y se dispara solo en push a `main` y `deploy`.
- Usa `actions/checkout@v4`, `docker/setup-buildx-action@v3`, `docker/login-action@v3`,
  `docker/metadata-action@v5` y `docker/build-push-action@v6`.
- Construye ambas imágenes con los `context`/`file` correctos y `push: true`.
- `latest` solo se publica en la rama por defecto; en cada commit se publica el tag `sha-<sha largo>`.
- No hay credenciales, usuarios ni contraseñas hardcodeadas en el archivo.
- No se modifica `docker-compose.yml`, `.env`, `backend/**` ni `frontend/**`.

## Riesgos

- Los secrets deben existir en GitHub antes del primer push o el job de login fallará.
- El nombre de usuario de Docker Hub se resuelve por secret, por lo que el workflow no valida el namespace.
- Cada push a `main`/`deploy` construye dos imágenes y consume minutos de Actions (mitigable con caché `type=gha`).

## Resultado (2026-10-19)

**Completado y verificado por el orquestador.**

- Creado `.github/workflows/docker-publish.yml` (61 líneas, LF): matriz `backend`/`frontend`,
  `push: true`, tags `branch` + `sha-<40>` + `latest` solo en rama por defecto, caché GHA.
- Disparador verificado: solo `push` a `main` y `deploy`; `permissions: contents: read`.
- Sin credenciales ni namespace hardcodeados: todo por `secrets.DOCKER_USERNAME` / `secrets.DOCKER_PASSWORD`.
- Validación sintáctica con `js-yaml` (PARSE OK). No se ejecutó en GitHub ni con `actionlint`
  (no instalado), por lo que la primera ejecución real queda pendiente de comprobar.
- `git status --porcelain` sin cambios colaterales: solo aparece `.github/` como nuevo, además de los
  cambios locales preexistentes y `docs/`/`opencode.json`.
- Documentación: `docs/ops/docker-publish.md` (secrets, ramas, tabla de tags, `docker pull`, uso y rollback).

Pendiente opcional: enlazar `docs/ops/docker-publish.md` desde `README.md` (fuera del alcance del orquestador).
