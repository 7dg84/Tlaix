# Modo revisión: refresco al cambiar de orden y valor de la columna de orden

- **Fecha:** 2026-11-04
- **Estado:** aprobado para implementación
- **Alcance:** `ReviewMode` con `axis="column"` (revisión de una columna)
- **Agentes:** `frontend` (implementación), `test-writer` (tests), `qa` (revisión y E2E), `docker-ops` (rebuild local)
- **Sin cambios de backend, sin migraciones, sin dependencias nuevas y sin despliegue al dominio**

## 1. Objetivo

Completar el modo revisión de columnas con dos comportamientos:

1. **Al cambiar el criterio de orden** (por ejemplo, de `Nombre de fila` a `equipo`, o de `equipo` a `tarea 1`), el registro actual debe pasar a ser **el primero del nuevo orden**.
2. **Debajo de `Fila:`** debe mostrarse el valor de la celda de la columna por la que se está ordenando para el registro actual.

Ejemplo de referencia:

```text
Nombre | equipo   | tarea 1
uno    | equipo 1 | false
dos    | equipo 1 | false
tres   | equipo 2 | false
```

Al revisar la columna `tarea 1` y ordenar por `equipo`:

```text
Fila: uno
equipo: equipo 1
```

Al avanzar a `tres`:

```text
Fila: tres
equipo: equipo 2
```

> En el ejemplo original se escribió “equipo 3” para la tercera fila; el dato real es `equipo 2`. La UI muestra el valor real de la celda.

## 2. Reglas de producto

| Tema | Decisión |
| --- | --- |
| Cambio de criterio | Si `sortKey` cambia, el índice visible se reinicia a `0` después de aplicar el nuevo orden. |
| Cambio de dirección | Cambiar solo `Ascendente`/`Descendente` **conserva** el registro actual si sigue existiendo. |
| Botón `Reordenar` | Conserva el registro actual; solo recalcula posiciones con los valores actuales. |
| Valor mostrado | Se muestra el valor de la columna de orden **usado para congelar el orden actual**. |
| Edición de la columna de orden | El valor mostrado no cambia hasta `Reordenar` o hasta cambiar criterio/dirección, porque el orden está congelado. |
| Criterios sin celda | Con `Orden original` o `Nombre de fila` no se muestra la línea adicional. |
| Valor vacío | Se muestra `—` usando `formatReviewValue`. |
| Fila sin valor en la columna de orden | Se muestra `—`. |
| Modo búsqueda | La línea se muestra en el editor; en la lista de resultados no aplica. |
| Modo fila (`axis="row"`) | Sin cambios: no hay orden configurable ni línea adicional. |
| Error al cargar la columna de orden | Se mantiene el orden y el valor mostrado anteriores; toast existente. |

## 3. Experiencia de usuario

En la vista de edición, el bloque actual:

```text
Fila: uno
```

pasa a:

```text
Fila: uno
equipo: equipo 1
```

Reglas visuales:

- La segunda línea usa el mismo estilo secundario que `Fila:`.
- El nombre de la columna y el valor se muestran en texto legible, con truncado si son largos.
- La línea solo aparece cuando `sortKey` es una columna real (incluida la columna revisada).
- No se muestra para `Orden original` ni `Nombre de fila`.
- En el editor abierto desde búsqueda se mantiene la línea; en la lista de búsqueda no se muestra.
- El contador `N / M` y los controles de orden no cambian.

## 4. Diseño técnico

### 4.1 Estado del orden en `ReviewMode`

Añadir un estado que guarde los valores usados al congelar el orden:

```ts
const [activeSortValues, setActiveSortValues] =
  useState<Map<string, unknown> | null>(null);
```

- Se actualiza al aplicar un orden por columna.
- Se limpia al recargar datos (`reloadToken`) y al volver a un criterio sin celda.
- No se actualiza al editar una celda; el orden está congelado hasta `Reordenar` o cambiar criterio/dirección.

### 4.2 `computeOrder` devuelve también los valores

Cambiar el retorno de `computeOrder` para incluir el mapa usado:

```ts
interface ComputedOrder {
  order: ReviewItem[];
  valuesByRow: Map<string, unknown> | null;
}
```

- `original` y `row-name`: `valuesByRow: null`.
- Columna revisada: mapa construido desde `sourceItems`.
- Otra columna: mapa obtenido de `ensureSortValues` (y cacheado en `sortCacheRef`).

