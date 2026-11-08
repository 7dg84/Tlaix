# Contrato: valores completos de una fila / columna (modo revisión)

- **Fecha:** 2026-10-23
- **Alcance:** endpoints de solo lectura del "modo revisión" (fila y columna)
- **Implementación:** `api.views.RowCellValuesView`, `api.views.ColumnCellValuesView`
- **Rutas:** `api/urls.py` (`row_cellvalues`, `column_cellvalues`)
- **Fuente canónica:** `SYSTEM_API_SPECIFICATION.md` §4.4 (Módulo de Columnas) y §4.5 (Módulo de Filas)

## Propósito

El modo revisión recorre **todo** el eje de una fila o de una columna sin cargar la tabla
completa ni depender de la paginación de `TabView` (que devuelve bloques de 50 filas).
Estos endpoints devuelven el eje completo, en orden determinista, y **no paginan**: el
frontend usa `items` como la lista de celdas a recorrer.

No sustituyen a `TabView` ni a `CellValueViewSet`; su contrato no cambia. La escritura
sigue haciéndose con `PUT /api/tables/cell/<table_id>/<column_id>/<row_id>/`.

## Endpoints

| Método | Ruta | Auth | Permisos |
| --- | --- | --- | --- |
| GET | `/api/tables/<table_id>/rows/<pk>/cellvalues/?tab_id=<opcional>` | cookie `auth_token` o `Token` | `view_table` por objeto en la tabla + `view_tab` por objeto en la pestaña |
| GET | `/api/tables/<table_id>/columns/<pk>/cellvalues/` | cookie `auth_token` o `Token` | `view_table` por objeto en la tabla + `view_tab` por objeto en la pestaña de la columna |

- `authentication_classes = [CookieTokenAuthentication, TokenAuthentication]`.
- `permission_classes = [IsAuthenticated, CompleteDjangoObjectPermissions]`.
- `view_table` se valida sobre la tabla y `view_tab` sobre la pestaña (misma exigencia que
  `TabView`). Tener permiso global no basta: `CompleteDjangoObjectPermissions` exige el
  permiso a nivel de objeto.
- En la ruta de fila, si se envía `tab_id` se valida esa pestaña; si no, se usa la primera
  pestaña de la tabla ordenada por `order, id` y **también se valida su `view_tab`**.

### Resolución de objetos

| Caso | Resultado |
| --- | --- |
| `table_id` inexistente | 404 |
| `PK` inexistente o de otra tabla (fila/columna) | 404 |
| `tab_id` inexistente o de otra tabla | 404 |
| Tabla sin pestañas (solo ruta de fila, sin `tab_id`) | 200 con `items: []`, `total: 0`, `tab: null` |
| Autenticado sin permiso de objeto | 403 |
| Sin autenticación | 401 |

## GET fila

`GET /api/tables/<table_id>/rows/<pk>/cellvalues/?tab_id=<opcional>`

Devuelve todas las columnas de la pestaña (`order, id`) con el valor de la fila indicada.
Si la celda no existe, `value` es `null` (el ítem **no** se omite).

```json
{
  "axis": "row",
  "target": { "id": "<row_id>", "name": "Cliente 3", "order": 2 },
  "tab": { "id": "<tab_id>", "name": "General", "label": "General" },
  "items": [
    {
      "column_id": "<column_id>",
      "column_name": "Estado",
      "type": "select",
      "options": ["Activo", "Inactivo"],
      "order": 0,
      "is_required": false,
      "value": "Activo"
    },
    {
      "column_id": "<column_id_2>",
      "column_name": "Fecha de alta",
      "type": "date",
      "options": null,
      "order": 1,
      "is_required": false,
      "value": "2026-10-15"
    }
  ],
  "total": 8
}
```

- `total` = número de columnas de la pestaña (= `len(items)`).
- `value` se obtiene con `CellValue.get_value()`: `text` → string, `int` → entero,
  `float` → decimal, `checkbox` → booleano, `select` → string/lista/dict según
  `value_json`/`value_text`, `date` → `YYYY-MM-DD`.
- Tabla sin pestañas:

```json
{ "axis": "row", "target": { "id": "<row_id>", "name": "Cliente 3", "order": 2 },
  "tab": null, "items": [], "total": 0 }
```

## GET columna

`GET /api/tables/<table_id>/columns/<pk>/cellvalues/`

Devuelve **todas** las filas de la tabla (`order, created_at, id`) con el valor de la
columna indicada. No aplica el límite de 50 filas de `TabView`.

```json
{
  "axis": "column",
  "target": {
    "id": "<column_id>",
    "name": "Estado",
    "type": "select",
    "options": ["Activo", "Inactivo"],
    "order": 2,
    "is_required": false,
    "tab_id": "<tab_id>"
  },
  "items": [
    { "row_id": "<row_id>", "row_name": "Cliente 1", "order": 0, "value": "Activo" },
    { "row_id": "<row_id_2>", "row_name": "Cliente 2", "order": 0, "value": null }
  ],
  "total": 120
}
```

- `total` = número de filas de la tabla (= `len(items)`).
- El eje de filas incluye las filas de toda la tabla (comportamiento preexistente de
  `TabView`: las filas no están asociadas a una pestaña).

## Orden determinista

| Eje | Orden |
| --- | --- |
| Columnas | `order`, `id` |
| Filas | `order`, `created_at`, `id` |

`order` puede empatar (p. ej. filas creadas por la UI antes del `order` automático); los
desempates garantizan que dos peticiones idénticas devuelvan el mismo orden y que el modo
revisión no salte ni duplique celdas.

## Rendimiento

- Una sola consulta de celdas por petición (`CellValue.filter(...)`), con
  `select_related('column')` en la ruta de fila y `select_related('row')` en la de columna.
- En la ruta de columna la columna ya está en memoria, por lo que se asigna a cada celda
  antes de `get_value()` y no se consulta el FK por fila.
- La ruta de columna devuelve todas las filas: en tablas muy grandes el payload crece de
  forma lineal (solo `row_id`, `row_name`, `order`, `value`). Si se detecta lentitud,
  evaluar paginación por cursor en una segunda fase (fuera de alcance).
- No hay N+1; cubierto por
  `ColumnCellValuesViewTestCase.test_does_not_scale_queries_with_row_count`.

## Errores

| Código | Cuándo |
| --- | --- |
| 401 | Sin cookie `auth_token` ni cabecera `Authorization: Token ...` |
| 403 | Autenticado sin `view_table` sobre la tabla o sin `view_tab` sobre la pestaña |
| 404 | Tabla, fila, columna o pestaña inexistente o que no pertenece a `table_id` |
| 405 | Método distinto de `GET` |

## Ejemplos con curl (entorno local)

```bash
# Fila en la pestaña activa
curl -s "http://localhost:8000/api/tables/<table_id>/rows/<row_id>/cellvalues/?tab_id=<tab_id>" \
  -H "Authorization: Token <token_local>"

# Columna completa
curl -s "http://localhost:8000/api/tables/<table_id>/columns/<column_id>/cellvalues/" \
  -H "Authorization: Token <token_local>"
```

No usar tokens reales en documentación ni en capturas; los ejemplos son locales.

## Compatibilidad

- Endpoints nuevos: no modifican `TabView`, `CellValueViewSet` ni las rutas
  `rows/<pk>/` y `columns/<pk>/` (las rutas `cellvalues` son segmentos finales
  adicionales y se declaran antes del `include(router.urls)`).
- Sin migraciones: no hay cambios de modelo.
- Consumo previsto: `frontend/src/components/ReviewMode.tsx` (modo revisión).
