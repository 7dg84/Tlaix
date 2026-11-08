# Modo revisión de columnas: orden configurable y búsqueda rápida

- **Fecha:** 2026-10-27
- **Estado:** propuesto (pendiente de aprobación)
- **Alcance:** solo `ReviewMode` con `axis="column"` (revisión de una columna)
- **Agentes previstos:** `frontend` (implementación), `test-writer` (tests de lógica), `qa` (matriz y E2E), `docker-ops` (rebuild y verificación), `orchestrator` (coordinación)
- **Sin cambios de backend, sin migraciones y sin dependencias nuevas**

## 1. Objetivo

Ampliar el modo revisión de columnas con dos modos seleccionables desde dos iconos en la parte superior izquierda:

1. **Orden**: recorrer los registros ordenados por:
   - nombre de fila (orden alfabético),
   - la columna revisada,
   - cualquier otra columna de la pestaña,
   - orden original del backend,
   con dirección **ascendente** o **descendente**.
2. **Búsqueda**: localizar rápidamente un registro por nombre de fila o por el valor actual de la columna, y editarlo con teclado sin recorrer toda la lista.

El modo revisión de filas (`axis="row"`) no cambia.

## 2. Estado actual y aclaración

En `frontend/src/components/ReviewMode.tsx` el recorrido de una columna:

- carga **todas** las filas mediante `GET /api/tables/<table_id>/columns/<column_id>/cellvalues/`;
- recorre los ítems en el orden determinista del backend (`order`, `created_at`, `id`);
- no tiene orden alfabético, selector de columna ni búsqueda;
- usa `normalizeText` y `filterOptions` de `frontend/src/lib/review.ts` para el filtro de opciones de las listas.

> **Nota:** en la rama `base-sync` no existe un modo alfabético previo. Si existe en otra rama local, este plan lo toma como base y lo extiende. La propuesta crea el modo **Orden** con la opción **Nombre de fila** como orden alfabético inicial.

## 3. Decisiones de producto

| Tema | Decisión propuesta |
| --- | --- |
| Modo inicial | `Orden`, con **Nombre de fila · Ascendente** para que el modo alfabético sea visible desde el primer momento. |
| Orden original | Opción explícita `Orden original` para conservar el recorrido actual del backend. |
| Columnas ordenables | Todas las columnas de la pestaña activa, incluida la columna revisada. |
| Dirección | `Ascendente` / `Descendente`; en `Orden original` el selector de dirección se deshabilita. |
| Valores vacíos | `null`, `undefined` y `""` van **al final** en ambas direcciones. |
| Desempate | Nombre de fila con `Intl.Collator("es")`; después el orden original. |
| Orden con edición | El orden se congela al aplicarlo. Editar un valor **no reordena en caliente**; se usa el botón `Reordenar` o se cambia el criterio. |
| Búsqueda | Nombre de fila + valor actual de la columna revisada; sin acentos, sin distinguir mayúsculas. |
| Resultado de búsqueda | `Enter` abre el editor del registro; `Esc` vuelve a los resultados. |
| Cambio de modo/criterio con cambios pendientes | Guarda primero; si falla, no cambia de modo/criterio. |
| Persistencia | El criterio y la búsqueda viven mientras el overlay está abierto; no se guardan en `localStorage` en el MVP. |

## 4. Experiencia de usuario

### 4.1 Cabecera y selector de modo

En la cabecera actual, a la izquierda del título, se añade un grupo de dos botones icono:

```text
┌────────────────────────────────────────────────────────────────────┐
│ [↓AZ] [🔍]  Revisar columna: "Estado"                 12 / 120  [X] │
│             Tipo: Lista · 3 opciones                               │
├────────────────────────────────────────────────────────────────────┤
│ Ordenar por: [Nombre de fila ▾]  [↑ Ascendente]  [↻ Reordenar]     │
├────────────────────────────────────────────────────────────────────┤
│ Fila: "Cliente 3"                                                  │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ [ editor de la celda ]                                         │ │
│ └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

- `↓AZ` (o `ArrowDownAZ`) = modo **Orden**.
- `🔍` (`Search`) = modo **Búsqueda**.
- El botón activo usa `aria-pressed="true"` y un fondo de acento.
- `title` y `aria-label`: `"Modo orden"` y `"Modo búsqueda"`.
- En pantallas estrechas se muestran solo los iconos; el título se trunca.
- En `axis="row"` no se muestra el grupo ni los controles de orden/búsqueda; se conserva el icono `ScanLine` actual.

### 4.2 Modo Orden

Controles visibles solo en `axis="column"` y `mode="order"`:

- **Ordenar por**: `Select` con las opciones:
  - `Orden original`
  - `Nombre de fila`
  - cada columna de la pestaña (incluida la columna revisada)
- **Dirección**: botón que alterna `Ascendente` / `Descendente`, con `ArrowUpAZ` / `ArrowDownAZ`.
- **Reordenar**: botón `RefreshCw` que recalcula el orden con los valores actuales. Útil después de editar si el criterio es la columna revisada.

Comportamiento:

- Al abrir la revisión de una columna, el orden inicial es `Nombre de fila · Ascendente`.
- Cambiar de criterio o dirección guarda antes el cambio pendiente.
- Al cambiar el orden se conserva la fila actual si sigue existiendo; si no, se selecciona el primer registro.
- Mientras se cargan los valores de otra columna, los controles se deshabilitan y se muestra un spinner pequeño.
- Si la carga falla, se mantiene el orden anterior y se muestra un toast de error.
- El subtítulo muestra el criterio activo, por ejemplo: `Ordenado por: Estado · Descendente`.

### 4.3 Modo Búsqueda

Al pulsar el icono de búsqueda se muestra una vista de lista:

```text
┌────────────────────────────────────────────────────────────────────┐
│ [↓AZ] [🔍]  Revisar columna: "Estado"                 12 / 120  [X] │
├────────────────────────────────────────────────────────────────────┤
│ 🔍 [ Buscar por nombre de fila o valor...              ]  3 de 120 │
├────────────────────────────────────────────────────────────────────┤
│  Cliente 3                                      Activo             │
│  Cliente 7                                      Inactivo           │
│  Cliente 12                                     Activo             │
│  ...                                                               │
├────────────────────────────────────────────────────────────────────┤
│ [↑/↓] Navegar   [Enter] Editar   [Esc] Volver   [Ctrl+F] Buscar     │
└────────────────────────────────────────────────────────────────────┘
```

- El campo de búsqueda tiene foco al entrar al modo.
- Filtra por subcadena normalizada sobre:
  - `rowName`,
  - valor actual de la columna revisada (formateado: checkbox `Sí`/`No`, fecha ISO, etc.).
- Sin consulta se muestran todos los registros en el orden activo.
- Cada resultado muestra nombre de fila y valor; si la consulta coincide con el valor, se puede resaltar la coincidencia.
- Contador `N de M` y estado vacío `Sin coincidencias`.
- La lista tiene `max-height` y scroll propio; no se virtualiza en el MVP.

#### Edición rápida desde la búsqueda

Al pulsar `Enter` sobre un resultado:

1. Si hay un cambio pendiente en el editor, se guarda.
2. Se selecciona ese registro y se muestra el editor normal.
3. El foco pasa al campo de edición.
4. Se mantiene la consulta de búsqueda.

Dentro del editor abierto desde búsqueda:

- `Enter`: guarda y **vuelve a la lista de resultados** (no avanza al siguiente registro).
- `Esc`: guarda y vuelve a la lista; si no hay cambios, vuelve directamente.
- `←` / `→`: guarda y se mueve al resultado anterior/siguiente **dentro del filtro actual**.
- `Ctrl+Enter` (opcional): guarda y avanza al siguiente resultado sin volver a la lista.
- Si el guardado falla, se queda en el editor y se muestra el panel de error existente.

Al volver a la lista, el resaltado queda en el registro editado si sigue visible; si no, en el primero.

### 4.4 Cambio entre modos

- **Orden → Búsqueda:** guarda el cambio pendiente; si falla, permanece en Orden. Al entrar, enfoca el buscador y resalta la fila actual si aparece en los resultados.
- **Búsqueda → Orden:** si está en el editor, guarda; si está en la lista, no hay nada que guardar. Vuelve al editor de la fila actual y conserva el criterio de orden.
- La consulta de búsqueda se conserva mientras el overlay esté abierto; al volver a Búsqueda se recupera.
- Los botones de modo se deshabilitan mientras hay un guardado en curso.

## 5. Teclado

### 5.1 Modo Orden

Se conserva el teclado actual:

| Tecla | Acción |
| --- | --- |
| `←` / `→` | Guarda si cambió y va al anterior/siguiente. |
| `Enter` | Guarda y avanza. |
| `Esc` | Guarda y cierra (o limpia filtro de lista, como hoy). |
| `Ctrl+F` o `/` fuera de un input | Pasa a modo Búsqueda y enfoca el buscador. |

### 5.2 Modo Búsqueda · lista

| Tecla | Acción |
| --- | --- |
| `↑` / `↓` | Mueve el resaltado entre resultados. |
| `Home` / `End` | Primer/último resultado. |
| `Enter` | Abre el editor del resultado resaltado. |
| `Esc` | Si hay consulta, la limpia; si está vacía, vuelve a modo Orden. |
| `Ctrl+F` | Enfoca el buscador. |
| `Tab` | Buscador → lista → botón cerrar. |

### 5.3 Modo Búsqueda · editor

| Tecla | Acción |
| --- | --- |
| `Enter` | Guarda y vuelve a la lista. |
| `Esc` | Guarda y vuelve a la lista. |
| `←` / `→` | Guarda y mueve al resultado anterior/siguiente del filtro. |
| `Ctrl+Enter` | Guarda y avanza al siguiente resultado (opcional). |
| Resto de teclas | Comportamiento actual por tipo (`text`, `int`, `float`, `date`, `checkbox`, `select`). |

Reglas generales:

- Ignorar eventos con `Ctrl`/`Meta`/`Alt`, salvo los atajos definidos.
- Ignorar `event.nativeEvent.isComposing` (IME).
- No interceptar `/` cuando el foco está en un input, textarea o contenteditable.
- `Escape` en el editor de búsqueda nunca cierra el overlay directamente: primero vuelve a la lista.
- El foco se restaura al elemento anterior al cerrar el overlay (comportamiento actual).

## 6. Datos y lógica

### 6.1 Reutilización del endpoint existente

No se modifica el backend. Para ordenar por otra columna se usa el endpoint que ya existe:

```text
GET /api/tables/<table_id>/columns/<column_id>/cellvalues/
```

- Para la columna revisada, los valores ya están en `items`.
- Para otra columna, se hace una petición adicional y se construye un mapa `row_id -> value`.
- Se cachea cada columna consultada en un `Map` durante la vida del overlay.
- Para `Nombre de fila` y `Orden original` no se hace ninguna petición extra.

Ventajas:

- sin cambios de contrato ni migraciones;
- ordenación en el cliente con `Intl.Collator("es")`, incluyendo `ñ` y acentos;
- una sola petición extra por columna de orden (y queda cacheada).

Límite aceptado: si la tabla crece a decenas de miles de filas, la ordenación en cliente puede moverse a backend en una fase posterior sin cambiar la UI.

### 6.2 Tipos nuevos

En `frontend/src/lib/review.ts`:

```ts
export type ReviewSortDirection = "asc" | "desc";
export type ReviewSortKey = "original" | "row-name" | string;