### 4.3 `applyOrder` con opción de reinicio

```ts
const applyOrder = (
  nextOrder: ReviewItem[],
  options: {
    resetToFirst?: boolean;
    valuesByRow?: Map<string, unknown> | null;
  } = {}
) => {
  setOrderedIds(nextOrder.map((item) => item.rowId));
  setActiveSortValues(options.valuesByRow ?? null);

  if (options.resetToFirst) {
    setIndex(0);
    return;
  }

  const currentRowId = current?.rowId;
  const nextIndex = currentRowId
    ? nextOrder.findIndex((item) => item.rowId === currentRowId)
    : -1;
  setIndex(nextIndex >= 0 ? nextIndex : 0);
};
```

Uso:

- `changeSort(nextKey, nextDirection)`:
  - `const criterionChanged = nextKey !== sortKey;`
  - `applyOrder(result.order, { resetToFirst: criterionChanged, valuesByRow: result.valuesByRow });`
- `reorder()`:
  - `applyOrder(result.order, { valuesByRow: result.valuesByRow });`
- Carga inicial:
  - `sortKey = "row-name"`, `activeSortValues = null`, índice `0`.

### 4.4 Helper puro para la línea de orden

Añadir en `frontend/src/lib/review.ts`:

```ts
export interface ReviewSortDisplay {
  columnName: string;
  value: string;
}

export function resolveReviewSortDisplay(options: {
  sortKey: ReviewSortKey;
  rowId: string;
  columns: ReviewColumn[];
  valuesByRow?: Map<string, unknown> | null;
  target: {
    id: string;
    name: string;
    type: ColumnType;
    value: unknown;
  };
}): ReviewSortDisplay | null;
```

Comportamiento:

- `original` o `row-name` → `null`.
- `sortKey` que coincide con la columna revisada → nombre y tipo de `target`; valor desde `valuesByRow` y, como respaldo, `target.value`.
- `sortKey` de otra columna → nombre/tipo desde `columns`; valor desde `valuesByRow`.
- Si la columna no existe y no es la revisada → `null`.
- El valor se formatea con `formatReviewValue`.
- Valor ausente/vacío → `—`.

### 4.5 Render en `ReviewMode`

En el bloque de `Fila:`:

```tsx
const sortDisplay = useMemo(() => {
  if (!isColumnAxis || !current) return null;
  return resolveReviewSortDisplay({
    sortKey,
    rowId: current.rowId,
    columns,
    valuesByRow: activeSortValues,
    target: {
      id: targetId,
      name: targetName,
      type: current.type,
      value: current.value,
    },
  });
}, [isColumnAxis, current, sortKey, columns, activeSortValues, targetId, targetName]);
```

Y debajo de la línea de `Fila:`:

```tsx
{sortDisplay && (
  <p className="text-sm text-muted-foreground">
    {sortDisplay.columnName}:{" "}
    <span className="font-medium text-foreground">{sortDisplay.value}</span>
  </p>
)}
```

## 5. Casos límite

- **Cambio de criterio con cambio pendiente:** se guarda primero; si falla, no se cambia ni se reinicia el índice.
- **Cambio de criterio a una columna que falla al cargar:** se mantiene el orden, el índice y la línea anteriores.
- **Cambio de criterio a `Orden original`:** se reinicia al primer registro; no se muestra línea.
- **Cambio de criterio a `Nombre de fila`:** se reinicia al primer registro; no se muestra línea.
- **Cambio de dirección:** no reinicia; conserva la fila actual.
- **Reordenar:** no reinicia; conserva la fila actual.
- **Edición de la columna de orden:** el valor mostrado sigue siendo el usado para congelar el orden; `Reordenar` actualiza ambos.
- **Búsqueda:** el editor conserva la línea; la lista no la muestra.
- **Modo fila:** no se muestra.
- **Valor vacío o fila ausente:** `—`.

## 6. Matriz de aceptación

