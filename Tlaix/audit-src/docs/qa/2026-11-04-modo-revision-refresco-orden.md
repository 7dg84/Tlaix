# QA: modo revisión — refresco al cambiar de orden y valor de la columna de orden

- **Fecha:** 2026-11-04
- **Alcance:** plan `docs/plans/2026-11-04-modo-revision-refresco-orden.md` (`ReviewMode` con `axis="column"`).
- **Tipo de auditoría:** lectura de la implementación + `git diff` + tests unitarios + `tsc` + `build` + **E2E en navegador local** contra el contenedor reconstruido.
- **Entorno E2E:** `http://localhost` (contenedor `react`), bundle servido **`assets/index-DAvO6DDD.js`**, idéntico al que produce `npm run build` en este árbol (§3.3).
- **Archivos bajo auditoría (árbol de trabajo, sin commit):**
  - `frontend/src/lib/review.ts` (+47): `ReviewSortDisplay`, `resolveReviewSortDisplay`.
  - `frontend/src/components/ReviewMode.tsx` (+129/−27): `activeSortValues`, `ComputedOrder`, `applyOrder` con `resetToFirst`, render de la línea bajo `Fila:`.
  - `frontend/src/lib/review.test.ts` (+201): 10 tests de `resolveReviewSortDisplay`.
- **Estado de `backend/`:** sin cambios. Sin migraciones, sin dependencias nuevas, sin despliegue al dominio.
- **Nota de lectura:** las líneas citadas corresponden al árbol de trabajo actual.

## 1. Resumen ejecutivo

La implementación cumple el contrato del plan y **la matriz de aceptación se verificó completa en navegador (14/14)**. Los dos comportamientos centrales funcionan:

1. **Cambiar de criterio** reinicia el índice al primer registro del nuevo orden (`applyOrder(..., { resetToFirst: criterionChanged })`).
2. **La línea bajo `Fila:`** muestra `nombreColumna: valor` con el valor **congelado** de la columna de orden, formateado con `formatReviewValue` (`—` para vacío, `Sí`/`No` para casillas), y no se muestra con `Orden original` ni `Nombre de fila`.

**No se encontraron defectos funcionales ni regresiones.** No hay hallazgos bloqueantes; solo 4 observaciones informativas (§7), todas preexistentes o de estilo/accesibilidad menor.

| Capa | Estado | Evidencia |
| --- | --- | --- |
| Lógica pura (`lib/review.ts`) | OK | 10 tests nuevos de `resolveReviewSortDisplay` (§3.1) |
| Componente (`ReviewMode.tsx`) | OK | Lectura completa + diff; matriz E2E completa (§5) |
| Tipado (`tsconfig.app.json`) | OK | `tsc` exit 0 |
| Build de producción | OK | `index-DAvO6DDD.js`, **el mismo que sirve el contenedor** |
| E2E navegador | **Verificado** | 14/14 casos de la matriz + 4 regresiones (§6) |
| Backend | Sin cambios / no aplica | `git status` limpio en `backend/` |

**Veredicto: listo para commit.** Las observaciones de §7 son opcionales y no bloquean.

## 2. Alcance y método

1. Lectura del plan y `git diff` completo de los tres archivos de `frontend/`.
2. Lectura íntegra de las funciones nuevas: `resolveReviewSortDisplay` (`review.ts:365-410`), `computeOrder` (`ReviewMode.tsx:800-843`), `applyOrder` (`845-869`), `changeSort` (`871-896`), `reorder` (`903-916`) y el bloque de render (`1889-1919`).
3. Verificación de que la línea **no** se renderiza en la lista de búsqueda: `content()` devuelve `renderSearchView()` antes del bloque principal (`ReviewMode.tsx:1885-1887`), y el bloque con `sortDisplay` vive solo en el retorno final (`1899-1906`).
4. Verificación de que el valor mostrado es el **congelado**: `activeSortValues` solo se escribe en `applyOrder` (`857`) y se limpia al recargar datos (`304`), nunca al editar una celda.
5. `npm test` y `npx tsc --noEmit -p tsconfig.app.json`.
6. `npm run build` y comparación del hash con el bundle servido por el contenedor.
7. **E2E en navegador local**: Chrome 156 headless controlado por CDP (`--remote-debugging-port`), con **eventos reales** de ratón (`Input.dispatchMouseEvent`) y teclado (`Input.dispatchKeyEvent`), y aserciones sobre el DOM vivo. El tool de navegador de escritorio de la sesión no estaba conectado (`browser.disconnected`), así que se usó Chrome local contra el mismo `http://localhost`; no se usó el dominio.
8. Tabla temporal de 3 filas × 2 columnas (§4) creada por ORM y eliminada al terminar (§4.2).
9. Para el caso de error de carga de la columna de orden se bloqueó la petición con `Network.setBlockedURLs` **en la misma sesión CDP** del clic (§5, caso 14).

