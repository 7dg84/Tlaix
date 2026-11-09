# Migración 0014 (Contract) y fusión a `main`

- Fecha: 2026-11-08
- Estado: en curso
- Agentes: `backend`, `db-migration-guard`, `test-writer`, `docker-ops`, `qa`, `frontend` (solo si hay conflictos de merge en su ámbito)

## Objetivo

Cerrar la fase Contract de la migración `CellValue → RowTabData`:

1. Eliminar el modelo `CellValue` de `backend/api/models.py`.
2. Crear `backend/api/migrations/0014_delete_cellvalue.py` con `migrations.DeleteModel(name='CellValue')`, que elimina la tabla `cell_values` de PostgreSQL.
3. Verificar que la suite de tests sigue en verde sin el modelo retirado.
4. Fusionar `feature/row-tab-data-migration` en `main` con un commit de merge `--no-ff`, resolviendo conflictos por ámbito (sin publicar a `origin`).

## Contexto y archivos relevantes

- Plan anterior: `docs/plans/2026-11-06-row-tab-data-migration.md`.
- Migración existente: `backend/api/migrations/0013_rowtabdata_migration.py`.
- Modelo deprecado: `backend/api/models.py` (`CellValue`, líneas ~95-140).
- Auditoría previa: `docs/reports/2026-11-06-auditoria-migracion-row-tab-data.md`.
- Auditoría técnica QA: `docs/qa/2026-11-06-auditoria-rowtabdata.md`.
- Documentación canónica: `SYSTEM_API_SPECIFICATION.md`.
- Rama origen: `feature/row-tab-data-migration` (incluye `fe89349`).
- Rama destino: `main` (divergente; contiene cambios de despliegue, Nginx, app `novedades` y una copia del renombrado inline).

### Estado de partida

- La migración `0013` aplicó y revirtió correctamente en PostgreSQL 15.
- `RowTabData` opera al 100% y 127 tests de backend pasan en verde.
- `CellValue` permanece en el esquema únicamente por el patrón Expand & Contract.
- Hay cambios sin commitear en `backend/asistencia/` (permisos `IsAttendanceManager` / `IsChecker`) ajenos a esta entrega. **Decisión: excluirlos del merge** y conservarlos en `git stash`.

## Decisiones y preguntas resueltas

- **0014 es destructiva por diseño**: elimina `cell_values`. Solo se ejecuta tras la verificación de `RowTabData` y con respaldo previo de la base de datos. No se ejecutará en producción desde este plan; el despliegue queda a cargo de `docker-ops`/operación.
- **Rollback de 0014**: `migrate api 0013` reconstruye la tabla vacía `cell_values` (el `DeleteModel` no restaura datos). La recuperación real depende del respaldo previo; se documenta como riesgo aceptado de la fase Contract.
- **Merge local sin push**: se crea commit de merge en `main` y no se toca `origin`.
- **Cambios WIP de asistencia**: se guardan en `git stash` con mensaje `wip-permisos-asistencia-2026-11-08`; no entran al merge.
- **Conflictos de merge**: se resuelven por propietario. Backend para `backend/**`; frontend para `frontend/**`; infraestructura (`docker-compose.yml`, `nginx.conf`, Dockerfiles, `.env.example`) para `docker-ops`; documentación y `.gitignore` los resuelve el orquestador.

## Tareas