| # | Caso | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir revisión de columna | Orden inicial `Nombre de fila · Ascendente`, primer registro, sin línea de orden. |
| 2 | Ordenar por `equipo` desde `Nombre de fila` | Índice vuelve a `0`; debajo de `Fila:` aparece `equipo: equipo 1`. |
| 3 | Avanzar al siguiente registro del mismo equipo | La línea muestra el mismo valor de equipo. |
| 4 | Avanzar al primer registro de otro equipo | La línea muestra el nuevo valor de equipo. |
| 5 | Cambiar de `equipo` a `tarea 1` | Índice vuelve a `0`; la línea muestra `tarea 1` y el valor congelado. |
| 6 | Cambiar solo de ascendente a descendente | La fila actual se conserva si sigue existiendo. |
| 7 | Pulsar `Reordenar` | La fila actual se conserva; la línea se actualiza con los valores actuales. |
| 8 | Ordenar por `Orden original` | Índice `0`; no se muestra línea. |
| 9 | Ordenar por `Nombre de fila` | Índice `0`; no se muestra línea. |
| 10 | Valor vacío en la columna de orden | La línea muestra `—`. |
| 11 | Editar la columna de orden | El orden y la línea no cambian hasta `Reordenar` o cambiar criterio. |
| 12 | Editor desde búsqueda | La línea se mantiene; la lista de búsqueda no la muestra. |
| 13 | Modo fila | Sin cambios. |
| 14 | Error al cargar columna de orden | Se mantiene el estado anterior; toast existente. |

## 7. Tests

### Unitarios (`frontend/src/lib/review.test.ts`)

- `resolveReviewSortDisplay`:
  - `original` y `row-name` → `null`;
  - columna revisada con valor en el mapa;
  - columna revisada sin mapa → respaldo `target.value`;
  - otra columna con valor;
  - valor vacío → `—`;
  - fila ausente → `—`;
  - columna inexistente → `null`;
  - checkbox formateado como `Sí`/`No`.
- Regresión de `sortReviewItems` y `formatReviewValue`.

### Manuales / E2E

- Matriz de la sección 6.
- Verificar que cambiar de criterio deja el primer registro y que cambiar solo la dirección conserva la fila.
- Verificar la línea bajo `Fila:` con dos filas del mismo equipo y una de otro.
- Verificar `Reordenar` después de editar la columna de orden.
- Regresión: búsqueda, modo fila, guardado antes de cambiar de contexto, 401.

## 8. Tareas para subagentes

### `frontend`

Implementar exclusivamente:

- `frontend/src/lib/review.ts`: `ReviewSortDisplay`, `resolveReviewSortDisplay`.
- `frontend/src/components/ReviewMode.tsx`:
  - estado `activeSortValues`;
  - retorno de `computeOrder` con `valuesByRow`;
  - `applyOrder` con `resetToFirst`;
  - reinicio al cambiar `sortKey`;
  - render de la línea bajo `Fila:`;
  - limpieza al recargar datos.
- No tocar backend, `package.json` ni dependencias.
- No introducir `sonner`.
- Comentarios y textos en español.
- Ejecutar `npx tsc --noEmit -p tsconfig.app.json`.

### `test-writer`

- Añadir tests unitarios de `resolveReviewSortDisplay` en `frontend/src/lib/review.test.ts`.
- Cubrir los casos de la sección 7.
- No modificar código de producción.
- Ejecutar `npm test` y reportar fallos.

### `qa`

- Revisar la implementación contra este plan.
- Verificar la matriz de aceptación en navegador local.
- Comprobar que cambiar de criterio reinicia a `0` y que cambiar dirección/`Reordenar` conserva la fila.
- Comprobar la línea bajo `Fila:` con el ejemplo `equipo`.
- Regresión de búsqueda, modo fila, guardado y 401.
- Crear `docs/qa/2026-11-04-modo-revision-refresco-orden.md` con hallazgos y evidencia.
- No modificar código de producción.

### `docker-ops`

- Reconstruir el contenedor `react` local.
- Verificar que `http://localhost` sirve el bundle nuevo y que la política de caché sigue vigente.
- No desplegar a `tlaix.smart-food.cc`.

## 9. Documentación

- Este plan: `docs/plans/2026-11-04-modo-revision-refresco-orden.md`.
- QA: `docs/qa/2026-11-04-modo-revision-refresco-orden.md` (lo crea `qa`).
- No modificar documentos históricos del 2026-10-27 salvo que QA detecte una contradicción; en ese caso, añadir una nota de supersesión.

## 10. Criterio de terminado

- [ ] `npm test` pasa.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sin errores.
- [ ] `npm run build` correcto.
- [ ] Matriz de aceptación verificada en navegador.
- [ ] QA documentado con evidencia.
- [ ] Sin cambios en `backend/`.
- [ ] Sin despliegue al dominio.