**No se hizo:** pruebas de componente con jsdom/React Testing Library (el proyecto no las tiene), pruebas de backend (sin cambios), emulación de viewport móvil, lector de pantalla real, ni prueba de la carrera `valuesByRow` frente a `columns` desactualizado (no reproducible desde la UI, §7 O-02).

## 3. Comandos y resultados

### 3.1 `npm test`

```text
 ✓ src/lib/auth.test.ts        (37 tests)
 ✓ src/lib/review.test.ts      (89 tests)
 ✓ src/lib/auth-modal.test.ts  (6 tests)
 ✓ src/lib/date-name.test.ts   (21 tests)

 Test Files  4 passed (4)
      Tests  153 passed (153)
```

Los 10 tests nuevos de `review.test.ts` cubren exactamente la §7 del plan: `original`/`row-name` → `null`, columna revisada con mapa, columna revisada sin mapa (respaldo `target.value`), columna revisada ausente de `columns`, otra columna, valor vacío, fila ausente, columna inexistente y casilla `Sí`/`No`.

### 3.2 `npx tsc --noEmit -p tsconfig.app.json`

```text
TSC_EXIT=0
```

### 3.3 `npm run build`

```text
dist/index.html                  1.16 kB
dist/assets/index-CI7OoZ26.css  63.64 kB │ gzip:  11.36 kB
dist/assets/index-DAvO6DDD.js  502.81 kB │ gzip: 162.44 kB
✓ built in 19.29s
```

El hash **`index-DAvO6DDD.js` coincide con el bundle que sirve el contenedor** (`curl http://localhost/` → `/assets/index-DAvO6DDD.js`), por lo que el E2E se ejecutó contra el código auditado. Avisos preexistentes y no bloqueantes: chunk > 500 kB. `frontend/dist` está en `frontend/.gitignore`, así que el build no ensucia el árbol.

## 4. Datos de prueba

### 4.1 Tabla temporal

| Nombre de fila | `equipo` (text) | `tarea 1` (checkbox) |
| --- | --- | --- |
| `uno` | `equipo 1` | `false` |
| `dos` | `equipo 1` | `false` |
| `tres` | `equipo 2` | `false` |

Usuario temporal `qa_review_20261104` con permisos de objeto (`view/add/change/delete_table` y `_tab`) sobre la tabla y pestaña, más el grupo `AllPermisions` para los permisos globales de `Column`/`Row`/`CellValue`.

> **Nota de lectura de la evidencia:** el orden inicial es `Nombre de fila · Ascendente`, así que el **primer** registro es `dos` (`dos < tres < uno`). Por eso `1 / 3` con `Fila: dos` es correcto y no un desfase del contador.

### 4.2 Limpieza (verificada)

```text
tabla borrada:   (13, {'api.CellValue': 6, 'api.Column': 2, 'api.Row': 3, 'api.Tab': 1, 'api.Table': 1})
usuario borrado: (11, {'guardian.UserObjectPermission': 8, 'auth.User_groups': 1, 'authtoken.Token': 1, 'auth.User': 1})
quedan tablas QA: 0
quedan usuarios QA: 0
```

Las celdas que se modificaron durante los casos 11 y R1/R2 se restauraron a su valor original (`dos → equipo 1`, `tres → equipo 2`) antes de borrar. El token del usuario se invalidó para la prueba de 401 (§6, R3). Chrome headless se cerró al terminar.

## 5. Matriz de aceptación

Estados: **Verificado (E2E)** = comprobado en navegador local; **Verificado (unit)** = test unitario; **Verificado (código)** = solo lectura estática.

