# Renombrado inline de tablas, pestañas, columnas y filas

- **Fecha:** 2026-11-04
- **Estado:** aprobado para implementación
- **Alcance:** frontend de `Index` y `TableView` + enrutado `PATCH` en `backend/api/urls.py`; sin migraciones ni dependencias
- **Agentes:** `frontend` (implementación), `backend` (enrutado `PATCH`), `test-writer` (tests), `docker-ops` (rebuild local), `qa` (E2E y evidencia)
- **Sin despliegue a `tlaix.smart-food.cc`**

## 1. Objetivo

Añadir un botón de renombrado inline en cuatro elementos:

1. **Columnas:** a la izquierda del botón de revisar (`ScanLine`).
2. **Filas:** a la izquierda del botón de revisar (`ScanLine`).
3. **Pestañas:** a la izquierda del botón de eliminar (`X`).
4. **Tablas:** a la izquierda del botón de eliminar (`Trash2`) de la tarjeta.

Al pulsar el botón, el texto del nombre se sustituye por un `<input>` en el mismo lugar. Al pulsar **Enter** o salir del campo (**blur**) se envía la consulta si el nombre cambió. `Escape` cancela sin llamar a la API.

## 2. Ubicación visual

| Elemento | Estado actual | Nuevo orden |
| --- | --- | --- |
| Columna | `nombre` · revisar · eliminar | `nombre` + lápiz · revisar · eliminar |
| Fila | `nombre` · revisar | `nombre` + lápiz · revisar |
| Pestaña | `label` · eliminar | `label` + lápiz · eliminar |
| Tabla | tarjeta · eliminar arriba a la derecha | tarjeta · lápiz · eliminar arriba a la derecha |

Reglas:

- El lápiz usa el icono `Pencil` de `lucide-react`.
- `title` y `aria-label` en español: `Renombrar columna X`, `Renombrar fila X`, `Renombrar pestaña X`, `Renombrar tabla X`.
- El botón de renombrar no debe activar la pestaña ni navegar a la tabla.
- En tablas, el lápiz vive en el grupo de acciones superior derecha; el título de la tarjeta es el que se convierte en input.
- No se cambia el diseño del resto de botones.

## 3. Comportamiento

### 3.1 Entrada en edición

- Un clic en el lápiz reemplaza el texto por un `<input>` con el valor actual.
- El input recibe foco y selecciona todo el texto.
- Mientras se edita, el lápiz desaparece.
- En tablas, el lápiz permanece en la esquina superior derecha; el `<input>` sustituye al título de la tarjeta.

### 3.2 Confirmación

- **Enter:** confirma y evita el envío del formulario o la activación del enlace/pestaña.
- **Blur:** confirma al hacer clic fuera del input.
- Si el valor recortado está vacío o es igual al original, no se llama a la API y se restaura el nombre.
- Si cambió, se llama al endpoint `PATCH` correspondiente.
- Mientras se guarda, el input es de solo lectura y no se permiten envíos duplicados.
- Al guardar correctamente:
  - se actualiza el estado local;
  - se muestra un toast de éxito;
  - el input vuelve a ser texto.
- Si la API falla:
  - se muestra el error existente con `manageError` (incluido el 400 por nombre duplicado);
  - el input permanece en edición y recupera el foco para corregir o reintentar;
  - un 401 no muestra toast duplicado: lo gestiona el modal global.
- **Escape:** cancela, restaura el valor original y no llama a la API. El blur posterior a Escape no debe guardar.

### 3.3 Límites y validación

| Elemento | Longitud máxima | Unicidad |
| --- | --- | --- |
| Tabla | 100 | Global |
| Pestaña | 100 | Dentro de la tabla |
| Columna | 100 | Dentro de la pestaña |
| Fila | 200 | Sin restricción |

- El input usa `maxLength` según el elemento.
- Solo se recorta el espacio al inicio y al final; no se colapsan espacios internos.
- Los errores de unicidad se muestran con el mensaje del servidor.

## 4. Diseño técnico

### 4.1 Helper puro `frontend/src/lib/rename.ts`

