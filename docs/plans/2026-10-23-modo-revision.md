# Modo revisión fullscreen (fila / columna)

- **Fecha:** 2026-10-23
- **Estado:** implementado y verificado (2026-10-23)
- **Resultado:** endpoints `cellvalues` de fila/columna, overlay fullscreen, atajos de teclado, 92 tests backend y 30 tests frontend; E2E con 60 filas × 6 tipos (incluye fallo 502/403 y reintento).
- **Agentes:** `frontend` (implementación), `qa` (auditoría y matriz manual), `test-writer` (tests de lógica), `docker-ops` (rebuild y verificación), `orchestrator` (coordinación)

## Objetivo

Añadir un **modo revisión** que permita recorrer y editar todos los registros de una fila o de una columna en pantalla completa, con el teclado como interfaz principal:

- Entrada desde un icono en cada encabezado de columna, **a la izquierda de la X de eliminar** y alineado a la derecha de la columna.
- Recorrido **columna por columna** (fila a fila) o **fila por fila** (columna a columna).
- Cabecera fija con el nombre del elemento revisado y el elemento que se cruza en cada iteración.
- Foco automático en el campo para escribir/editar.
- Teclado específico por tipo: checkbox (`Espacio`, `0/1`, `t/f`), lista (`1..N` + `Enter`, filtrado por letras), y navegación con `←`/`→`.
- Guardado explícito con `Enter`, sin perder cambios al navegar.

Añade dos endpoints de solo lectura para obtener **todos** los valores de una fila o de una columna sin cargar la tabla completa, y reutiliza `PUT /api/tables/cell/...` para guardar.

## Contexto y archivos relevantes

| Archivo | Rol actual |
| --- | --- |
| `frontend/src/pages/TableView.tsx` | Tabla, paginación por bloques, edición inline (`updateCellValue`), cabeceras con `X` de eliminar |
| `frontend/src/components/CellEditor.tsx` | Editor inline por tipo (autoguardado a 1 s / blur) |
| `frontend/src/components/AddColumnDialog.tsx` | `ColumnType = "text" \| "checkbox" \| "int" \| "float" \| "select" \| "date"` |
| `frontend/src/api/cells.ts` | `cellService.update(tableId, columnId, rowId, value)` → `PUT /tables/cell/...` |
| `frontend/src/api/tables.ts` | `getTabView(tableId, tabId, { row_limit, row_offset, col_limit, col_offset })` y tipos de `pagination` |
| `backend/api/views.py` | `TabView` acepta `row_limit=all` / `col_limit=all` (sin límite) y ordena por `order, created_at, id` |
| `backend/api/urls.py` | Rutas existentes de `rows/<pk>/` y `columns/<pk>/`; aquí se añaden los `cellvalues` |
| `backend/api/models.py` | `CellValue.get_value()` resuelve el valor según el tipo de columna |

La tabla principal carga bloques de 50 filas. El modo revisión debe garantizar **todos** los registros, aunque la tabla tenga solo el primer bloque cargado.

## Experiencia de usuario

### Entradas

1. **Revisar columna** (principal): icono `ScanLine` en cada `<th>` de columna de datos, dentro del grupo derecho, justo a la izquierda de la `X`:

   ```tsx
   <div className="flex items-center justify-between gap-2">
     <span>{column.name}</span>
     <div className="flex items-center gap-1">
       <button
         type="button"
         onClick={() => openReview("column", column.id)}
         title={`Revisar columna ${column.name}`}
         aria-label={`Revisar columna ${column.name}`}
         className="hover:text-foreground text-muted-foreground rounded-full p-0.5 transition-colors"
       >
         <ScanLine className="w-3.5 h-3.5" />
       </button>
       <button type="button" onClick={() => setColumnToDelete(column)} /* X existente */ />
     </div>
   </div>
   ```

   No se añade a la columna "Acciones" (no es un dato).

2. **Revisar fila** (secundaria, recomendada): el mismo icono junto al nombre de la fila, alineado a la derecha de la celda "Nombre". Permite cumplir el "fila por fila" sin depender de la columna. Si no se quiere tocar la celda, se puede dejar solo como atajo `R` sobre la fila enfocada.

### Layout fullscreen