export interface ReviewColumn {
  id: string;
  name: string;
  type: ColumnType;
}

export interface ReviewSearchResult {
  item: ReviewItem;
  /** Índice dentro de la lista ya ordenada. */
  index: number;
}
```

### 6.3 Comparador

Reglas:

- `text` / `select`: `Intl.Collator("es", { sensitivity: "base", numeric: true })`.
- `int` / `float`: comparación numérica; si no es finito, comparación de texto.
- `date`: `Date.parse`; si la fecha no es válida, comparación de texto.
- `checkbox`: `false` antes que `true`.
- Vacíos (`null`, `undefined`, `""`): siempre al final, en asc y desc.
- Desempate: nombre de fila con el collator; después índice original.
- `Descendente`: se invierte solo la comparación de valores no vacíos; los vacíos siguen al final.

API propuesta:

```ts
export function compareReviewValues(
  type: ColumnType,
  a: unknown,
  b: unknown,
  collator?: Intl.Collator
): number;

export function sortReviewItems(
  items: ReviewItem[],
  options: {
    sortKey: ReviewSortKey;
    direction: ReviewSortDirection;
    columns: ReviewColumn[];
    /** Valores de la columna de orden, por row_id. Solo si sortKey es una columna. */
    valuesByRow?: Map<string, unknown>;
  }
): ReviewItem[];
```

`sortReviewItems` devuelve una copia; no muta `items`.

### 6.4 Búsqueda

```ts
export function formatReviewValue(type: ColumnType, value: unknown): string;