```ts
export function normalizeRename(value: string): string {
  return value.trim();
}

export function shouldSubmitRename(previous: string, next: string): boolean {
  const normalized = normalizeRename(next);
  return normalized.length > 0 && normalized !== normalizeRename(previous);
}
```

- `normalizeRename` centraliza el recorte.
- `shouldSubmitRename` decide si hay que llamar a la API.
- Sin dependencias nuevas.

### 4.2 Componente `frontend/src/components/InlineRename.tsx`

Componente reutilizable con dos modos:

1. **No controlado:** para columnas, filas y pestañas. El componente incluye su propio botón de lápiz.
2. **Controlado:** para tablas. El botón de lápiz está fuera, en la esquina de la tarjeta, y el padre controla `editing`.

Props mínimas:

```ts
interface InlineRenameProps {
  value: string;
  onRename: (name: string) => Promise<void>;
  label: string;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  showButton?: boolean;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}
```

Comportamiento interno:

- Estado `draft`, `saving` y `editing` (este último solo si no es controlado).
- `useEffect` al entrar en edición: copiar `value` a `draft`, enfocar y seleccionar.
- `commit`:
  - ignorar si ya está guardando;
  - normalizar;
  - si no aplica, cerrar edición;
  - si aplica, `await onRename(normalized)`;
  - en éxito, cerrar edición;
  - en error, mantener edición y recuperar foco.
- `onKeyDown`:
  - `Enter`: `preventDefault`, `stopPropagation`, `commit`.
  - `Escape`: `preventDefault`, `stopPropagation`, cancelar y marcar el blur para que no guarde.
- `onBlur`: `commit`.
- `onClick` y `onMouseDown` del input: `stopPropagation`; `onClick` también `preventDefault` para no navegar dentro del `<Link>` de la tarjeta.
- El botón de lápiz usa `type="button"`, `preventDefault`, `stopPropagation` y las clases de los botones actuales.
- El input usa `aria-label={`Nuevo nombre de ${label}`}` y `readOnly={saving}`.

### 4.3 API: métodos `rename` con `PATCH`

Añadir un método explícito por servicio. **No usar `PUT` para renombrar**: en filas, `RowSerializer` exige `data` en `PUT` y un renombrado parcial fallaría.

```ts
// tables.ts
rename: (id: string, name: string) =>
  apiClient.patch<Table>(`/tables/${id}/`, { name }).then(res => res.data)

// tabs.ts
rename: (tableId: string, tabId: string, name: string) =>
  apiClient.patch<Tab>(`/tables/${tableId}/tabs/${tabId}/`, {
    name,
    label: name,
  }).then(res => res.data)

// rows.ts
rename: (tableId: string, rowId: string, name: string) =>
  apiClient.patch<Row>(`/tables/${tableId}/rows/${rowId}/`, { name })
    .then(res => res.data)

// columns.ts
rename: (tableId: string, columnId: string, name: string) =>
  apiClient.patch<Column>(`/tables/${tableId}/columns/${columnId}/`, { name })
    .then(res => res.data)
```

Notas:

- En pestañas se actualizan `name` y `label` para que la etiqueta visible y la clave única queden sincronizadas.
- Los `update` existentes con `PUT` no se tocan.
- Los `ViewSet` ya heredan `partial_update`, pero las rutas explícitas de `backend/api/urls.py` deben mapear `patch`; ver 4.6.

### 4.6 Enrutado `PATCH` en backend

El QA detectó que `backend/api/urls.py` define las rutas de detalle de filas, columnas y pestañas con mapas explícitos que solo incluyen `get`, `put` y `delete`. Por eso `PATCH` responde **405** en esos tres recursos, aunque los serializadores aceptan `partial=True`.

Corrección mínima:

```python
path('tables/<str:table_id>/rows/<str:pk>/',
     RowViewSet.as_view({
         'get': 'retrieve',
         'put': 'update',
         'patch': 'partial_update',
         'delete': 'destroy',
     })),
```

Aplicar el mismo mapeo `'patch': 'partial_update'` a:

- `ColumnViewSet` en `tables/<table_id>/columns/<pk>/`;
- `TabViewSet` en `tables/<table_id>/tabs/<pk>/`.