Overlay propio con `createPortal` a `document.body` (evita recortes por `overflow` de la tabla):

```text
┌──────────────────────────────────────────────────────────────┐
│ [ScanLine] Revisar columna: "Estado"          Fila 3 / 120  [X] │
│ Tipo: Lista · 3 opciones                                        │
├──────────────────────────────────────────────────────────────┤
│ Fila: "Cliente 3"                                               │
│                                                                 │
│   ┌──────────────────────────────────────────────────────┐      │
│   │  [ campo de edición grande, foco automático ]         │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                 │
│   1. Activo     2. Inactivo     3. Pendiente                     │
├──────────────────────────────────────────────────────────────┤
│ [←/→] mover   [Enter] guardar y seguir   [Esc] salir            │
└──────────────────────────────────────────────────────────────┘
```

- `fixed inset-0 z-50 bg-background`, sin scroll de página; se bloquea `document.body` mientras está abierto.
- Cabecera: nombre del elemento fijo + tipo + progreso `n / total` + botón cerrar.
- Contexto: nombre del elemento que se cruza (fila en modo columna; columna en modo fila).
- Zona central: editor del valor (grande, legible, `autoFocus`).
- Pie: pistas de teclado contextuales según el tipo (`<kbd>`), y botones equivalentes para ratón/táctil.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` con el nombre revisado, progreso en `aria-live="polite"`.

### Navegación

- `reviewItems` es un arreglo ordenado de celdas:
  - **Modo columna:** todas las filas de la tabla (orden del backend) para la columna elegida.
  - **Modo fila:** todas las columnas de datos de la fila elegida (excluye "Nombre" y "Acciones").
- `index` actual; `←`/`→` = anterior/siguiente ítem (guarda antes de mover).
- `Enter` = guardar y avanzar.
- `Esc` = cerrar (guarda el cambio pendiente). En lista, el primer `Esc` limpia el filtro y el segundo cierra.
- Barra de progreso y estado final "Revisión completada" con opción de cerrar.

### Teclado por tipo

| Tecla | `text` / `int` / `float` / `date` | `checkbox` | `select` (lista) |
| --- | --- | --- | --- |
| `←` / `→` | Guarda si cambió y va al anterior/siguiente | Igual | Igual |
| `Enter` | Guarda y avanza | Guarda y avanza | Elige la opción resaltada (o el número pendiente), guarda y avanza |
| `Esc` | Guarda pendiente y cierra | Igual | 1.º limpia filtro; 2.º guarda y cierra |
| `Espacio` | Escribe un espacio | Alterna el valor local | — |
| `0` / `1` | — | `false` / `true` | — |
| `t` / `f` | — | `true` / `false` | — |
| `1..N` | — | — | Selecciona la opción numerada (con `Enter`) |
| Letras | — | — | Filtra opciones por subcadena |
| `↑` / `↓` | — | — | Mueve el resaltado en la lista filtrada |
| `Backspace` | Borra carácter | — | Borra el último carácter del filtro |
| `Home` / `End` | Inicio/fin del texto | — | — |

Notas de implementación:

- Al enfocar un campo de texto/número, se **selecciona todo** el contenido para que escribir reemplace el valor. `←`/`→` navegan; para mover el cursor dentro del texto se usa `Alt+←`/`Alt+→` (o el ratón). Se documenta en las pistas del pie.
- `Espacio` en checkbox no debe hacer scroll de la página (`preventDefault`).
- Ignorar eventos con `Ctrl`/`Meta`/`Alt` (salvo el caso anterior) y eventos con `event.isComposing` (IME).
- En `date`, `←`/`→` navegan; la edición de segmentos de fecha se hace con el selector nativo o escribiendo dígitos.

### Lista desplegable en detalle

- Cada opción se muestra numerada con su **índice original** (1-based), aunque el filtro esté activo.
- `1..9` selecciona directamente; para listas de más de 9 se acepta un **buffer de varios dígitos** (`1`, `2` → "12") que se resuelve con `Enter`; el buffer se limpia al escribir una letra o tras 700 ms sin dígitos.
- Al escribir letras se construye `filter`; las opciones que no contienen esa subcadena se ocultan. Comparación normalizada (minúsculas y sin acentos).
- `↑`/`↓` mueven el resaltado entre las opciones visibles; por defecto se resalta el valor actual si sigue visible.
- `Enter`:
  - con buffer numérico válido → elige esa opción;
  - con filtro y sin buffer → elige la opción resaltada (primera coincidencia);
  - sin filtro ni buffer → elige la opción resaltada (valor actual) y avanza.
- Sin coincidencias: mensaje "Sin coincidencias"; `Enter` no guarda ni avanza.
- Si el valor actual no está entre las opciones (dato legado), se muestra como opción virtual "Valor actual".

### Guardado y errores

- **Sin autoguardado por temporizador** en modo revisión (a diferencia de `CellEditor`): los cambios son locales hasta `Enter`, `←`/`→` o `Esc`.
- `Enter` guarda con `await`; si falla, se queda en la celda, muestra toast de error y no avanza.
- `←`/`→` guardan de forma optimista y avanzan; si falla el `PUT`, se revierte el valor en la tabla y en la revisión y se avisa.
- Si el valor no cambió, no se hace petición.
- Mientras hay un guardado en curso, se deshabilita el avance para evitar dobles envíos (o se encola el último valor).
- Al cerrar, la tabla principal refleja los cambios ya guardados; la paginación de la tabla no se reinicia ni se reemplaza por el conjunto completo.

## Datos y estado

```ts
type ReviewAxis = "row" | "column";

