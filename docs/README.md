# Documentación de Tlaix

Este directorio concentra la documentación de trabajo generada por los agentes de OpenCode. La documentación canónica del sistema sigue siendo `SYSTEM_API_SPECIFICATION.md` en la raíz del repositorio.

## Estructura

| Ruta | Contenido | Responsable |
| --- | --- | --- |
| `SYSTEM_API_SPECIFICATION.md` | Arquitectura, catálogo de endpoints, seguridad, QA y TI | `backend` |
| `TODO.md` | Roadmap y pendientes técnicos | `orchestrator` |
| `README.md` | Instalación y despliegue | `docker-ops` |
| `docs/plans/` | Planes de trabajo por petición | `orchestrator` |
| `docs/api/` | Contratos y ejemplos de endpoints por cambio | `backend` |
| `docs/qa/` | Matriz de pruebas, credenciales locales y notas para QA | `backend`, `frontend`, `qa`, `test-writer` |
| `docs/ops/` | Despliegue, variables, runbooks y rollback | `docker-ops`, `backend` |
| `docs/reports/` | Hallazgos de QA y auditorías de migración | `qa`, `db-migration-guard` |

## Convenciones de nombres

- Planes: `docs/plans/YYYY-MM-DD-<slug>.md`
- Reportes: `docs/reports/YYYY-MM-DD-<slug>.md`
- Contratos: `docs/api/<dominio>.md` (por ejemplo `tables.md`, `auth.md`, `asistencia.md`)
- Runbooks: `docs/ops/<tema>.md` (por ejemplo `despliegue.md`, `backup.md`)

Usa `YYYY-MM-DD` con la fecha real del cambio. Slug en minúsculas, sin acentos y con guiones.

## Plantilla de plan

```md
# <Título>

- Fecha:
- Estado: propuesto | en curso | completado | bloqueado
- Agentes:

## Objetivo

## Contexto y archivos relevantes

## Decisiones y preguntas resueltas

## Tareas

| # | Tarea | Agente | Depende de | Criterio de aceptación |
| --- | --- | --- | --- | --- |

## Riesgos

## Documentación a actualizar
```

## Plantilla de reporte de QA

```md
# <Título>

- Fecha:
- Alcance:
- Entorno:

## Resumen ejecutivo

## Hallazgos

### <Severidad> — <Título>

- Archivo/línea:
- Descripción:
- Reproducción:
- Evidencia:
- Impacto:
- Propuesta de corrección:
- Agente responsable:
```

## Reglas de documentación

1. **Una fuente de verdad por tema.** No dupliques el catálogo completo de endpoints en `docs/api/`; documenta allí el cambio o el módulo y enlaza a `SYSTEM_API_SPECIFICATION.md`.
2. **Sin secretos.** Nunca escribas contraseñas reales, tokens, claves API ni datos personales. Las credenciales de prueba deben ser locales y estar marcadas como tal.
3. **Estado verificable.** Un documento no declara algo "completado" sin evidencia: test, comando, respuesta HTTP o diff.
4. **Enlaces relativos.** Referencia archivos del repositorio con rutas relativas.
5. **Actualización obligatoria.** Todo cambio de contrato, esquema, despliegue o flujo visible actualiza la documentación en el mismo cambio, no después.