| # | Caso (plan §6) | Estado | Evidencia (DOM real) |
| --- | --- | --- | --- |
| 1 | Abrir revisión de columna: `Nombre de fila · Ascendente`, primer registro, sin línea | **Verificado (E2E)** | `Tipo: Casilla · Ordenado por: Nombre de fila · Ascendente`; contador `1 / 3`; bloque `["Fila: dos"]` (sin segunda línea) |
| 2 | Ordenar por `equipo` desde `Nombre de fila`: índice `0` + `equipo: equipo 1` | **Verificado (E2E)** | Estaba en `2 / 3` (`tres`); tras elegir `equipo` → `1 / 3`, `["Fila: dos", "equipo: equipo 1"]`, subtítulo `… por: equipo · Ascendente` |
| 3 | Avanzar al siguiente del mismo equipo: mismo valor | **Verificado (E2E)** | `2 / 3`, `["Fila: uno", "equipo: equipo 1"]` |
| 4 | Avanzar al primer registro de otro equipo: nuevo valor | **Verificado (E2E)** | `3 / 3`, `["Fila: tres", "equipo: equipo 2"]` |
| 5 | Cambiar de `equipo` a `tarea 1`: índice `0` + `tarea 1` con valor congelado | **Verificado (E2E)** | Estaba en `1 / 3` (`tres`); tras elegir `tarea 1` → `1 / 3`, `["Fila: dos", "tarea 1: No"]`, subtítulo `… por: tarea 1 · Descendente` (conserva la dirección) |
| 6 | Cambiar solo la dirección: conserva la fila actual | **Verificado (E2E)** | En `3 / 3` (`tres`, equipo 2) → `Descendente` → `1 / 3` con `["Fila: tres", "equipo: equipo 2"]` (misma fila, nueva posición) |
| 7 | `Reordenar`: conserva la fila y actualiza valores congelados | **Verificado (E2E)** | (a) `Nombre de fila · Descendente` en `2 / 3` (`tres`) → `Reordenar` → `2 / 3` (`tres`). (b) `equipo` con `dos = "equipo 3"` editado → `Reordenar` → `3 / 3` (`dos`), línea `equipo: equipo 3` |
| 8 | Ordenar por `Orden original`: índice `0`, sin línea | **Verificado (E2E)** | `1 / 3`, `["Fila: uno"]` (orden de alta del backend), subtítulo `… por: Orden original` **sin** dirección; botón de dirección deshabilitado por código (`ReviewMode.tsx:1788`) |
| 9 | Ordenar por `Nombre de fila`: índice `0`, sin línea | **Verificado (E2E)** | `1 / 3`, `["Fila: uno"]`, sin segunda línea |
| 10 | Valor vacío en la columna de orden: `—` | **Verificado (E2E)** | Con `tres.equipo = NULL`: `3 / 3`, `["Fila: tres", "equipo: —"]` (y al final del asc, coherente con *nulls last*) |
| 11 | Editar la columna de orden: orden y línea no cambian hasta `Reordenar` | **Verificado (E2E)** | Revisando `equipo`, orden `equipo`: `dos` editado a `equipo 3` → sigue `1 / 3` y `["Fila: dos", "equipo: equipo 1"]`; tras `Reordenar` → `3 / 3` y `equipo: equipo 3`; en BD `dos='equipo 3'` |
| 12 | Editor desde búsqueda: línea sí, lista no | **Verificado (E2E)** | Lista de resultados: `hasFilaLine=false`, `hasSortLine=false`, opción `tres —`. Editor: `3 / 3`, `["Fila: tres", "equipo: —"]` |
| 13 | Modo fila: sin cambios | **Verificado (E2E)** | `Revisar fila: "uno"` → sin `#review-sort-key`, sin línea, `Columna: equipo` `1 / 2`; `→` → `Columna: tarea 1` `2 / 2`; `←` vuelve |
| 14 | Error al cargar la columna de orden: se mantiene el estado anterior + toast | **Verificado (E2E)** | Con `*cellvalues*` bloqueado, de `tarea 1` a `equipo`: estado intacto (`por: tarea 1 · Ascendente`, `2 / 3`, `["Fila: tres", "tarea 1: No"]`) y toast `No se pudo cargar la columna para ordenar.` |

### 5.1 Casos límite del plan §5 cubiertos además

