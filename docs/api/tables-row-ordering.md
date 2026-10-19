# Contrato: orden determinista y `order` automático en filas

- Fecha: 2026-10-19
- Alcance: `GET /api/tables/tabview/<table_id>/<tab_id>/` y `POST /api/tables/<table_id>/rows/`
- Fuente canónica: `SYSTEM_API_SPECIFICATION.md` §4.5 (Módulo de Filas) y §4.7 (Endpoint Optimizado TabView)

## Problema

El modelo `Row` ordena por `order` (`api/models.py`, `Meta.ordering = ['order']`) y `RowViewSet.create`
no asignaba `order`, por lo que las filas creadas desde la UI quedaban todas con `order=0`.
Con empates en `order`, Postgres no garantiza el mismo orden físico entre consultas, así que al
paginar `TabView` por bloques (`row_limit`/`row_offset`) se podían **saltar** filas (los duplicados
los mitiga el frontend, los saltos no).

## Cambios

### 1. Orden determinista en `TabView`

`api/views.py` usa ahora:

```python
rows_qs = table.rows.order_by('order', 'created_at', 'id')
```

- `order` sigue siendo el criterio primario.
- `created_at` e `id` desempatan de forma estable.
- **No cambia el contrato de respuesta**: se mantienen `pagination` (`has_more_rows`, etc.) y
  `row_limit=all|0` en modo completo.

### 2. `order` incremental al crear filas

`RowViewSet.perform_create` asigna `(max order de la tabla) + 1` **solo si el cliente no envía
`order`** (o `0` si la tabla no tiene filas). Si el cliente envía `order`, se respeta.
`TableBulkUploadView` siempre envía `order`, por lo que no se ve afectado.

## Endpoints

| Método | Ruta | Auth | Permisos | Cambio |
| --- | --- | --- | --- | --- |
| GET | `/api/tables/tabview/<table_id>/<tab_id>/` | cookie `auth_token` / `Token` | `view_table` + `view_tab` (por objeto) | Orden de filas determinista (`order`,`created_at`,`id`) |
| POST | `/api/tables/<table_id>/rows/` | cookie `auth_token` / `Token` | `add_row` | `order` autogenerado si se omite |

### POST /api/tables/<table_id>/rows/

Request sin `order`:

```json
{ "name": "López María", "data": { "col-uuid-1": "2006-08-20" } }
```

Response (201 Created):

```json
{
  "id": "row-uuid-77b3",
  "table": "c1f54cf2-ef84-48bc-bce1-fa1eb31a8479",
  "name": "López María",
  "order": 12,
  "data": { "col-uuid-1": "2006-08-20" },
  "created_at": "2026-10-19T12:00:00Z",
  "updated_at": "2026-10-19T12:00:00Z"
}
```

### Errores

| Código | Cuándo |
| --- | --- |
| 401 | Sin autenticación |
| 403 | Autenticado sin `add_row` (POST) o sin `view_table`/`view_tab` por objeto (TabView) |
| 400 | `name` vacío, `data` ausente o `order` no entero |

## Compatibilidad

- El frontend (`TableView.tsx` → `rowService.create`) no envía `order` ni lee `order` de la fila:
  el nuevo valor solo aparece en la respuesta y es compatible.
- La respuesta de `TabView` no cambia de forma; solo se garantiza el orden.
