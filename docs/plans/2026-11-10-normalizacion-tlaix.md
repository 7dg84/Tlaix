# Normalización del repositorio al linaje Tlaix

- Fecha: 2026-11-10
- Estado: completado
- Agentes: `orchestrator`, `test-writer`, `frontend`

## Objetivo

Dejar el proyecto en el linaje limpio de **Tlaix**, sin los módulos que pertenecen a **Tlaix-ASPACTI**, y con la migración a `RowTabData` incluida:

1. Base Tlaix hasta el último commit previo a la mezcla (renombrado inline).
2. Migraciones `0013_rowtabdata_migration` (datos) y `0014_delete_cellvalue` (fase Contract).
3. Sin `backend/novedades` ni las páginas `Novedades`, `RecentChecks`, `VerifyQR` y `ApiDocumentation`.

## Contexto y decisiones

- El merge anterior (`20056ab`) y los fixes post-merge (`dc7d0fe`, `5158b2f`) pertenecen al linaje adaptado de Tlaix-ASPACTI.
- Se conservaron respaldos locales antes de reescribir la rama:
  - `backup/main-aspacti-dc7d0fe` (`dc7d0fe`)
  - `backup/main-aspacti-5158b2f` (`5158b2f`)
- `main` local se movió a `cf42b72`, que es exactamente:
  - Tlaix `347d706` + renombrado inline (`cdca080`, `b3b3498`)
  - migración `fe89349` + `5ddbccb` + docs (`23f3b5a`)
  - limpieza de la copia de auditoría (`cf42b72`)
- `origin/main` (Tlaix-ASPACTI) quedó restaurado en `ce655b4`, su estado previo.
- `upstream/feature/row-tab-data-migration` (Tlaix) apunta a `cf42b72`.

## Cambios aplicados

- Eliminación de `backend/novedades/` y su registro en `INSTALLED_APPS`.
- Eliminación de `frontend/src/pages/Novedades.tsx`, `RecentChecks.tsx`, `VerifyQR.tsx`, `ApiDocumentation.tsx` y sus rutas en `App.tsx`.
- Eliminación de `frontend/src/api/novedades.ts` y `personal.ts` del estado ASPACTI.
- Conservación de `Index`, `TableView`, `Login`, `NotFound`, modo revisión, renombrado inline, `CellEditor` y APIs de celdas/asistencia.
- Migraciones `0013` y `0014` presentes; `CellValue` fuera del modelo y de la base.

## Verificación

- Estructura: `backend/` = `api`, `asistencia`, `config`, `personal`, `students`; `frontend/src/pages/` = `Index`, `Login`, `NotFound`, `TableView`.
- Sin referencias funcionales a `novdades`, `recent-checks`, `verify-qr` ni `api-docs`.
- `makemigrations --check` → `No changes detected`.
- Backend: **132 tests OK** (`api` 116, `asistencia` 8, `students` 4, `personal` 4). Reporte: `docs/qa/2026-11-10-verificacion-estado-tlaix.md`.
- Frontend: `tsc --noEmit` OK, `npm run build` OK (`index-C-DScxTJ.js`, 508 kB) y **163 tests vitest OK**. Sin imports ni rutas residuales de ASPACTI. `npm run lint` reporta 46 errores preexistentes (`no-explicit-any`, etc.), ajenos a esta limpieza.

## Riesgos

1. `origin/main` fue reescrito con `--force-with-lease` para volver a `ce655b4`; cualquier clon de ASPACTI debe hacer `git fetch` y resetear si tenía `dc7d0fe`.
2. El historial de `feature/row-tab-data-migration` aún contiene la copia `Tlaix/audit-src/` en los commits `fe89349`–`23f3b5a` (eliminada en el árbol por `cf42b72`). Purgarla requeriría reescribir historia.
3. Los fixes H-N1/H-N2 y los permisos de asistencia no forman parte de este linaje limpio; viven en las ramas de respaldo.

## Documentación a actualizar

- `docs/qa/2026-11-10-verificacion-estado-tlaix.md` (creado).
- Este plan.