| Caso | Estado | Evidencia |
| --- | --- | --- |
| Cambio de criterio con cambio pendiente: guarda primero | **Verificado (E2E)** | `dos` editado a `equipo 9` sin pulsar nada → cambio a `tarea 1` → BD `dos='equipo 9'`, índice `1 / 3`, línea `tarea 1: No` |
| Editar y luego cambiar **dirección** (no `Reordenar`): la línea se actualiza | **Verificado (E2E)** | `dos` editado a `equipo 7` → botón `Descendente` → BD `dos='equipo 7'`, `1 / 3`, `["Fila: dos", "equipo: equipo 7"]` |
| Valor de casilla formateado | **Verificado (E2E)** | `tarea 1: No` (no `false`) |
| Fila sin valor en la columna de orden | **Verificado (E2E)** | caso 10 (`—`) |

## 6. Regresiones

| # | Regresión | Estado | Evidencia |
| --- | --- | --- | --- |
| R1 | Búsqueda (lista y editor) | **Verificado (E2E)** | Consulta `tres` → una sola opción `tres —` en la lista, sin `Fila:` ni línea de orden; al abrir el editor se conserva `Fila: tres` + `equipo: —` |
| R2 | Guardado antes de cambiar de criterio | **Verificado (E2E)** | §5.1: `PUT` previo y criterio aplicado después; sin cambios perdidos |
| R3 | 401 durante el guardado | **Verificado (E2E)** | Token borrado en BD + `Espacio`/`Enter` → el overlay se desmonta, aparece el modal global con `Tu sesión expiró. Inicia sesión de nuevo.` y **sin toast duplicado** |
| R4 | Modo fila (`axis="row"`) | **Verificado (E2E)** | Sin barra de orden, sin línea, contador de columnas y navegación `←/→` intactos |

También se comprobó por código que un 403/404 de guardado sigue mostrando el panel de error y **no** cambia el criterio (`changeSort` aborta si `commitPending()` devuelve `false`, `ReviewMode.tsx:878-879`).

## 7. Hallazgos

**No se encontraron defectos funcionales.** Las siguientes son observaciones informativas, ninguna bloqueante y ninguna introducida por este cambio salvo donde se indica.

### O-01 · Informativo · La línea de orden se trunca sin forma de ver el valor completo

- **Archivos:** `ReviewMode.tsx:1900` (`<p className="truncate …">`).
- **Descripción:** el contenedor usa `truncate` (una sola línea con elipsis). Con un valor de columna de orden largo (`text` sin límite práctico) el usuario ve `equipo: Texto muy la…` y no hay `title` ni detalle alternativo.
- **Impacto:** cosmético; el dato completo sigue visible en el editor y en la tabla.
- **Propuesta:** añadir `title={sortDisplay.value}` al `<span>` del valor, o `break-words` en lugar de `truncate`.
- **Responsable:** `frontend`. Opcional.

### O-02 · Informativo · Criterio de orden con columna desaparecida (preexistente)

- **Archivos:** `ReviewMode.tsx:263-267` (`sortKeyLabel` → `"Columna"`), `1775-1779` (opciones del `Select`), `review.ts:403-404` (`null` si la columna no existe).
- **Descripción:** si la columna de orden deja de existir (borrada/renombrada desde otra pestaña) mientras el overlay está abierto, el `Select` conserva el `id` como valor sin etiqueta, el subtítulo muestra `Columna` y la línea desaparece (`null`). No se pudo reproducir desde la UI de una sola pestaña; el overlay es modal y no refresca `columns`.
- **Impacto:** nulo en el flujo normal; coherencia visual en un escenario multi-pestaña.
- **Propuesta:** si se quiere blindar, en `changeSort`/`computeOrder` volver a `row-name` cuando `sortKey` no esté en `columns` ni sea la columna revisada.
- **Responsable:** `frontend`. Opcional; fuera del alcance de este plan.

### O-03 · Informativo · `—` si falta `valuesByRow` para otra columna (defensa en profundidad)

- **Archivo:** `review.ts:406-409`.
- **Descripción:** con `sortKey` de otra columna y `valuesByRow = null`, la línea mostraría `—` en lugar del valor real. Hoy no es observable: `activeSortValues` solo se limpia al recargar datos, y esa recarga también devuelve `sortKey` a `row-name` (`ReviewMode.tsx:304` y `321`), con lo que `resolveReviewSortDisplay` devuelve `null`.
- **Impacto:** ninguno actual; el test unitario fija el comportamiento.
- **Propuesta:** ninguna; se documenta para no "arreglarlo" por error como si fuera un bug de datos.