export function searchReviewItems(
  items: ReviewItem[],
  query: string
): ReviewSearchResult[];
```

- `formatReviewValue`: checkbox → `Sí`/`No`; vacío → `—`; resto → `String(value)`.
- `searchReviewItems`: normaliza consulta y texto con `normalizeText`; devuelve todos los ítems si la consulta está vacía.
- La búsqueda no cambia el orden; conserva el índice de la lista ordenada.

### 6.5 Estado del overlay

Añadir a `ReviewMode`:

```ts
type ReviewViewMode = "order" | "search";
type ReviewSearchView = "list" | "edit";

const [viewMode, setViewMode] = useState<ReviewViewMode>("order");
const [searchView, setSearchView] = useState<ReviewSearchView>("list");
const [sortKey, setSortKey] = useState<ReviewSortKey>("row-name");
const [sortDirection, setSortDirection] = useState<ReviewSortDirection>("asc");
const [searchQuery, setSearchQuery] = useState("");
const [searchHighlighted, setSearchHighlighted] = useState(0);
const [sortLoading, setSortLoading] = useState(false);
const [orderedIds, setOrderedIds] = useState<string[]>([]);
```

- `orderedIds` congela el orden. `orderedItems = orderedIds.map(id => itemsById.get(id))`.
- Los cambios de valor actualizan `items`, pero **no** `orderedIds`.
- `Reordenar` o cambiar criterio/dirección recalculan `orderedIds`.
- Al cambiar de criterio, se conserva la fila actual por `rowId` si sigue existiendo.
- Al recargar datos (`reloadToken`), se limpia la caché de columnas y se recalcula el orden.

### 6.6 Carga de valores para ordenar por otra columna

```ts
const sortCacheRef = useRef<Map<string, Map<string, unknown>>>(new Map());

