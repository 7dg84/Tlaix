# QA: modo revisión de columnas — orden configurable y búsqueda rápida

- **Fecha:** 2026-10-27 (auditoría estática) · **fixes verificados:** 2026-10-27 · **E2E en navegador:** 2026-10-27
- **Alcance:** implementación del plan `docs/plans/2026-10-27-modo-revision-orden-busqueda.md` (solo `axis="column"`).
- **Tipo de auditoría:** estática profunda + tests unitarios + `tsc`/`build` + **E2E en navegador** contra el contenedor reconstruido.
- **Plan:** `docs/plans/2026-10-27-modo-revision-orden-busqueda.md`
- **Contrato de API reutilizado:** `docs/api/review-cellvalues.md` (sin cambios de backend)
- **Entorno E2E:** contenedor `react` reconstruido; bundle servido **`assets/index-DdSnc6b_.js`**, idéntico al que produce `npm run build` en este árbol (misma fuente, guard de H-01 incluido).
- **Archivos bajo auditoría (sin commit, estado actual del árbol de trabajo):**
  - `frontend/src/components/ReviewMode.tsx` (+943/−65)
  - `frontend/src/lib/review.ts` (+215)
  - `frontend/src/lib/review.test.ts` (+854, 79 tests)
  - `frontend/src/pages/TableView.tsx` (+1)
  - `TODO.md` (+4/−1)
- **Infraestructura del rebuild (fuera del alcance funcional, responsabilidad de `docker-ops`):** `README.md`, `frontend/nginx.conf` (`Cache-Control` para `/index.html` y `/assets/*`) y `docs/ops/2026-10-27-frontend-rebuild-cache.md`. No se auditaron como parte de este plan; solo se usan como contexto del E2E.
- **Estado de `backend/`:** sin cambios. Sin migraciones ni dependencias nuevas.
- **Nota de lectura:** las referencias de línea corresponden al árbol de trabajo actual. El guard nuevo de H-01 desplazó +8 líneas todo lo posterior a `handleKeyDown`; las referencias ya están actualizadas.

## 1. Resumen ejecutivo

La implementación cubre el contrato del plan: los dos iconos de modo existen solo en `axis="column"`, el orden inicial es `Nombre de fila · Ascendente`, el orden se congela en `orderedIds`, hay caché por columna con `AbortController`, `commitPending` se invoca antes de cambiar de modo/criterio/dirección/resultado/cierre, y la búsqueda por nombre/valor funciona con normalización de acentos y mayúsculas.