### O-04 · Informativo · El botón de dirección conserva la etiqueta anterior con `Orden original` (preexistente)

- **Archivos:** `ReviewMode.tsx:1784-1804`.
- **Descripción:** al pasar a `Orden original` el botón queda `disabled` pero sigue mostrando `Ascendente`/`Descendente`; el subtítulo sí omite la dirección (`1979-1982`).
- **Impacto:** cosmético, preexistente al plan del 2026-10-27.
- **Propuesta:** ninguna en este cambio; si se decide, alinear la etiqueta o el `title`.
- **Responsable:** `frontend`. Opcional.

## 8. Limitaciones residuales

1. **Navegador de escritorio de la sesión no disponible** (`browser.disconnected`): el E2E se ejecutó con Chrome 156 headless local por CDP contra `http://localhost`. Los eventos son reales (ratón/teclado a nivel de protocolo) y las aserciones son sobre el DOM vivo, pero **no** se validó el render visual con GPU ni el comportamiento con la pestaña visible (foco automático por `requestAnimationFrame`, `visibilityState`). Las capturas se revisaron para confirmar jerarquía tipográfica de la línea (`Fila:` secundario + valor en `font-medium text-foreground`).
2. **Viewport móvil** no emulado: la línea nueva comparte el `flex-wrap` de la cabecera (`1891`) y `truncate`, pero no se midió en 375 px.
3. **403 en el guardado previo al cambio de criterio** verificado solo por código (requeriría revocar permisos a mitad de sesión).
4. **Carrera `columns` desactualizado** (O-02) no reproducible desde una sola pestaña.
5. **Sin pruebas de componente** (jsdom/RTL): el proyecto no las tiene; la cobertura de la lógica pura es por tests unitarios.
6. `DEBUG=True` en Django local (visto en un 404 de ruta inexistente): esperado en el entorno local, fuera del alcance de este cambio y no evaluado aquí.

## 9. Criterio de terminado del plan (§10)

| Ítem | Estado |
| --- | --- |
| `npm test` pasa | **Sí** (153/153) |
| `npx tsc --noEmit -p tsconfig.app.json` sin errores | **Sí** (exit 0) |
| `npm run build` correcto | **Sí** (`index-DAvO6DDD.js`, idéntico al servido) |
| Matriz de aceptación verificada en navegador | **Sí** (14/14) |
| QA documentado con evidencia | **Sí** (este documento) |
| Sin cambios en `backend/` | **Sí** |
| Sin despliegue al dominio | **Sí** (solo `localhost`) |

## 10. Comandos usados

```powershell
# Estado y diff
git branch --show-current            # base-sync
git status --short
git diff frontend/src/components/ReviewMode.tsx
git diff --stat

# Datos temporales (ORM dentro del contenedor; sin tocar backend/)
docker compose exec -T django python manage.py shell -c "exec(open('/tmp/qa_seed.py').read())"
docker compose exec -T django python manage.py shell -c "from api.models import CellValue; ..."

# API (verificación de contrato y datos)
curl.exe -s -c cookies.txt -H "Content-Type: application/json" --data-binary "@login.json" http://localhost/api/user/login/
curl.exe -s -b cookies.txt http://localhost/api/tables/<table>/columns/<col>/cellvalues/

# Calidad
cd frontend; npm test
cd frontend; npx tsc --noEmit -p tsconfig.app.json
cd frontend; npm run build

# E2E (Chrome local headless + CDP, sin dependencias nuevas)
chrome.exe --headless=new --disable-gpu --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
node <tmp>/qa-cdp.mjs nav  http://localhost/table/<table>
node <tmp>/qa-cdp.mjs eval <tmp>/qa-snap.js
node <tmp>/qa-cdp.mjs click 551 489
node <tmp>/qa-cdp.mjs key   ArrowRight
node <tmp>/qa-cdp.mjs blockclick "*cellvalues*" 551 479   # fallo de carga de la columna de orden
node <tmp>/qa-cdp.mjs shot  <tmp>/qa-shot2.png

# Limpieza
docker compose exec -T django python manage.py shell -c "exec(open('/tmp/qa_cleanup.py').read())"
```

El harness CDP (`qa-cdp.mjs`) y los scripts de datos (`qa_seed.py`, `qa_restore.py`, `qa_cleanup.py`) viven **fuera del repositorio** (directorio temporal) y no se añadieron al árbol.
