# QA: paginación determinista de filas en TabView

- Fecha: 2026-10-19
- Alcance: `GET /api/tables/tabview/<table_id>/<tab_id>/` y `POST /api/tables/<table_id>/rows/`
- Entorno: Docker (`tlaix-django-1`, `tlaix-db-1` PostgreSQL 15)
- Contrato: `docs/api/tables-row-ordering.md`

## Datos de prueba necesarios

| Requisito | Detalle |
| --- | --- |
| Usuario | Con `add_row` global y permisos de objeto `view_table` + `view_tab` |
| Tabla | Cualquiera con una pestaña (`Tab`) y al menos una columna |
| Filas | 25 filas con `order` empatado: 20 con `order=0`, 3 con `order=1`, 2 con `order=2` |

> Las filas con empates se pueden crear directamente por ORM (`Row.objects.create(..., order=0)`)
> porque `POST /rows/` ya no permite el empate (asigna `order` incremental).

## Casos

### 1. Orden determinista con `order` empatado

1. `GET /api/tables/tabview/<table_id>/<tab_id>/?row_limit=all`
2. Comprobar que el orden de `rows[].id` es igual a
   `Row.objects.filter(table=...).order_by('order','created_at','id')`.

**Esperado:** coinciden; las filas con `order=0` aparecen en orden de creación.

### 2. Paginación por bloques sin saltos ni duplicados

1. Repetir `GET ...?row_limit=4&row_offset=<0,4,8,12,16,20,24>`.
2. Concatenar `rows[].id` de todos los bloques (25 ids).

**Esperado:** 25 ids, ninguno duplicado y el conjunto es exactamente el total de filas
(`pagination.total_rows == 25`).

### 3. `order` automático al crear

1. `POST /api/tables/<table_id>/rows/` con `{"name": "Fila A", "data": {}}` sobre tabla vacía → `order=0`.
2. Crear otra fila sin `order` → `order=1`.
3. `POST` con `{"name": "Fila B", "data": {}, "order": 7}` → `order=7` (respetado).

### 4. Carga masiva intacta

1. `POST /api/tables/<table_id>/bulk/` con `{"rows": [{"name": "R1", "order": 5}, {"name": "R2", "order": 9}]}`.
2. Verificar en BD que `R1.order == 5` y `R2.order == 9`.

## Automatización

`backend/api/tests.py`:

- `TabViewRowOrderingTestCase` (4 tests): orden determinista, orden de creación en empates,
  paginación por bloques sin saltos/duplicados y estabilidad entre peticiones repetidas.
- `RowCreateOrderTestCase` (4 tests): `order` incremental, arranque en 0, no empate en creaciones
  consecutivas y respeto del `order` explícito.

Ejecución:

```
docker compose build django
docker compose up -d django
docker exec tlaix-django-1 python manage.py test api
```

## Casos límite

- Tabla sin filas: `POST /rows/` → `order=0`.
- Borrado de la fila con el `order` máximo: la siguiente creación reutiliza ese `order`
  (`max+1` del conjunto actual); es esperado, `order` no es único ni contiguo.
- Creaciones concurrentes sin `order` pueden obtener el mismo `max+1`; el desempate
  `order, created_at, id` en `TabView` mantiene el orden estable.