**Los 3 hallazgos accionables están resueltos y el E2E está cerrado.** Se ejecutaron los 22 casos de la matriz del plan: **19 verificados en navegador**, 1 parcial (#17, el foco automático no es observable con la pestaña oculta del harness), y 2 solo por código por límites del harness (#18 error de carga sin interceptor de red, #21 viewport sin emulación). No hay hallazgos bloqueantes.

| Hallazgo | Severidad original | Estado actual | Verificación |
| --- | --- | --- | --- |
| **H-01** teclado del desplegable de orden procesado por el overlay | Alto | **Resuelto** | Doble guard en `handleKeyDown` (`ReviewMode.tsx:1145-1158`) + E2E: con el desplegable abierto, `Esc` cerró solo el desplegable |
| **H-02** valores no ordenables al principio en descendente | Bajo | **Resuelto** | `isOrderable` (`review.ts:315-340`), 6 tests nuevos, sonda manual y E2E de orden por los 6 tipos |
| **H-05** buscador con patrón combobox incompleto | Informativo | **Resuelto** (con 2 residuales) | `role="combobox"` + `aria-autocomplete` + `aria-expanded` (`1606-1608`); verificado en el DOM del E2E |

Comandos: **138/138 tests**, `tsc` exit 0, `build` correcto (`index-DdSnc6b_.js`, el mismo que sirve el contenedor). **No se detectaron regresiones** en modo fila, teclado del editor, `Ctrl+F`, `/`, `Escape`, botones nativos ni trampa de foco, ni en el E2E.

Queda **1 hallazgo Bajo abierto** (H-03, `TODO.md` con entradas ajenas al plan) y **5 informativos** (H-04, H-06…H-09), más las observaciones sin severidad; ninguno bloqueante.

| Capa | Estado | Evidencia |
| --- | --- | --- |
| Lógica pura (`lib/review.ts`) | OK | 79 tests; sonda manual del comparador (§3.4); E2E por los 6 tipos |
| Componente (`ReviewMode.tsx`) | OK | Lectura completa + diff; H-01/H-05 verificados por código y en E2E |
| Tipado (`tsconfig.app.json`) | OK | `tsc` real: 86 archivos de `src`, exit 0 |
| Build de producción | OK | `built in 7.55s`, `index-DdSnc6b_.js` 500.91 kB |
| E2E navegador | **Verificado** | 22 casos; detalle en §10 |
| Backend | Sin cambios / no aplica | `git status` limpio en `backend/` |

## 2. Alcance y método

1. Lectura completa del plan, del contrato `docs/api/review-cellvalues.md` y de `TODO.md`.
2. Lectura íntegra de `ReviewMode.tsx`, `lib/review.ts` y `lib/review.test.ts`; `git diff` completo de los cinco archivos.
3. Contraste con la implementación real del backend (`CellValue.get_value()` en `backend/api/models.py`) para validar los tipos que llegan al comparador.
4. Ejecución de `npm test`, `npx tsc --noEmit -p tsconfig.app.json` (con `--listFiles` para confirmar que **no** es un no-op) y `npm run build`.
5. Sonda de ejecución de `lib/review.ts` con `node --experimental-strip-types` (script temporal fuera del repo) para comprobar collator español, *nulls last*, descendente, no ordenables y búsqueda. **Repetida** con el código corregido.
6. Inspección de `@radix-ui/react-select@2.2.5`, `@radix-ui/react-use-escape-keydown` y `@radix-ui/react-dismissable-layer` instalados para confirmar el mecanismo de H-01 y validar el fix.
7. Revisión del diff incremental de los fixes (guards de H-01, `isOrderable` de H-02, ARIA de H-05) y de los 6 tests de regresión añadidos por `test-writer`.
8. Búsqueda de otros listeners globales de teclado (`addEventListener("keydown")`) para descartar interferencias con el guard.
9. **E2E en navegador** sobre `http://localhost` con el contenedor reconstruido: tabla temporal de 6 columnas × 6 filas, usuario temporal, eventos de teclado y de puntero reales, verificación de red (401) y de DOM (ARIA). Detalle en §10.
10. Comparación del bundle servido (`assets/index-DdSnc6b_.js`) con el build local para confirmar que el contenedor ejecuta la fuente auditada.

**No se hizo:** pruebas de componente con jsdom/React Testing Library (el proyecto no las tiene), pruebas de backend (no hay cambios), emulación de viewport móvil, simulación de error de carga de columna (sin interceptor de red) ni prueba con lector de pantalla real.

## 3. Comandos y resultados

### 3.1 `npm test`

```text
> vite_react_shadcn_ts@0.0.0 test
> vitest run

 ✓ src/lib/auth.test.ts       (38 tests)  18ms
 ✓ src/lib/review.test.ts     (79 tests)  44ms
 ✓ src/lib/date-name.test.ts  (21 tests)  29ms

 Test Files  3 passed (3)
      Tests  138 passed (138)
   Duration  3.54s
```

Los 6 tests nuevos de `review.test.ts` cubren H-02 (`review.test.ts:887`, `940`, `991`, `1035`, `1061`, `1092`).

### 3.2 `npx tsc --noEmit -p tsconfig.app.json`

```text
TSC_EXIT=0
```

Verificado que el chequeo es real (no un no-op como en el QA de 2026-10-23): `tsconfig.app.json` tiene `"include": ["src"]` y `--listFiles` reporta **86 archivos de `src/`**, incluido `src/components/ReviewMode.tsx`.

> Nota: `tsconfig.app.json` mantiene `strict: false`, `noUnusedLocals: false`, `noImplicitAny: false`. El "0 errores" no implica tipado estricto (ver H-04).

### 3.3 `npm run build`

```text
✓ 2622 modules transformed.
dist/index.html                   1.16 kB
dist/assets/index-Dg5gTxlT.css   64.23 kB │ gzip:  11.41 kB
dist/assets/index-DdSnc6b_.js   500.91 kB │ gzip: 161.90 kB
✓ built in 7.55s
```

El hash **`index-DdSnc6b_.js` coincide con el bundle que sirve el contenedor** (`assets/index-DdSnc6b_.js`), por lo que el E2E se ejecutó contra el código auditado, guard de H-01 incluido. Avisos preexistentes, no bloqueantes: `Browserslist: browsers data (caniuse-lite) is 16 months old` y chunk > 500 kB.

### 3.4 Sonda de la lógica de orden/búsqueda

Ejecutada contra el `lib/review.ts` real (sin tocar el repo):

| Entrada | Resultado | Valoración |
| --- | --- | --- |
| Fechas `[2026-01-15, 2026-03-01, "sin fecha", null, ""]` asc | `f-1, f-2, f-3, f-4, f-5` | Correcto (válidas asc, inválida, vacíos al final) |
| Mismas fechas **desc** | `f-2, f-1, f-3, f-4, f-5` | Correcto (válidas desc, inválida y vacíos al final) |
| Enteros `[5, "abc", 1, "", 0]` asc | `n-5, n-3, n-1, n-2, n-4` | Correcto |
| Mismos enteros **desc** | `n-1, n-3, n-5, n-2, n-4` | Correcto (`"abc"` al final, antes del vacío) |
| Dos no ordenables (`"zzz"`/`"aaa"`) + una válida, asc / desc | `x-3, x-2, x-1` / `x-3, x-1, x-2` | Válida siempre primero; entre inválidas el orden relativo es textual y **sí** sigue la dirección (documentado y testeado en `review.test.ts:1092`) |
| Todos inválidos/vacíos (`"no"`, `""`, `null`), asc / desc | `v-3, v-2, v-1` en ambas | Desempate por nombre, no invertido; estable |
| Texto `[b, A, null]` asc / desc | `t-2, t-1, t-3` / `t-1, t-2, t-3` | Sin cambios respecto a la base |
| Checkbox `[true, false, null]` asc / desc | `c-2, c-1, c-3` / `c-1, c-2, c-3` | Sin cambios respecto a la base |
| Otra columna vía `valuesByRow` (`5`, `"abc"`, `null`) asc / desc | `t-1, t-2, t-3` en ambas | Correcto (inválido y vacío al final) |
| Empates `7` en Beta/Alfa/Beta, desc | `s-2, s-1, s-3` | Desempate por nombre y orden original, no invertido |
| Nombres `[Ñandú, Nube, Ávila, Zorro, avila]` asc | `Ávila, avila, Nube, Ñandú, Zorro` | Correcto (`n < ñ < o`, acentos ignorados) |
| `searchReviewItems(..., "ano")` sobre `Año Nuevo` | `[s-3]` | Correcto (acentos/ñ normalizados) |
| `formatReviewValue` | `No` / `—` / `2026-01-01` | Correcto |

## 4. Matriz de aceptación

Estados: **Verificado (código/unit)** = lectura estática o test unitario; **Verificado (E2E)** = comprobado en navegador contra el contenedor (§10); **Pendiente** = requiere un medio que el harness no tiene.

| # | Caso (plan §9) | Estado | Evidencia / notas |
| --- | --- | --- | --- |
| 1 | Abrir revisión de columna: modo Orden, nombre asc, dos iconos arriba a la izquierda | **Verificado (código + E2E)** | `ReviewMode.tsx:280-289` (reset), `316-322` (`orderedIds` inicial por nombre asc), `1924-1964` (iconos solo `isColumnAxis`); E2E: `Nombre de fila · Ascendente`, `aria-pressed=true/false` |
| 2 | Cambiar a Descendente: Z-A y conservar la fila actual | **Verificado (código + E2E)** | `810-835` (`changeSort`), `801-808` (`applyOrder` por `rowId`); E2E: Ávila pasó de `1 / 6` a `6 / 6` conservando su valor |
| 3 | Texto A-Z / Z-A con acentos y `ñ` (`Intl.Collator("es")`) | **Verificado (unit + sonda + E2E)** | `review.ts:47-50`; E2E: `abeja, Águila, México, Ñandú, Zorro` y desc inverso con vacío al final |
| 4 | Entero/decimal numérico asc/desc, vacíos al final | **Verificado (unit + sonda + E2E)** | `review.ts:247-257`, `289-356`; E2E: `-2, 0, 7, 10` y desc `10, 7, 0, -2`, vacíos al final (int y float) |
| 5 | Fecha cronológica asc/desc, **fechas inválidas al final** | **Verificado (unit + sonda + E2E parcial)** | `review.ts:315-340`; E2E: válidas y vacíos correctos en asc/desc. Las fechas inválidas **no son representables** por el `DateField` del backend, así que quedan cubiertas por los 6 tests de H-02 |
| 6 | Checkbox `false` antes que `true` en asc, vacíos al final | **Verificado (unit + E2E)** | `review.ts:268-273`; E2E: `false, true, vacíos` y desc `true, false, vacíos` |
| 7 | Lista alfabética por etiqueta, valores legados incluidos | **Verificado (unit + E2E)** | `review.ts:274-277`; E2E: `Cerrado, En proceso, Legado, Nuevo` y desc inverso |
| 8 | Orden original recupera el orden del backend, dirección deshabilitada | **Verificado (código + E2E)** | `764-769`; `1721` (`disabled={sortKey === "original"}`); E2E: orden de alta y botón `disabled=true` |
| 9 | Editar con orden por la columna revisada: no salta hasta `Reordenar`/cambio de criterio | **Verificado (código + E2E)** | `547-555` (`applySavedValue` no toca `orderedIds`); E2E: Ávila `Zorro → Aaa` siguió 5ª hasta pulsar `Reordenar` |
| 10 | Cambiar criterio con cambio pendiente: guarda primero; si falla, no cambia | **Verificado (código + E2E)** | `637-640` (`commitPending`), `817`, `840`, `864`, `882`; E2E: `abeja → zzz` sin `Enter`, cambio a Entero → guardado y criterio aplicado |
| 11 | Buscar por nombre sin distinguir mayúsculas/acentos; `Enter` abre el editor | **Verificado (unit + E2E)** | `review.ts:369-388`; `943-946`; E2E: `avila` → 1 resultado, `nandu` → Cañón por `Ñandú` |
| 12 | Buscar por valor actual de la columna | **Verificado (unit + E2E)** | `review.ts:380-382`; E2E: `nandu` encontró la fila por el valor `Ñandú` |
| 13 | Búsqueda sin resultados: estado `Sin coincidencias` | **Verificado (código + E2E)** | `1631-1638`; E2E: `zzzz` → `0 de 6`, sin opciones |
| 14 | Editar desde búsqueda: `Enter` guarda y vuelve; la consulta se conserva | **Verificado (código + E2E)** | `1285-1288` → `901-915`; E2E: guardó, volvió a la lista y mantuvo la consulta |
| 15 | `←/→` en editor de búsqueda: guarda y mueve dentro del filtro | **Verificado (código + E2E)** | `1280-1284`, `888-898`; E2E: `ArrowRight` guardó y movió de Ávila a Sin datos; `Esc` volvió a la lista con el valor guardado |
| 16 | `Esc` en búsqueda: limpia consulta; si está vacía, vuelve a Orden | **Verificado (código + E2E)** | `947-956`; E2E: primer `Esc` limpió, segundo volvió a Orden y el overlay siguió abierto |
| 17 | `Ctrl+F` enfoca el buscador sin abrir el buscar del navegador | **Verificado parcialmente (E2E)** | `1162-1172` (`preventDefault` antes de `focusSearchInput`); E2E: cambió a modo búsqueda y no abrió el buscar del navegador; **el foco automático no es observable** con la pestaña oculta del harness |
| 18 | Error al cargar columna de orden: toast y se mantiene el orden anterior | **Verificado por código** (E2E no factible) | `723-761` (`ensureSortValues`), `826`/`847`; el harness no tiene interceptor de red para forzar el fallo |
| 19 | 401 durante guardado/carga: redirección global, sin toast duplicado | **Verificado (código + E2E)** | `604-607`, `751-753`, `685-687`; E2E: redirección a `/login?…&expired=1`, aviso único y valor no persistido |
| 20 | Modo fila: sin iconos de modo ni controles de orden/búsqueda | **Verificado (código + E2E)** | `206-210`, `1880-1893`, `1966`; E2E: sin iconos, sin selector ni `Reordenar`, flujo de fila intacto |
| 21 | Viewport móvil: iconos visibles, barra de orden envuelve, lista y editor usables | **Verificado por código** (E2E no factible) | `1689` (`flex-wrap`), `1924-1964`; el harness no emula viewport |
| 22 | Teclado completo sin ratón (abrir, cambiar modo, ordenar, buscar, editar, guardar, cerrar) | **Verificado (código + E2E)** | Guards `1145-1158`; E2E con eventos de teclado en todos los pasos; único límite: el foco por `requestAnimationFrame` no se observa con la pestaña oculta |

### 4.1 Casos adicionales comprobados (fuera de la matriz del plan)

| Caso | Estado | Evidencia |
| --- | --- | --- |
| Los dos iconos no aparecen en `axis="row"` y se conserva `ScanLine` | Verificado (código + E2E) | `1924`, `1966` |
| `aria-pressed` en los botones de modo | Verificado (código + E2E) | `1934`, `1951` |
| `aria-label`/`title` “Modo orden” y “Modo búsqueda” | Verificado (código) | `1935-1936`, `1952-1953` |
| `role="listbox"` + `role="option"` + `aria-selected` en opciones y resultados | Verificado (código + E2E) | `1500-1517`, `1640-1651` |
| `aria-live="polite"` en contadores | Verificado (código + E2E) | `1623-1628`, `1982-1988` |
| Buscador con patrón combobox (`role`, `aria-autocomplete`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) | Verificado (código + E2E) | `1603-1621`; destino `1640-1651`; expuesto en el DOM del E2E |
| Foco automático al editor, al buscador y tras navegar | Verificado por código | `405-452`; **no observable** en el harness (`visibilityState=hidden`) |
| Trampa de foco con `Tab`/`Shift+Tab` | Verificado por código | `963-986` (sin cambios respecto a la base) |
| Botones nativos (`Button` de shadcn) y no duplicar `Enter`/`Espacio` | Verificado (código + E2E) | `1207-1210` |
| `/` solo fuera de campos editables | Verificado (código) | `1212-1221` + `isEditableTarget` `134-143` |
| `Esc` del editor de búsqueda no cierra el overlay | Verificado (código + E2E) | `1252-1264` |
| Caché de valores por columna y cancelación al desmontar | Verificado por código | `731-733`, `342-348`, `755-760` |
| `orderedIds` congela el orden; filas nuevas se añaden al final | Verificado por código | `219-235` |
| Guardado normal (regresión) | Verificado (código + E2E) | `561-631`; `applySavedValue` empareja por `rowId`+`columnId` |
| 403/404 en guardado mantienen el editor y el panel de error | Verificado por código | `99-113`, `1852-1874` |

## 5. Hallazgos

### 5.1 Verificación de los fixes

#### H-01 · Alto · Los eventos de teclado del desplegable “Ordenar por” también los procesaba el overlay — **RESUELTO**

- **Cambio aplicado (dos guards, `ReviewMode.tsx:1143-1158`):**

  ```ts
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    // Si hay un Select de Radix abierto, su contenido (portal) gestiona el teclado.
    // El foco puede seguir en el trigger, así que el guard del contenedor no basta.
    if (
      typeof document !== "undefined" &&
      document.querySelector('[role="listbox"][data-state="open"]')
    ) {
      return;
    }
    if (event.defaultPrevented) return;
    const targetNode = event.target as Node | null;
    if (!targetNode || !containerRef.current?.contains(targetNode)) return;
  ```

- **Por qué hacía falta el segundo guard:** el guard de contención (`1157-1158`) solo descarta eventos cuyo `target` está fuera del contenedor. Si el foco permanece en el **trigger** mientras el contenido está abierto, el `target` sí está dentro y el overlay volvería a procesar la tecla. El guard nuevo corta el manejador en cuanto hay un `role="listbox"` con `data-state="open"` en el documento, sin depender de dónde esté el foco.
- **Alcance del selector:** solo el `SelectContent` de Radix emite `role="listbox"` + `data-state="open"` (los listbox propios del editor y de la búsqueda no llevan `data-state`), y el overlay es modal, así que no puede haber otro `Select` abierto detrás. Es un acoplamiento global, aceptable en este contexto (residual menor, ver §8).
- **Por qué el fix es correcto:** `containerRef` es el `div role="dialog"` que envuelve **todo** el overlay (`1911-1921`), y el único contenido portaleado es `SelectContent` (`ui/select.tsx:65` → `document.body`). En `@radix-ui/react-select@2.2.5` hay **0** `stopPropagation`, así que el evento del portal sí llega al manejador por el árbol de React y es el guard el que lo neutraliza.
- **`defaultPrevented` sigue siendo complementario:** verificado en la fuente instalada:
  - `SelectItem.onKeyDown`: `if (SELECTION_KEYS.includes(event.key)) handleSelect(); if (event.key === " ") event.preventDefault();` → **`Enter` no llama a `preventDefault`**; sin los guards, `Enter` habría avanzado el registro.
  - `SelectContent.onKeyDown`: solo `Tab` recibe `preventDefault`; las flechas mueven el foco sin `preventDefault`.
  - `DismissableLayer` (Escape): `if (!event.defaultPrevented && onDismiss) { event.preventDefault(); onDismiss(); }`, con listener **en captura sobre `document`**.
- **Que no bloquea teclado legítimo (comprobado punto por punto):**
  - Todos los controles del overlay (cabecera, iconos de modo, barra de orden, editor por tipo, lista de opciones, lista de búsqueda, pie, panel de error) están dentro de `containerRef`.
  - El contenedor es enfocable (`tabIndex={0}`, `1918`); `container.contains(container)` es `true`, así que el teclado sigue vivo cuando el foco está en el contenedor (al abrir el overlay y al hacer clic en el fondo).
  - `Esc` dentro del overlay sigue cerrando/guardando (`1292-1303`); `Ctrl+F` (`1162-1172`), `/` (`1212-1221`), `Tab`/trampa de foco (`1202-1204`, `963-986`) y el teclado de cada editor (`1252-1334`) no cambian.
  - No hay doble despacho: `onKeyDown={handleKeyDown}` existe **solo** en el contenedor (`1919`); la barra de orden solo aporta `ref` (`1688`).
  - Único listener global de teclado en la app: `ui/sidebar.tsx:87` (`Ctrl/Cmd+B`), que no solapa con ninguna tecla del overlay.
- **Resultado E2E (residual del hallazgo):** con el desplegable de orden abierto, **`Esc` cerró solo el desplegable y el overlay permaneció abierto**; `↓`/`Enter` seleccionaron el criterio sin avanzar el registro ni disparar `PUT`. Caso cerrado en navegador.
- **Residual (decisión de producto, no bug):** `Esc` con el foco en el **trigger** y el desplegable **cerrado** (o en el botón de dirección / `Reordenar`) sigue cerrando el overlay, porque son controles internos. No se probó explícitamente en el E2E (caso #2 de §7); conviene decidirlo y fijarlo.

#### H-02 · Bajo · En descendente, los valores *no ordenables* (fecha/número inválidos) quedaban al principio — **RESUELTO**

- **Cambio aplicado:** `review.ts:315-340` (`isOrderable` + grupo final antes de invertir la dirección) y JSDoc actualizado (`review.ts:281-288`).

  ```ts
  const aOrderable = isOrderable(aValue);
  const bOrderable = isOrderable(bValue);
  if (aOrderable !== bOrderable) return aOrderable ? -1 : 1;   // no se invierte con desc
  const base = compareReviewValues(type, aValue, bValue, SPANISH_COLLATOR);
  if (base === 0) return 0;
  return direction === "desc" ? -base : base;
  ```

- **Corrección verificada en asc y desc, con válidos, inválidos y vacíos:** ver §3.4 (fechas `f-1,f-2,f-3,f-4,f-5` / `f-2,f-1,f-3,f-4,f-5`; enteros `n-5,n-3,n-1,n-2,n-4` / `n-1,n-3,n-5,n-2,n-4`; `valuesByRow`; `float` e `int`).
- **Desempate estable intacto:** el comparador devuelve `0` para valores equivalentes y el `sort` aplica nombre de fila (`SPANISH_COLLATOR`) y luego índice original (`344-354`); no se invierte con `desc`. Probado con empates (`s-2, s-1, s-3`) y con no ordenables idénticos (`review.test.ts:1061`).
- **Cobertura:** 6 tests nuevos (`review.test.ts:887`, `940`, `991`, `1035`, `1061`, `1092`); total del archivo 79.
- **E2E:** orden por los 6 tipos en asc y desc, con vacíos al final en todos. Las **fechas inválidas no son representables** por el `DateField` del backend, así que ese subcaso queda cubierto solo por los tests unitarios.
- **Matriz del plan:** `docs/plans/…:443` (“fechas inválidas al final”) ya se cumple en ambas direcciones; **no hace falta cambiar el contrato**.
- **Nuance documentada (no es defecto):** entre **dos** valores no ordenables el orden relativo es textual y **sí** sigue la dirección (`"bbb"` antes que `"aaa"` en desc). Queda fijado por el test de `1092` y descrito en el JSDoc; si se prefiere orden textual ascendente fijo también en desc, sería otro cambio de contrato.

#### H-05 · Informativo · Accesibilidad del buscador: patrón combobox incompleto — **RESUELTO** (con 2 residuales)

- **Cambio aplicado:** `ReviewMode.tsx:1606-1608` → `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded={searchResults.length > 0}`.
- **Validez ARIA (revisada atributo por atributo):**
  - `role="combobox"` sobre `<input type="text">` es el patrón canónico de ARIA 1.2 / APG.
  - `aria-expanded` es **obligatorio** en `combobox` y está presente; su valor es coherente con el estado real: el `<ul role="listbox">` se monta exactamente cuando `searchResults.length > 0` (`1631-1645`), así que `false` ⇔ no hay popup.
  - `aria-autocomplete="list"`, `aria-controls` (`1613` → `#review-search-results`, `1641`) y `aria-activedescendant` (`1614-1618`) están permitidos en `combobox`; el `id` referenciado existe y corresponde a un `role="option"` (`1647-1651`) descendiente del `listbox` (`1640-1645`). `aria-activedescendant` se omite (`undefined`) cuando no hay resultado resaltado.
  - No se introducen atributos ARIA inválidos ni roles anidados incorrectos.
- **La lista sigue siendo navegable:** el foco permanece en el input (dentro del contenedor) y el teclado de la lista (`↑/↓/Home/End/Enter/Esc`, `handleSearchListKey` `917-960`) sigue llegando al manejador del overlay; `aria-activedescendant` se actualiza con `searchHighlighted`. Es el patrón esperado por lectores de pantalla para un combobox.
- **E2E:** el DOM del buscador expone `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` y `aria-activedescendant`; la lista expone `role="listbox"`/`role="option"` con `aria-selected`. Navegación con `↑/↓` y `Enter` verificada por eventos de teclado.
- **Residual 1 (a11y menor, preexistente):** con 0 resultados el `<ul id="review-search-results">` no se renderiza (`1631`), por lo que `aria-controls` queda apuntando a un `id` inexistente; `axe` lo reportaría como `aria-valid-attr-value`. Opcional: renderizar el estado vacío **dentro** del contenedor con ese `id`, o no emitir `aria-controls` cuando no hay resultados.
- **Residual 2 (plan desalineado, no código):** el plan (`docs/plans/…:173`) pide `Tab: buscador → lista → botón cerrar`; con el patrón combobox el foco **no** debe salir del input para recorrer la lista. Conviene actualizar esa fila del plan en lugar de tocar el componente.
- **Observación de consistencia (preexistente, no regresión):** el input de filtro del editor de lista (`1485-1489`) usa `aria-activedescendant` sin `role="combobox"`/`aria-expanded`, y el `<ul>` repite `aria-activedescendant` (`1504-1508`) aunque no es enfocable. Aplicar el mismo patrón allí sería una mejora de consistencia, fuera del alcance de este plan.

### 5.2 Regresiones comprobadas

| Área | Resultado | Evidencia |
| --- | --- | --- |
| Modo fila | Sin regresión | El guard es agnóstico al eje y todos los controles del modo fila están dentro del contenedor; `showSortBar` sigue siendo `false` (`1880-1886`) y `ScanLine` sigue renderizándose (`1966`). Rutas de teclado de fila (`1223-1242`, `1292-1334`) sin cambios. **E2E:** sin iconos, sin selector ni `Reordenar` |
| Teclado del editor (6 tipos) | Sin regresión | Inputs de `text`/`int`/`float`/`date` y filtro de `select` están dentro del contenedor; el `Checkbox` de Radix del editor es `tabIndex={-1}` + `aria-hidden` + `pointer-events-none` (`1446-1451`), nunca es origen de `keydown`; el `div role="checkbox"` no tiene `onKeyDown` propio. **E2E:** edición y guardado en los 6 tipos |
| `Ctrl+F` | Sin regresión | `1162-1172`; **E2E:** cambió a búsqueda y evitó el buscar del navegador (foco no observable) |
| `/` | Sin regresión | `1212-1221` sigue exigiendo `!isEditableTarget` |
| `Escape` | Sin regresión | Overlay `1292-1303`; editor de búsqueda `1253-1264`; lista de búsqueda `947-956`; **E2E:** con el desplegable abierto solo cerró el desplegable; en búsqueda limpió y luego volvió a Orden |
| Botones nativos | Sin regresión | `1207-1210` intacto (no duplica `Enter`/`Espacio`) |
| Trampa de foco | Sin regresión | `963-986` sin cambios; además no compite con el desplegable |
| Guardado / 401 / 403 / 404 | Sin regresión | No se tocó `commitValue`/`commitPending`/`handleRetry`/`handleClose`. **E2E:** 401 redirigió sin corromper el valor |
| Build y tipos | Sin regresión | 138 tests, `tsc` 0, `build` OK |

**No se detectaron regresiones nuevas.** El diff incremental de los fixes es: los guards de `handleKeyDown` (`1145-1158`) y 3 atributos ARIA (`1606-1608`), más los 6 tests.

### H-03 · Bajo · `TODO.md` incluye dos entradas ajenas al plan y un ítem vacío — **ABIERTO**

- **Archivo/líneas:** `TODO.md:41-43`
  - `41: - [ ] Permisos granulares en nuevo endpoint de la api de /cellvalues/`
  - `42: - [ ] ` y `43: - [ ] ` (bullets vacíos)
- **Descripción:** el diff del plan solo preveía marcar el ítem de orden/búsqueda (línea 40) y añadir el enlace al plan. Las líneas 41-43 no pertenecen a este cambio y siguen presentes.
- **Impacto:** housekeeping; ruido en el diff y un pendiente de seguridad (permisos de `/cellvalues/`) que no está referenciado a ningún plan ni documento.
- **Propuesta:** agente `frontend`/`orchestrator`: quitar los bullets vacíos y mover “Permisos granulares en /cellvalues/” a una entrada con contexto (o a `docs/qa/`), o justificarla en el commit. Sin impacto funcional.

### H-04 · Informativo · `ReviewSortKey` no aporta seguridad de tipos — **ABIERTO**

- **Archivo/línea:** `frontend/src/lib/review.ts:31` — `export type ReviewSortKey = "original" | "row-name" | string;` colapsa a `string`.
- **Efecto:** `sortKey` acepta cualquier cadena; un `sortKey` inexistente en `columns` degrada silenciosamente a orden por nombre de fila dentro de `sortReviewItems` (`review.ts:302-306`, `type` cae a `"text"`). En la UI está protegido por `computeOrder` (`ReviewMode.tsx:777-783`), pero la API pública del helper no.
- **Propuesta:** `frontend` — o un tipo plantilla `` `column:${string}` `` para ids de columna, o documentar el fallback en el JSDoc. No urgente.

### H-06 · Informativo · `restart()` no reinicia `viewMode`/`searchView` — **ABIERTO**

- **Archivo/línea:** `ReviewMode.tsx:709-719`; alcanzable tras `completed` + `Ctrl+F` (`1162-1172` no comprueba `completed`, y `focusSearchInput` sí deja `viewMode="search"`).
- **Efecto:** tras “Revisar de nuevo” el overlay puede abrirse en la lista de búsqueda en vez del editor. Estado raro, recuperable con `Esc`, sin pérdida de datos.
- **Propuesta:** `frontend` — en `restart()`, `setViewMode("order")`, `setSearchView("edit")`; y/o `if (completed) return;` en `focusSearchInput`.

### H-07 · Informativo · Carrera entre `applyOrder` y la navegación durante la carga de orden — **ABIERTO**

- **Archivos/líneas:** `ReviewMode.tsx:801-808` (`applyOrder` usa el `current` del render que inició el orden) y `810-830`.
- **Efecto:** si mientras se carga la columna de orden el usuario pulsa `←/→` (la navegación no está bloqueada por `sortLoading`), al resolver la petición el índice se recoloca sobre la fila que era actual **al iniciar** el orden, no sobre la que el usuario está viendo. Requiere una petición lenta; no corrompe datos.
- **Propuesta:** `frontend` — guardar la fila objetivo en una `ref` actualizada por `setIndex`, o bloquear la navegación mientras `sortLoading`.

### H-08 · Informativo · Valores `select` en lista/dict degradan a `"[object Object]"` — **ABIERTO**

- **Archivos/líneas:** `review.ts:359-363` (`formatReviewValue`) y `274-277` (comparación como `String(value)`).
- **Contexto:** el backend permite `value_json` con `list`/`dict` (`CellValue.get_value()` → `self.value_json or self.value_text`), documentado en `docs/api/review-cellvalues.md:82-84`.
- **Efecto:** en datos legados multi-valor, el orden y la búsqueda usan `"[object Object]"` o `"a,b"`. El editor de revisión ya tenía esta limitación (`valueToDraft`/`selectionText` hacen `String(value)`), así que no es una regresión, pero la búsqueda nueva la hace visible.
- **Propuesta:** `frontend` — formatear listas con `join(", ")` y diccionarios con `JSON.stringify` en `formatReviewValue`, o documentar que el modo revisión solo soporta `select` escalar.

### H-09 · Informativo · `Ctrl+F` dentro del editor de búsqueda guarda y sale del editor — **ABIERTO**

- **Archivos/líneas:** `ReviewMode.tsx:1162-1172` → `852-860` (`focusSearchInput` hace `commitPending()` y `setSearchView("list")`).
- **Efecto:** no está en el plan (§5.3 no define `Ctrl+F` en el editor). Es coherente con “guardar antes de cambiar de contexto”, pero puede sorprender (cierra el editor y guarda). El plan §5.3 sí define `Ctrl+Enter` para “guardar y avanzar”, que está implementado (`1174-1189`).
- **Propuesta:** documentarlo en el plan/QA o limitar `Ctrl+F` a la lista y a orden.

### Observaciones sin severidad (no son hallazgos)

- **`Reintentar` no reanuda la acción interrumpida:** si `commitPending` falla al cambiar de modo/criterio, `failedSaveRef.advance === "stay"` y `handleRetry` solo guarda; el usuario debe repetir el cambio. Es lo que pide el plan §6.7 (“que `Reintentar` no avance”).
- **Pérdida silenciosa preexistente:** tras un fallo de guardado el draft se revierte (`commitValue`); si el usuario pulsa “Siguiente”, `isSameCellValue` da `true` y se descarta el cambio sin aviso. Comportamiento anterior a este plan, no una regresión.
- **`Reordenar` habilitado con `Orden original`:** recalcula el mismo orden (no-op). Cosmético.
- **Guard de H-01 acoplado al documento:** `document.querySelector('[role="listbox"][data-state="open"]')` es global; si algún día conviviera otro `Select` de Radix abierto fuera del overlay, el teclado del overlay se desactivaría. Hoy es seguro porque el overlay es modal.
- **`Esc` con el foco en el trigger del Select (desplegable cerrado)** cierra el overlay: coherente con el resto del overlay, pero conviene decidir explícitamente (residual de H-01).
- **`aria-live` duplicado** (contador de cabecera + contador de búsqueda) puede generar anuncios dobles.
- **`aria-controls` colgante con 0 resultados** (residual de H-05).

## 6. Cobertura

**Revisado:**
- Lógica pura: comparador por los 6 tipos, *nulls last*, no ordenables, dirección, desempate, collator español, búsqueda normalizada, formateo, no mutación de `items`.
- Componente: estado de modo/orden/búsqueda, carga inicial, `orderedIds`, `applyOrder`, `changeSort`, `reorder`, `ensureSortValues` (caché, `AbortController`, `sortLoading`, descarte de respuestas tardías), `commitValue`/`commitPending`/`handleRetry`/`handleClose`, editor por tipo, teclado completo (orden, lista de búsqueda, editor de búsqueda), foco, trampa de foco, ARIA.
- Fixes: guards de H-01 contra el árbol de portales de Radix (fuente instalada), `isOrderable` de H-02 (sonda + 6 tests), patrón combobox de H-05 atributo por atributo.
- Regresiones de modo fila y del guardado normal, en código y en E2E.
- Integración con `TableView` (`columns` de la pestaña activa, `saveCell` que rechaza la promesa).
- Contraste con el contrato de `cellvalues` y con los tipos reales del backend (`get_value`).
- **E2E:** los 22 casos de la matriz del plan más 401, modo fila, ARIA y el residual de H-01 (§10).

**No revisado / no aplica:**
- Viewport móvil real (sin emulación en el harness); lectores de pantalla reales (la validez ARIA se revisó contra la especificación y el DOM, no con NVDA/VoiceOver).
- Error de carga de columna en E2E (sin interceptor de red); sigue verificado por código.
- Foco automático por `requestAnimationFrame` (la pestaña del harness está `hidden`); el producto no está implicado.
- Tests de backend (sin cambios en `backend/`).
- Rendimiento con tablas de decenas de miles de filas (solo análisis: una petición por columna nueva, payload lineal; límite aceptado en el plan §6.1).
- Seguridad de los endpoints: no hay cambios; el nuevo `GET` reutiliza `cellvalues` con permisos por objeto (`view_table` + `view_tab`) y 401/403/404 según contrato. No se introduce `dangerouslySetInnerHTML`, ni SQL, ni mass assignment, ni nuevos secretos.

## 7. Casos de prueba: ejecutados y pendientes

Los casos 1–22 de la matriz §4 se ejecutaron en el E2E (§10). Quedan pendientes únicamente los que el harness no permite:

1. **Pendiente — `Esc` en el trigger (desplegable cerrado):** decidir el comportamiento esperado y fijarlo. Hoy cierra el overlay (residual de H-01).
2. **Pendiente — Viewport móvil (375 px):** requiere emulación de viewport; hoy solo verificado por clases responsive.
3. **Pendiente — Error al cargar la columna de orden (502/red):** requiere interceptor de red o un backend que falle; hoy verificado por código.
4. **Pendiente — Lector de pantalla real:** validar anuncios del combobox con NVDA/VoiceOver.
5. **Pendiente — Foco automático:** observar el foco al editor/buscador en una pestaña visible.

Repetir como regresión si se toca el teclado o el orden:

6. Teclado con el desplegable de orden abierto (`↓`, `Enter`, `Esc`, `←/→`): no navega, no guarda, `Esc` solo cierra el desplegable.
7. Orden por los 6 tipos, asc/desc, con vacíos → siempre al final; descendente con datos inválidos → inválidos al final (unit).
8. Editar con orden por la columna revisada: no salta hasta `Reordenar`.
9. Cambio de criterio con cambio pendiente: guarda primero; si falla, no cambia.
10. Búsqueda por nombre/valor con acentos; `Enter`/`←/→`/`Esc` en editor y lista.
11. 401 en guardado: redirección con `expired=1`, aviso único y valor no persistido.
12. Modo fila: sin iconos ni barra de orden; teclado y cierre intactos.

## 8. Riesgos residuales y priorización

| Prioridad | Riesgo | Mitigación |
| --- | --- | --- |
| 1 | `Esc` con el foco en el trigger/dirección/`Reordenar` (desplegable cerrado) cierra el overlay: decisión sin fijar | Caso §7.1; si se cambia, mover el guard `sortBarRef` antes de la rama `Escape` (`1292`) |
| 2 | `aria-controls` colgante cuando no hay resultados (informativo) | Mantener el `<ul id="review-search-results">` montado con el estado vacío dentro, o condicionar el atributo |
| 3 | Guard de H-01 acoplado al documento (selector global de `listbox` abierto) | Aceptable con overlay modal; si se añaden capas no modales, acotar el selector al `Select` de la barra |
| 4 | Coste de ordenar por otra columna: una petición con **todas** las filas por columna nueva (cacheada) | Aceptado en el plan §6.1; revisar si la tabla crece |
| 5 | `TODO.md` con pendiente de permisos de `/cellvalues/` sin contexto (H-03) | Mover a un plan/issue con dueño |

## 9. Conclusión

No hay hallazgos **Críticos** ni de seguridad. Los tres hallazgos accionables (**H-01 Alto**, **H-02 Bajo**, **H-05 Informativo**) están **resueltos**, verificados por código, por tests y **en navegador**. El E2E de los 22 casos de la matriz está **cerrado** (§10): 19 verificados, #17 parcial (solo el foco automático no es observable con la pestaña oculta) y #18/#21 limitados por el harness (sin interceptor de red ni emulación de viewport), ambos cubiertos por código.

El contenedor sirve el bundle auditado (`index-DdSnc6b_.js`), la suite está en **138/138**, `tsc` y `build` limpios, y no se observaron regresiones en modo fila, editor, atajos, `Esc`, botones nativos ni trampa de foco.

**El plan puede darse por terminado y `TODO.md:40` puede marcarse.** Queda **H-03** (Bajo, housekeeping de `TODO.md`) y los informativos H-04 y H-06…H-09, ninguno bloqueante.

## 10. E2E en navegador (2026-10-27)

### 10.1 Entorno

- Contenedor `react` reconstruido; bundle servido **`assets/index-DdSnc6b_.js`**, idéntico al que produce `npm run build` en este árbol (§3.3), por lo que el E2E ejecutó el código auditado (guard de H-01 incluido).
- `frontend/nginx.conf` sirve `/index.html` con `Cache-Control: no-store` y `/assets/*` como `immutable` (trabajo de `docker-ops`, ver `docs/ops/2026-10-27-frontend-rebuild-cache.md`).
- Usuario temporal: `e2e_review_20261027@example.com` (se elimina al terminar; no se registran credenciales en este documento).
- Harness: navegador automatizado con la pestaña en `visibilityState=hidden`. **Limitación conocida:** los efectos de foco basados en `requestAnimationFrame` no se pueden observar; las actualizaciones de React y los eventos de teclado sí. **No es un defecto del producto.**

### 10.2 Datos de prueba

Tabla temporal con 6 columnas (una por tipo) y 6 filas. Valores reconstruidos a partir de los órdenes observados:

| Fila | Texto (text) | Entero (int) | Fecha (date) | Activo (checkbox) | Estado (select) |
| --- | --- | --- | --- | --- | --- |
| Ávila | Zorro | 10 | 2026-03-01 | true | Nuevo |
| Barcelona | Águila | -2 | 2026-01-15 | false | En proceso |
| Cañón | Ñandú | 0 | 2025-12-31 | true | Cerrado |
| Niño | abeja | 7 | (vacío) | false | (vacío) |
| Zaragoza | México | (vacío) | 2026-10-27 | (vacío) | Legado |
| Sin datos | (vacío) | (vacío) | (vacío) | (vacío) | (vacío) |

La columna `Decimal` (float) siguió exactamente el mismo orden que `Entero` en asc y desc; el E2E verificó el **orden**, no la transcripción de cada decimal.

### 10.3 Resultados por caso

| # | Caso | Resultado | Nota |
| --- | --- | --- | --- |
| 1 | Abrir revisión de columna | OK | Modo Orden activo, subtítulo `Nombre de fila · Ascendente`, dos iconos arriba a la izquierda, `aria-pressed=true/false` |
| 2 | Descendente por nombre | OK | Ávila pasó de `1 / 6` a `6 / 6` conservando su valor; orden Z-A |
| 3 | Texto asc/desc | OK | Asc: `abeja, Águila, México, Ñandú, Zorro, —`; desc inverso con el vacío al final. Collator español con acentos y `ñ` correcto |
| 4 | Entero y decimal asc/desc | OK | Int asc: `-2, 0, 7, 10` (Barcelona, Cañón, Niño, Ávila); desc inverso. Decimal con el mismo orden. Vacíos al final en ambas |
| 5 | Fecha asc/desc | OK (parcial por datos) | Asc: `2025-12-31, 2026-01-15, 2026-03-01, 2026-10-27`; vacíos Niño/Sin datos al final; desc inverso. **No hay fechas inválidas**: el `DateField` del backend no las permite |
| 6 | Checkbox asc/desc | OK | Asc: `false` (Barcelona, Niño), `true` (Ávila, Cañón), vacíos (Sin datos, Zaragoza); desc: `true`, `false`, vacíos |
| 7 | Select asc/desc | OK | Asc: `Cerrado, En proceso, Legado, Nuevo`; desc inverso; vacíos al final |
| 8 | Orden original | OK | `Ávila, Barcelona, Cañón, Niño, Zaragoza, Sin datos`; botón de dirección `disabled=true` |
| 9 | Editar sin reordenar | OK | Orden por Texto asc; Ávila `Zorro → Aaa` siguió en 5ª posición; `Reordenar` la movió al primer puesto; valor restaurado |
| 10 | Cambio de criterio con cambio pendiente | OK | Niño `abeja → zzz` sin `Enter`, cambio a Entero: el valor quedó guardado (la búsqueda encontró `zzz`) y el criterio se aplicó; restaurado a `abeja` |
| 11 | Búsqueda por nombre | OK | `avila` → 1 resultado (Ávila); `nandu` → 1 resultado (Cañón), sin distinguir acentos ni mayúsculas |
| 12 | Búsqueda por valor | OK | El mismo `nandu` encontró la fila por el valor `Ñandú` |
| 13 | Búsqueda sin resultados | OK | `zzzz` → `0 de 6`, estado `Sin coincidencias`, sin opciones |
| 14 | `Enter` en editor desde búsqueda | OK | Guardó, volvió a la lista y conservó la consulta |
| 15 | `←/→` en editor de búsqueda | OK | `ArrowRight` guardó y movió de Ávila a Sin datos dentro del filtro; `Esc` volvió a la lista con el valor guardado |
| 16 | `Esc` en búsqueda | OK | Con consulta la limpió sin salir; el segundo `Esc` volvió a Orden con el overlay abierto |
| 17 | `Ctrl+F` | OK (parcial) | Cambió a modo búsqueda y evitó el buscar del navegador; el foco automático no se pudo observar (`visibilityState=hidden`) |
| 18 | Error al cargar columna de orden | No ejecutado | El harness no tiene interceptor de red; sigue verificado por código |
| 19 | 401 en guardado | OK | Ver §10.4 |
| 20 | Modo fila | OK | Sin iconos de modo, sin selector de orden ni `Reordenar`; flujo de fila intacto |
| 21 | Viewport móvil | No ejecutado | Sin emulación de viewport; sigue verificado por clases responsive/código |
| 22 | Teclado completo | OK | Abrir, cambiar modo, ordenar, buscar, editar, guardar y cerrar con eventos de teclado; único límite, el foco por `requestAnimationFrame` |
| H-01 | `Esc` con el desplegable abierto | OK | Cerró **solo** el desplegable; el overlay permaneció abierto. `↓`/`Enter` seleccionaron criterio sin avanzar registro ni `PUT` |
| H-05 | DOM del buscador | OK | `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; lista con `role="listbox"`/`option` y `aria-selected` |

### 10.4 Evidencia del 401

1. Se invalidó el token (logout) manteniendo el overlay abierto.
2. Se editó Niño `abeja → zzz` y se pulsó `Enter`.
3. Resultado observado:
   - Redirección a `/login?returnTo=%2Ftable%2F…&expired=1`.
   - Aviso **“Tu sesión expiró. Inicia sesión de nuevo.”** (uno solo; el toast de guardado se omite para 401).
   - Tras iniciar sesión, la app volvió a la tabla y el valor persistido seguía siendo **`abeja`**: no hubo `PUT` parcial ni corrupción de la celda.
4. Coherente con `commitValue` (`604-607`), `handleClose` (`685-687`) y el interceptor global de autenticación.

### 10.5 Limitaciones del harness (no son defectos del producto)

- **Pestaña oculta:** `requestAnimationFrame` no ejecuta de forma observable, así que el foco automático al editor, al buscador y tras navegar no se puede comprobar (casos 1, 14, 17 y 22 parcialmente).
- **Sin interceptor de red:** no se pudo forzar el fallo de carga de la columna de orden (caso 18) ni el 502 de guardado con panel de error (sigue cubierto por código).
- **Sin emulación de viewport:** el caso móvil (21) queda pendiente.
- **Sin lector de pantalla:** la accesibilidad se verificó por DOM/ARIA, no por anuncios reales.
- **Fechas inválidas:** el `DateField` del backend no las permite, así que ese subcaso de la matriz #5 vive en los tests unitarios de H-02.