| # | Tarea | Agente | Depende de | Criterio de aceptación | Estado |
|---|---|---|---|---|---|
| 1 | Guardar WIP de asistencia en stash y crear plan | orchestrator | - | `git stash list` muestra `wip-permisos-asistencia-2026-11-08`; plan creado | Completado |
| 2 | Eliminar `CellValue` de `models.py` y crear `0014_delete_cellvalue.py` | `backend` | 1 | `manage.py check` sin errores; `makemigrations --check` sin pendientes; `sqlmigrate api 0014` muestra `DROP TABLE cell_values` | Completado |
| 3 | Auditar 0014 (destructiva, locks, rollback, respaldo) | `db-migration-guard` | 2 | Reporte en `docs/reports/2026-11-08-auditoria-migracion-0014.md` con dictamen | Completado |
| 4 | Verificar suite completa sin `CellValue` | `test-writer` | 2 | `manage.py test api asistencia students personal` en verde; sin imports del modelo retirado | Completado |
| 5 | Aplicar 0014 en Docker local y verificar endpoints | `docker-ops` | 2, 4 | `showmigrations` marca `[X] 0014_delete_cellvalue`; `http://localhost:8000/api/` responde 200; `row_tab_data` conserva datos | Completado |
| 6 | QA de regresión post-Contract | `qa` | 5 | Reporte breve en `docs/qa/2026-11-08-regresion-0014.md`; sin hallazgos altos | Completado |
| 7 | Commit de la entrega 0014 en la rama feature | orchestrator | 2-6 | Commit creado en `feature/row-tab-data-migration` | Pendiente |
| 8 | Merge `--no-ff` de la rama feature en `main` | orchestrator + `backend` / `frontend` / `docker-ops` según conflicto | 7 | Merge completado; conflictos resueltos por propietario; `git status` limpio | Pendiente |
| 9 | Verificación post-merge en `main` | `docker-ops` / `qa` | 8 | Tests backend en verde y servicios locales responden 200 | Pendiente |
| 10 | Actualizar plan, `TODO.md` y documentación | orchestrator | 8, 9 | Estado `completado`; documentación sincronizada | Pendiente |

## Conflictos de merge previstos

`git merge-tree main feature/row-tab-data-migration` reporta conflictos en, al menos:

- `.gitignore`, `README.md`, `TODO.md`, `.env.example`
- `backend/api/{permissions,serializers,tests,views,urls}.py`, `backend/config/settings.py`, `backend/api/admin.py`
- `frontend/src/pages/{Index,TableView}.tsx`, `frontend/src/api/*.ts`, `frontend/src/components/InlineRename.tsx`, `frontend/src/lib/rename.ts`
- Archivos `__pycache__/*.pyc` (binarios; se resuelven tomando la versión de `main` y se valorará dejar de trackearlos)

Regla de resolución:

1. Infraestructura y despliegue: prevalece `main` (Nginx, compose, settings de producción) salvo variables nuevas requeridas por backend.
2. Backend funcional: prevalece la rama feature (`RowTabData`, tests, permisos por objeto) sobre `main`.
3. Frontend: prevalece `main` para estructura de despliegue; se incorporan de la rama feature solo los cambios de renombrado inline y APIs de celdas si `main` no los contiene ya.
4. Documentación: se combinan ambos contenidos; el plan y los reportes de esta entrega se conservan.

## Riesgos

1. **Pérdida de datos**: `0014` elimina `cell_values` sin retorno de datos. Mitigación: respaldo `pg_dump` antes de aplicar en entornos compartidos y verificación de `row_tab_data`.
2. **Conflictos de merge mal resueltos**: pueden reintroducir `CellValue` o romper contratos del frontend. Mitigación: resolución por ámbito + suite de tests + QA post-merge.
3. **Divergencia de `main`**: `main` incluye apps (`novedades`, `personal`) y configuración que la rama feature no tiene; el merge debe preservarlas.
4. **Archivos `__pycache__` versionados**: generan conflictos binarios; se resolverán a favor de `main` sin alterar el código fuente.

## Documentación a actualizar

- `docs/plans/2026-11-08-0014-delete-cellvalue-y-merge-main.md` (este plan; estado final).
- `docs/reports/2026-11-08-auditoria-migracion-0014.md` (`db-migration-guard`).
- `docs/qa/2026-11-08-regresion-0014.md` (`qa`).
- `docs/ops/2026-11-08-aplicacion-0014-local.md` (`docker-ops`).
- `SYSTEM_API_SPECIFICATION.md`: retirar `CellValue` del diagrama y del catálogo.
- `TODO.md`: marcar la fase Contract como completada.