async function ensureSortValues(columnId: string): Promise<Map<string, unknown> | null> {
  if (columnId === targetId) {
    return new Map(items.map((item) => [item.rowId, item.value]));
  }
  const cached = sortCacheRef.current.get(columnId);
  if (cached) return cached;

  setSortLoading(true);
  try {
    const response = await reviewService.getColumnCellValues(tableId, columnId);
    const values = new Map(
      response.items.map((item) => [item.row_id, item.value])
    );
    sortCacheRef.current.set(columnId, values);
    return values;
  } catch (error) {
    if (!isAuthError(error)) {
      toast.error("No se pudo cargar la columna para ordenar.");
    }
    return null;
  } finally {
    setSortLoading(false);
  }
}
```

- Si `ensureSortValues` devuelve `null`, no se cambia el criterio.
- La petición debe poder cancelarse con `AbortController` al cerrar el overlay.
- Si la columna ya no existe (404), se muestra el error y se mantiene el orden anterior.

### 6.7 Guardado antes de cambiar de contexto

Se añade un helper:

```ts
async function commitPending(): Promise<boolean> {
  if (!current) return true;
  return commitValue(readDraftValue(), "stay");
}
```

- `commitValue` se amplía para aceptar `"stay"` además de número y `"close"`.
- `failedSaveRef` debe recordar `"stay"` para que `Reintentar` no avance.
- Se usa en:
  - cambio de modo,
  - cambio de criterio/dirección,
  - selección de un resultado de búsqueda,
  - salida del editor de búsqueda a la lista.

## 7. Cambios por archivo

| Archivo | Cambio |
| --- | --- |
| `frontend/src/lib/review.ts` | Tipos `ReviewSortDirection`, `ReviewSortKey`, `ReviewColumn`, `ReviewSearchResult`; `compareReviewValues`, `sortReviewItems`, `formatReviewValue`, `searchReviewItems`. |
| `frontend/src/lib/review.test.ts` | Tests unitarios de comparación, orden, búsqueda y formateo. |
| `frontend/src/components/ReviewMode.tsx` | Estado de modo/orden/búsqueda; iconos de cabecera; barra de orden; vista de búsqueda; edición desde búsqueda; teclado; caché de columnas; guardado antes de cambiar de contexto. |
| `frontend/src/pages/TableView.tsx` | Pasar `columns={columns}` a `ReviewMode`. Sin otros cambios. |
| `frontend/src/api/review.ts` | Sin cambios: se reutiliza `getColumnCellValues`. |
| `TODO.md` | Marcar el ítem de orden/búsqueda como completado cuando pase QA. |
| `docs/qa/2026-10-27-modo-revision-orden-busqueda.md` | Matriz de pruebas y evidencia E2E (se crea en la fase de QA). |

No se toca `backend/`.

## 8. Fases de implementación

### Fase 1 — Lógica y tests (sin UI)

1. Añadir tipos y helpers en `lib/review.ts`.
2. Implementar comparador por tipo, nulls last, dirección y desempate.
3. Implementar búsqueda normalizada y formateo de valores.
4. Añadir tests unitarios en `lib/review.test.ts`.
5. Ejecutar `npm test` y `npx tsc --noEmit -p tsconfig.app.json`.

**Criterio de salida:** helpers cubiertos y sin errores de tipos.

### Fase 2 — Modo Orden en `ReviewMode`

1. Añadir `viewMode`, `sortKey`, `sortDirection`, `orderedIds`, `sortLoading`.
2. Pasar `columns` desde `TableView`.
3. Añadir iconos de modo en la cabecera.
4. Añadir barra `Ordenar por` + dirección + `Reordenar`.
5. Implementar `ensureSortValues` con caché y manejo de errores.
6. Recalcular `orderedIds` al cargar, cambiar criterio/dirección o pulsar `Reordenar`; conservar fila actual.
7. Guardar antes de cambiar de criterio/dirección.
8. Verificar que el modo fila no muestra los controles.

**Criterio de salida:** orden asc/desc por nombre de fila y por cada tipo de columna; sin regresiones en el editor actual.

### Fase 3 — Modo Búsqueda

1. Añadir `searchQuery`, `searchHighlighted`, `searchView`.
2. Implementar vista lista con buscador, contador, resultados y estado vacío.
3. Implementar `Enter` para abrir el editor y `Esc` para volver.
4. Implementar navegación `↑/↓`, `Home/End`, `Ctrl+F`.
5. Implementar edición desde búsqueda: `Enter`/`Esc` guardan y vuelven; `←/→` mueven dentro del filtro.
6. Guardar antes de seleccionar otro resultado.
7. Ajustar las pistas del pie según el modo.

**Criterio de salida:** flujo completo de búsqueda y edición solo con teclado.

### Fase 4 — QA, E2E y documentación

1. Crear tabla temporal con 6 tipos y datos que cubran:
   - acentos y `ñ`,
   - números negativos/cero/decimales,
   - fechas válidas e inválidas,
   - checkbox `true`/`false`/vacío,
   - listas con opciones y valores legados,
   - valores vacíos.
2. Verificar orden por nombre de fila y por cada columna, asc/desc, nulls last y desempate.
3. Verificar búsqueda por nombre y por valor, sin acentos/mayúsculas, y edición con teclado.
4. Verificar guardado antes de cambiar de modo/criterio/resultado.
5. Verificar errores 401/403/404 y reintento.
6. Verificar viewport móvil y accesibilidad (`aria-pressed`, `aria-live`, foco).
7. Regresión: modo fila, calendario, 401 y creación de columnas.
8. Rebuild del frontend y E2E en `http://localhost`.
9. Actualizar `TODO.md` y crear `docs/qa/...` con evidencia.

## 9. Matriz de aceptación

| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir revisión de columna | Modo Orden activo; orden por nombre de fila asc; dos iconos arriba a la izquierda. |
| 2 | Cambiar a Descendente | Orden Z-A; la fila actual se conserva si existe. |
| 3 | Ordenar por columna de texto | A-Z / Z-A con acentos y `ñ` según `Intl.Collator("es")`. |
| 4 | Ordenar por entero/decimal | Numérico asc/desc; vacíos al final. |
| 5 | Ordenar por fecha | Cronológico asc/desc; fechas inválidas al final. |
| 6 | Ordenar por checkbox | `false` antes que `true` en asc; vacíos al final. |
| 7 | Ordenar por lista | Alfabético por etiqueta; valores legados incluidos. |
| 8 | Orden original | Recupera el orden del backend; dirección deshabilitada. |
| 9 | Editar con orden por columna revisada | El valor se guarda; el orden no salta hasta `Reordenar` o cambiar criterio. |
| 10 | Cambiar criterio con cambio pendiente | Guarda primero; si falla, no cambia. |
| 11 | Buscar por nombre | Filtra sin distinguir mayúsculas/acentos; `Enter` abre el editor. |
| 12 | Buscar por valor | Encuentra por el valor actual de la columna. |
| 13 | Búsqueda sin resultados | Estado `Sin coincidencias`; no se edita nada. |
| 14 | Editar desde búsqueda | `Enter` guarda y vuelve a la lista; la consulta se conserva. |
| 15 | `←/→` en editor de búsqueda | Guarda y mueve dentro del filtro actual. |
| 16 | `Esc` en búsqueda | Limpia consulta; si está vacía, vuelve a Orden. |
| 17 | `Ctrl+F` | Enfoca el buscador sin abrir el buscar del navegador. |
| 18 | Error al cargar columna de orden | Toast; se mantiene el orden anterior. |
| 19 | 401 durante guardado/carga | Redirección global existente; sin toast duplicado. |
| 20 | Modo fila | Sin iconos de modo ni controles de orden/búsqueda; comportamiento actual. |
| 21 | Viewport móvil | Iconos visibles, barra de orden envuelve, lista y editor usables. |
| 22 | Teclado completo | Abrir, cambiar modo, ordenar, buscar, editar, guardar y cerrar sin ratón. |

## 10. Tests

### Unitarios (`frontend/src/lib/review.test.ts`)

- `compareReviewValues`:
  - texto con mayúsculas/acentos/`ñ`;
  - números, negativos, decimales y cadenas numéricas;
  - fechas válidas e inválidas;
  - checkbox y vacíos;
  - nulls last en asc y desc.
- `sortReviewItems`:
  - nombre de fila asc/desc;
  - columna de texto, entero, decimal, fecha, checkbox y lista;
  - desempate estable;
  - `original` no muta ni reordena;
  - `valuesByRow` ausente se trata como vacío.
- `formatReviewValue`:
  - checkbox `Sí`/`No`, vacío `—`, texto/número/fecha.
- `searchReviewItems`:
  - consulta vacía devuelve todos;
  - nombre, valor, acentos/mayúsculas;
  - sin coincidencias;
  - conserva el índice de la lista ordenada.

### Manuales / E2E

- Matriz de la sección 9.
- Capturas o snapshots de:
  - cabecera con los dos iconos;
  - modo Orden con selector y dirección;
  - modo Búsqueda con resultados;
  - editor abierto desde búsqueda.
- Verificar que el DOM tenga `aria-pressed`, `role="listbox"`, `role="option"` y `aria-live` en el contador.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Petición extra al ordenar por otra columna | Caché por columna; spinner; mantener el orden anterior si falla. |
| El orden se congela y el usuario espera reordenación inmediata | Botón `Reordenar` visible y texto de ayuda; cambiar criterio también reordena. |
| Conflictos de teclado entre buscador y editor | Enrutar teclas por `viewMode`/`searchView`; tests manuales de teclado. |
| Pérdida de cambios al cambiar de modo/resultado | `commitPending` obligatorio antes de cambiar de contexto. |
| Listas muy grandes | Scroll con `max-height`; fase 2: virtualización o orden en backend. |
| Orden español incorrecto | `Intl.Collator("es", { sensitivity: "base", numeric: true })`. |
| Regresión en modo fila | Funcionalidad condicionada a `axis === "column"`. |
| Accesibilidad | `aria-pressed`, `aria-label`, `aria-live`, foco gestionado, trampa de foco existente. |

## 12. Fuera de alcance

- Ordenar o buscar en el modo revisión de filas.
- Ordenar por varias columnas simultáneamente (se puede añadir como fase 2).
- Buscar en todas las columnas de la tabla (MVP: nombre de fila + columna revisada).
- Persistir el criterio de orden o la búsqueda entre sesiones.
- Cambiar el orden real de filas/columnas en la tabla o en la base de datos.
- Virtualización de listas muy grandes.
- Cambios de backend, migraciones o nuevas dependencias.

## 13. Criterio de terminado

- [ ] `npm test` pasa (suite actual + tests nuevos).
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sin errores.
- [ ] `npm run build` correcto.
- [ ] Matriz de aceptación verificada en navegador.
- [ ] Modo fila, calendario y flujo 401 sin regresiones.
- [ ] `TODO.md` actualizado.
- [ ] Documento de QA con evidencia creado.
- [ ] Sin cambios en `backend/`.