interface ReviewTarget {
  axis: ReviewAxis;
  id: string;          // row.id o column.id
  label: string;       // nombre mostrado en la cabecera
  items: ReviewItem[]; // celdas a recorrer
}

interface ReviewItem {
  rowId: string;
  rowName: string;
  columnId: string;
  columnName: string;
  type: ColumnType;
  options?: string[];
  value: unknown;
}
```

- **Apertura:** `openReview(axis, id)`:
  1. Muestra el overlay en estado `loading`.
  2. Llama al endpoint dedicado:
     - fila: `GET /api/tables/<table_id>/rows/<row_id>/cellvalues/?tab_id=<activeTabId>`
     - columna: `GET /api/tables/<table_id>/columns/<column_id>/cellvalues/`
  3. El backend devuelve **todos** los ítems del eje (todas las columnas de la pestaña para una fila; todas las filas de la tabla para una columna) con su valor actual, en orden determinista.
  4. Construye `items` con el orden devuelto y enfoca el primer ítem (o el ítem correspondiente a la celda si se abrió desde una fila).
- **Cierre/abort:** `AbortController` o bandera para descartar la respuesta si se cierra durante la carga.
- **Guardado:** reutilizar `cellService.update`; refactorizar `updateCellValue` en `TableView` para que **lance** el error (hoy lo captura y solo muestra toast), de modo que el overlay decida si avanza o se queda. La tabla mantiene su comportamiento actual.
- **Estado del overlay:** `{ target, items, index, filter, numberBuffer, highlighted, saving, error }` en `ReviewMode`, sin contaminar el estado de paginación de `TableView`.

## Contrato de los endpoints de valores

Rutas nuevas (GET, autenticadas, permisos de tabla/pestaña):

```text
GET /api/tables/<table_id>/rows/<row_id>/cellvalues/?tab_id=<tab_id_opcional>
GET /api/tables/<table_id>/columns/<column_id>/cellvalues/
```

### Fila

`tab_id` es opcional; si falta se usa la primera pestaña de la tabla (orden `order, id`). Devuelve todas las columnas de esa pestaña, con el valor de la celda para la fila indicada (o `null` si no existe).

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
    }
  ],
  "total": 8
}
```

### Columna