No se modifican serializadores, modelos, permisos ni migraciones. El cambio requiere reiniciar o reconstruir `django`, no solo `react`.

### 4.4 Integración en `TableView.tsx`

- Reemplazar el `<span>{column.name}</span>` por `<InlineRename ... />`.
- Reemplazar el `<span>{row.name}</span>` por `<InlineRename ... />`.
- Reemplazar el `<span>{tab.label}</span>` por `<InlineRename ... />`.
- Añadir handlers:
  - `renameColumn(column, name)`: `columnService.rename`, actualizar `columns` y `reviewTarget.label` si coincide.
  - `renameRow(row, name)`: `rowService.rename`, actualizar `rows` y `reviewTarget.label` si coincide.
  - `renameTab(tab, name)`: `tabService.rename`, actualizar `tabs` (`name` y `label`).
- En éxito: toast `Columna renombrada correctamente`, `Fila renombrada correctamente` o `Pestaña renombrada correctamente`.
- En error: `manageError` si no es 401 y relanzar para que `InlineRename` mantenga la edición.
- Para pestañas, el lápiz debe ir antes del `X` y detener la propagación para no cambiar de pestaña.

### 4.5 Integración en `Index.tsx`

- Añadir estado `renamingTableId: string | null`.
- Sustituir el botón absoluto de eliminar por un grupo absoluto `flex` con lápiz + eliminar.
- El lápiz superior derecho activa `renamingTableId`; el título de la tarjeta usa `InlineRename` controlado con `showButton={false}`.
- El `Link` de la tarjeta debe evitar la navegación mientras `renamingTableId === table.id`; así el clic fuera del input guarda sin abrir la tabla.
- Handler `renameTable(table, name)`:
  - `tableService.rename`;
  - actualizar `tables`;
  - toast `La tabla "X" se renombró exitosamente`;
  - `manageError` si no es 401 y relanzar.
- Ajustar el padding del título para que no quede debajo de los dos botones de la esquina.

## 5. Casos límite

- Nombre vacío o solo espacios: no se envía; se restaura el original.
- Nombre igual al original: no se envía.
- Enter seguido de blur: no duplica la petición.
- Escape seguido de blur: no guarda.
- Error 400 por duplicado: toast con el mensaje del servidor; el input sigue abierto.
- Error 401: modal global; sin toast duplicado.
- Error 403: toast de permisos; el input sigue abierto.
- Tabla dentro de `<Link>`: clic en el input o en el lápiz no navega.
- Pestaña inactiva: el lápiz permite renombrar sin cambiar de pestaña.
- Renombrar la fila/columna que está en modo revisión: actualizar `reviewTarget.label`.
- Renombrar una tabla desde `Index` no cambia la URL ni navega.
- No se coordina una edición simultánea de varios elementos; el blur de la anterior intenta guardar antes de abrir la siguiente.

## 6. Matriz de aceptación

| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | Pulsar lápiz en una columna | El nombre se convierte en input con foco y texto seleccionado. |
| 2 | Enter con nombre nuevo en columna | `PATCH` correcto, texto actualizado y toast. |
| 3 | Blur con nombre nuevo en fila | `PATCH` correcto, texto actualizado y toast. |
| 4 | Escape en cualquier elemento | Se cancela sin petición. |
| 5 | Nombre vacío | Se cancela sin petición. |
| 6 | Nombre sin cambios | Se cancela sin petición. |
| 7 | Renombrar pestaña | Se actualizan `name` y `label`; la pestaña no cambia de selección. |
| 8 | Renombrar tabla desde la tarjeta | Se actualiza el título; no se navega a la tabla. |
| 9 | Nombre duplicado | Toast de error; el input permanece abierto. |
| 10 | Error 401 | Se abre el modal global; sin toast duplicado. |
| 11 | Error 403 | Toast de permisos; el input permanece abierto. |
| 12 | Renombrar fila/columna en revisión | El overlay usa el nombre nuevo si se vuelve a abrir. |
| 13 | Enter + blur | Una sola petición. |
| 14 | Clic fuera del input en la tarjeta | Guarda y no navega. |
| 15 | Modo revisión, búsqueda, celdas | Sin regresiones. |

