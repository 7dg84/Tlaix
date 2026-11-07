# QA backend: `PATCH` en el detalle de filas, columnas y pestañas

- **Fecha:** 2026-11-05
- **Rama:** `base-sync` (árbol de trabajo, sin commit)
- **Origen:** bloqueante **H-01** de `docs/qa/2026-11-04-renombrado-inline.md` (405 en `PATCH`).
- **Alcance:** únicamente `backend/api/urls.py`. Sin cambios en serializadores, modelos, permisos ni migraciones.
- **Sin despliegue** a `tlaix.smart-food.cc`; verificación contra `http://localhost:8000` (contenedor `tlaix-django-1`).

## 1. Cambio verificado

Los mapas de acciones de las rutas de detalle ahora incluyen `'patch': 'partial_update'`:

| Recurso | Ruta | Métodos del mapa |
| --- | --- | --- |
| Fila | `/api/tables/<table_id>/rows/<pk>/` | `GET`, `PUT`, `PATCH`, `DELETE` |
| Columna | `/api/tables/<table_id>/columns/<pk>/` | `GET`, `PUT`, `PATCH`, `DELETE` |
| Pestaña | `/api/tables/<table_id>/tabs/<pk>/` | `GET`, `PUT`, `PATCH`, `DELETE` |

`partial_update` ya existía en los `ModelViewSet`; solo faltaba exponerlo en el `URLconf`.

## 2. Datos de prueba

- Usuario temporal superusuario `qa_patch_http_probe` con token DRF.
- Tabla `qa-patch-http-probe-table`, pestaña `qa-tab`, columna `qa-column` (`type=text`) y fila `qa-row`.
- Los datos se crearon en la base de datos real y se eliminaron en un bloque `finally`; la verificación con `APIClient` se ejecutó dentro de `transaction.atomic()` + `set_rollback(True)`.

### Limpieza comprobada

```text
usuarios probe: 0
tablas probe:   0
```

## 3. Comandos y resultados

### 3.1 `python manage.py check`

```text
System check identified some issues:

WARNINGS:
?: (staticfiles.W004) The directory '/app/static' in the STATICFILES_DIRS setting does not exist.

System check identified 1 issue (0 silenced).
```

Sin errores. El warning de `staticfiles.W004` es preexistente y no está relacionado con este cambio.

### 3.2 `PATCH` por HTTP contra gunicorn (token `Authorization: Token ...`)

| Petición | Payload | Status | Respuesta |
| --- | --- | --- | --- |
| `PATCH /api/tables/<T>/rows/<R>/` | `{"name": "qa-row-renamed"}` | **200** | `name` actualizado, `data` vacío |
| `PATCH /api/tables/<T>/columns/<C>/` | `{"name": "qa-column-renamed"}` | **200** | `name` actualizado, `type` intacto |
| `PATCH /api/tables/<T>/tabs/<P>/` | `{"name": "qa-tab-renamed", "label": "QA Tab Renamed"}` | **200** | `name` y `label` actualizados |

### 3.3 `OPTIONS` (métodos expuestos por DRF)

```text
rows/{pk}/     -> Allow: GET, PUT, PATCH, DELETE, HEAD, OPTIONS
columns/{pk}/  -> Allow: GET, PUT, PATCH, DELETE, HEAD, OPTIONS
tabs/{pk}/     -> Allow: GET, PUT, PATCH, DELETE, HEAD, OPTIONS
```

Confirma que `GET`, `PUT` y `DELETE` siguen mapeados (no hay regresión de métodos).

## 4. Casos límite y contrato

- **Actualización parcial real:** `PATCH` con un solo campo no exige los campos obligatorios de `PUT`. En filas, `RowSerializer.data` es `required=True` en `PUT`, pero el `partial=True` de `PATCH` lo omite.
- **Duplicados:** se mantiene la validación de `unique_together` de los serializadores (`400`):
  - pestaña duplicada por `table` + `name`;
  - columna duplicada por `tab` + `name`.
- **Permisos (sin cambios):**
  - `401` sin cookie/token válido.
  - `403` autenticado sin `change_row` / `change_column` / `change_tab` (en pestañas, además, `change_tab` por objeto).
  - `404` si el recurso no existe o no pertenece a la tabla.
- **`data` en filas:** si se envía en el `PATCH`, `RowSerializer._set_cells` crea o actualiza las celdas; si se omite, las celdas no se tocan.
- **No se modificó** el comportamiento de `PUT` ni el de `CellValueViewSet`.

## 5. Casos de regresión sugeridos (frontend/QA)

Re-ejecutar de la matriz de `docs/qa/2026-11-04-renombrado-inline.md`:

| Caso | Escenario | Esperado |
| --- | --- | --- |
| 2 | Renombrar columna + Enter | `PATCH /columns/<id>/` **200**, toast de éxito, sin recargar |
| 3 | Renombrar fila + blur | `PATCH /rows/<id>/` **200** |
| 7 | Renombrar pestaña actual | `PATCH /tabs/<id>/` **200** con `name` y `label`, sin cambiar de pestaña |
| 9 | Nombre duplicado (pestaña/columna) | `400` con mensaje de unicidad, input abierto |
| 11 | Usuario `view` sin `change` | `403` en pestaña/columna/fila |
| 12 | Renombrar fila/columna y reabrir revisión | El overlay muestra el nombre nuevo |