Devuelve todas las filas de la tabla (no solo las cargadas en la tabla) con el valor de esa columna.

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
    { "row_id": "<row_id>", "row_name": "Cliente 1", "order": 0, "value": "Activo" }
  ],
  "total": 120
}
```

Reglas:

- 404 si la tabla, la fila, la columna o la pestaña no existen o no pertenecen a la tabla indicada.
- 401 sin autenticación; 403 sin permiso de ver la tabla/pestaña.
- Orden determinista: columnas por `order, id`; filas por `order, created_at, id`.
- Una sola consulta de celdas por petición (`CellValue.filter(row=...)` o `CellValue.filter(column=...)`), sin N+1.
- Sin paginación: el propósito es devolver el eje completo para el modo revisión.

## Arquitectura propuesta

| Archivo | Cambio |
| --- | --- |
| `frontend/src/components/ReviewMode.tsx` | **Nuevo.** Overlay fullscreen, cabecera/contexto/progreso, captura de teclado, guardado y navegación |
| `frontend/src/components/review/ReviewInput.tsx` | **Nuevo (opcional).** Editor por tipo: texto/número/fecha, checkbox, lista con filtro y numeración |
| `frontend/src/lib/review.ts` | **Nuevo.** Utilidades puras: `buildReviewItems`, `normalizeText`, `filterOptions`, `reduceReviewKey`, `formatTypeHint` |
| `frontend/src/pages/TableView.tsx` | Icono de revisión en cabeceras de columna (izquierda de `X`) y en la celda de nombre de fila; estado `reviewTarget`; render del overlay; `updateCellValue` con error propagado |
| `frontend/src/components/AddColumnDialog.tsx` | Sin cambios (se reutiliza `ColumnType`) |
| `frontend/src/api/tables.ts` / `cells.ts` | Sin cambios de contrato |

Separar la lógica pura (construcción de ítems, filtro, reducción de teclas) del componente permite probarla sin DOM y reduce el riesgo de regresiones.

## Tareas

| # | Tarea | Agente | Depende de | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| 1 | Backend: endpoints `cellvalues` de fila/columna + tests + contrato | `backend` | — | `GET .../rows/<pk>/cellvalues/` y `.../columns/<pk>/cellvalues/`; 200/401/403/404 correctos; orden determinista; una sola consulta de celdas; tests verdes |
| 2 | Tipos y utilidades puras (`buildReviewItems`, normalización, filtro de opciones, reducer de teclas) | `frontend` | 1 (contrato) | Funciones exportadas y cubiertas por tests unitarios; sin dependencias de React |
| 3 | Overlay base + entrada por columna + foco/teclado para `text`/`int`/`float`/`date` | `frontend` | 2 | Icono visible a la izquierda de `X`; overlay fullscreen; foco automático; `Enter` guarda y avanza; `←`/`→` navegan |
| 4 | Checkbox y lista avanzada | `frontend` | 3 | `Espacio`/`0`/`1`/`t`/`f`; numeración, buffer multi-dígito, filtro por letras, `↑`/`↓`, `Enter`; guarda solo si cambió |
| 5 | Entrada por fila + integración con tabla y guardado | `frontend` | 3 | Modo fila recorre todas las columnas; los cambios se reflejan en la tabla; error de `PUT` no avanza y revierte |
| 6 | Auditoría funcional, a11y y edge cases | `qa` | 4, 5 | Informe con matriz de pruebas y hallazgos; sin bloqueantes |
| 7 | Tests unitarios de la lógica pura | `test-writer` | 2, 4 | Tests verdes; cubren filtro con acentos, números >9, reducer de teclado y construcción de ítems |
| 8 | Rebuild de la imagen React y E2E en navegador | `docker-ops` + `orchestrator` | 1, 6, 7 | `docker compose build react` + prueba real con tabla de >50 filas y todos los tipos |
| 9 | Documentación de QA, contrato y actualización de `TODO.md` | `qa` / `backend` / `orchestrator` | 6, 8 | `docs/qa/modo-revision.md`, contrato en `docs/api/` y `SYSTEM_API_SPECIFICATION.md`; `TODO.md` actualizado |

## Criterios de aceptación

1. Cada columna de datos muestra el icono de revisión **a la izquierda de la X**, alineado a la derecha; la columna "Acciones" no lo muestra.
2. El modo revisión ocupa la pantalla completa, bloquea el scroll de fondo y se cierra con `Esc` o con la `X`.
3. En modo columna se recorren **todas** las filas de esa columna, incluso si la tabla solo tenía 50 cargadas, vía `GET .../columns/<id>/cellvalues/`.
4. En modo fila se recorren **todas** las columnas de datos de esa fila, vía `GET .../rows/<id>/cellvalues/`.
5. La cabecera muestra el nombre del elemento fijo y el contexto del elemento que se cruza; el progreso `n / total` es correcto.
6. El campo recibe foco automáticamente al abrir y después de cada navegación.
7. Texto/número/fecha: escribir y `Enter` guarda y avanza; `←`/`→` guardan **solo si el valor cambió** y navegan.
8. Checkbox: `Espacio` alterna; `0`/`f` ponen `false`; `1`/`t` ponen `true`; se guarda con `Enter`/navegación **solo si cambió**.
9. Lista: cada opción tiene número; número + `Enter` selecciona; letras filtran por subcadena (sin acentos); `Enter` guarda y avanza; `↑`/`↓` mueven el resaltado.
10. Los endpoints nuevos responden 200 con todos los ítems y 401/403/404 según corresponda; la suite de `backend/api/tests.py` pasa completa.
11. Un fallo de guardado no avanza y no pierde el valor; se muestra error y se puede reintentar.
12. Al cerrar, la tabla principal muestra los valores guardados y conserva su paginación/scroll.
13. No hay regresiones en la edición inline, alta/baja de filas, columnas o pestañas.
14. `npx tsc --noEmit` y `npm run build` pasan.

## Riesgos

- **Conflicto de `←`/`→` con el cursor de texto y los controles nativos** (`date`, `select`): se mitiga con selección total al enfocar, `Alt+←/→` para el cursor y navegación explícita en las pistas.
- **Volumen de datos:** el endpoint de columna devuelve todas las filas (requisito del modo revisión); en tablas muy grandes la respuesta puede ser grande. Mitigación: payload ligero (`row_id`, `row_name`, `order`, `value`), una sola consulta de celdas, spinner y `AbortController` al cerrar. Si se detecta lentitud, evaluar paginación por cursor en una segunda fase.
- **Foco y portales:** Radix y el `overflow-x-auto` de la tabla pueden interferir con el foco; usar portal a `body` y un focus trap explícito.
- **Listas largas:** el buffer multi-dígito y el filtrado pueden volverse ambiguos; se documenta y se prueban casos >9, sin coincidencias y valores legados.
- **Doble guardado:** `Enter` repetido o navegación rápida; bloquear el avance mientras el `PUT` está en vuelo.
- **Errores silenciosos actuales:** `updateCellValue` captura el error; hay que refactorizarlo con cuidado para no cambiar el comportamiento de la tabla.
- **Filas de otras pestañas:** `TabView` devuelve las filas de toda la tabla (comportamiento preexistente). El modo revisión mostrará el mismo conjunto que la tabla; corregir el filtrado por pestaña queda fuera de alcance.

## Decisiones resueltas (2026-10-23)

1. **Entrada al modo fila:** icono también junto al nombre de la fila. **Sí.**
2. **`←`/`→` en campos de texto:** navegan. **Sí** (selección total al enfocar; `Alt+←/→` mueve el cursor).
3. **Guardado al navegar con flechas:** **solo si el valor cambió.**
4. **Carga inicial:** usar un **endpoint dedicado por fila/columna** (`.../cellvalues/`) en lugar de cargar toda la tabla.
5. **Checkbox:** se guarda con `Enter`/navegación **solo si cambia de valor**; no se persiste en cada alternancia.
6. **Listas de más de 9 opciones:** **buffer multi-dígito.**

## Fuera de alcance

- Filtrado de filas por pestaña en `TabView` (bug preexistente).
- Edición de nombres de fila/columna desde el modo revisión.
- Reordenar filas/columnas.
- Sincronización en tiempo real entre usuarios.
- Cambios en el backend o en el contrato de la API.

## Documentación a actualizar

- `docs/api/review-cellvalues.md`: contrato de los dos endpoints nuevos, permisos, errores y ejemplos.
- `SYSTEM_API_SPECIFICATION.md`: añadir los endpoints a la sección de tablas/filas/columnas.
- `docs/qa/modo-revision.md`: matriz de pruebas (tipos × teclas), datos de prueba y evidencia.
- `TODO.md`: registrar la funcionalidad y su estado.
- `docs/README.md`: no requiere cambios (el plan sigue la convención `docs/plans/YYYY-MM-DD-<slug>.md`).