## 7. Tests

### Unitarios (`frontend/src/lib/rename.test.ts`)

- `normalizeRename` recorta espacios al inicio y al final.
- `normalizeRename` conserva espacios internos.
- `shouldSubmitRename` devuelve `false` para vacío, solo espacios e igual al original.
- `shouldSubmitRename` devuelve `true` para un nombre distinto.
- `shouldSubmitRename` ignora diferencias solo de espacios exteriores.

### Manuales / E2E

- Matriz de la sección 6.
- Verificar los cuatro puntos de acceso.
- Verificar que el lápiz de pestaña no cambia de pestaña.
- Verificar que el lápiz de tabla no navega.
- Verificar duplicados y permisos.
- Regresión de modo revisión, celdas, búsqueda y 401.

## 8. Tareas para subagentes

### `frontend`

- Crear `frontend/src/lib/rename.ts`.
- Crear `frontend/src/components/InlineRename.tsx`.
- Añadir `rename` a `frontend/src/api/tables.ts`, `tabs.ts`, `rows.ts` y `columns.ts`.
- Integrar en `frontend/src/pages/TableView.tsx` e `frontend/src/pages/Index.tsx`.
- Mantener textos y comentarios en español.
- No tocar backend, `package.json`, dependencias, `.gitignore` ni `TODO.md`.
- No hacer commit.
- Ejecutar `npx tsc --noEmit -p tsconfig.app.json`.

### `backend`

- Añadir `'patch': 'partial_update'` a las rutas de detalle de filas, columnas y pestañas en `backend/api/urls.py`.
- No modificar serializadores, modelos, permisos ni migraciones.
- Verificar con `python manage.py check` y una petición `PATCH` parcial por recurso.
- Reportar el contrato y la necesidad de reiniciar/reconstruir `django`.
- No tocar frontend ni hacer commit.

### `test-writer`

- Crear `frontend/src/lib/rename.test.ts`.
- Cubrir los casos de la sección 7.
- Añadir tests de backend para `PATCH` parcial en filas, columnas y pestañas, incluyendo nombre actualizado y 400 por duplicado cuando aplique.
- No modificar código de producción.
- Ejecutar `npm test`, `npx tsc --noEmit -p tsconfig.app.json` y la suite `api` de Django.

### `docker-ops`

- Reconstruir o reiniciar `react` y `django` según corresponda.
- Verificar `http://localhost/`, bundle nuevo, caché y `PATCH` 200 en los cuatro recursos.
- No desplegar al dominio.

### `qa`

- Revisar implementación contra este plan.
- Verificar la matriz en navegador local con datos temporales.
- Probar columnas, filas, pestañas y tablas.
- Probar Enter, blur, Escape, vacío, duplicado, 401 y 403.
- Crear `docs/qa/2026-11-04-renombrado-inline.md` con evidencia y hallazgos.
- Limpiar datos temporales.
- No modificar código de producción ni hacer commit.

## 9. Documentación

- Plan: `docs/plans/2026-11-04-renombrado-inline.md`.
- QA: `docs/qa/2026-11-04-renombrado-inline.md`.
- No modificar documentos históricos salvo contradicción explícita.

## 10. Criterio de terminado

- [ ] Los cuatro elementos se pueden renombrar inline.
- [ ] Enter y blur guardan solo si cambió el nombre.
- [ ] Escape, vacío e igual cancelan sin API.
- [ ] `PATCH` parcial funciona en los cuatro recursos (`tables`, `tabs`, `columns`, `rows`).
- [ ] Las rutas de detalle de filas, columnas y pestañas mapean `partial_update`.
- [ ] Errores de duplicado, permisos y 401 se comportan como se describe.
- [ ] `npm test` pasa.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sin errores.
- [ ] `npm run build` correcto.
- [ ] QA documentado.
- [ ] Cambios de backend limitados a `backend/api/urls.py` y `backend/api/tests.py`, sin migraciones.
- [ ] Sin despliegue al dominio.
