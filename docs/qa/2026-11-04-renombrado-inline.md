# QA: renombrado inline de tablas, pestañas, columnas y filas

- **Fecha:** 2026-11-04 (ejecución E2E entre la noche del 2026-11-04 y la madrugada del 2026-11-05, hora local)
- **Revalidación post-fix:** 2026-11-05/06, contra la imagen nueva de `tlaix-django` y el mismo bundle de frontend.
- **Rama:** `base-sync` (árbol de trabajo, sin commit)
- **Plan auditado:** `docs/plans/2026-11-04-renombrado-inline.md`
- **Tipo de auditoría:** lectura de implementación + `git diff` + `npm test` + `tsc` + E2E real en navegador local (`http://localhost`) + comprobaciones directas de API con `curl` + validación de serializadores en Django shell + revalidación E2E tras el fix de backend.
- **Entorno E2E:** contenedores `db`, `django` y `react`; bundle servido **`/assets/index-C-DScxTJ.js`** (sin cambios durante toda la auditoría y la revalidación).
- **Archivos bajo auditoría (árbol de trabajo):**
  - `frontend/src/lib/rename.ts` (nuevo), `frontend/src/lib/rename.test.ts` (nuevo).
  - `frontend/src/components/InlineRename.tsx` (nuevo).
  - `frontend/src/api/tables.ts`, `tabs.ts`, `rows.ts`, `columns.ts` (métodos `rename` con `PATCH`).
  - `frontend/src/pages/Index.tsx`, `frontend/src/pages/TableView.tsx` (integración).
  - `backend/api/urls.py` y `backend/api/tests.py` (fix del bloqueante H-01 y tests de regresión, ya en el árbol de trabajo).
- **Backend:** el fix de H-01 (`'patch': 'partial_update'`) está aplicado y la imagen `tlaix-django` reconstruida. No se modificó código de producción durante el QA ni se hizo commit.
- **Sin despliegue** a `tlaix.smart-food.cc`; todo el tráfico fue a `http://localhost`.

> **Nota de entorno:** al reanudar la primera sesión, `tlaix-django-1` y `tlaix-react-1` estaban en `Exited (255)` (parada previa del host). Se levantaron con `docker compose up -d django react` **sin reconstruir**; el bundle servido siguió siendo `index-C-DScxTJ.js`. En la revalidación, `tlaix-django-1` corre la imagen nueva (ID `5e6281596d0d`, construida el 2026-11-05).

---

## 1. Resumen ejecutivo

La implementación es coherente con el plan y **el renombrado inline funciona en los cuatro elementos** (tabla, pestaña, columna y fila) una vez corregido el enrutado `PATCH` del backend.

La primera pasada detectó un bloqueante real (**H-01**): los endpoints `PATCH` de pestañas, columnas y filas devolvían **405** porque `backend/api/urls.py` mapeaba solo `get`/`put`/`delete`. El plan asumía que «el backend ya soporta PATCH por ser ModelViewSet», lo que no era cierto con los `as_view({...})` explícitos. `backend` añadió `'patch': 'partial_update'` a las tres rutas, reconstruyó la imagen de Django y agregó 9 tests de regresión.

La **revalidación post-fix** re-ejecutó los casos que estaban bloqueados (2, 3, 7, 9, 11 y 12) y una batería de regresión: **todos pasan**. El frontend no cambió (`index-C-DScxTJ.js`).

| Capa | Estado | Evidencia |
| --- | --- | --- |
| Helper puro (`lib/rename.ts`) | OK | 10 tests nuevos; `npm test` 163/163 (§3.1) |
| Componente (`InlineRename.tsx`) | OK en comportamiento | Matriz E2E (§6) y revalidación (§7) |
| Tablas (`Index.tsx` + `PATCH /tables/`) | **Funciona** | Casos A1–A9, C4, C5, G1–G6 |
| Pestañas (`PATCH /tabs/`) | **Funciona (200)** | Casos C7/C7p, C9a, C11tab |
| Columnas (`PATCH /columns/`) | **Funciona (200)** | Casos C2/C2p, C9b, C12a/b |
| Filas (`PATCH /rows/`) | **Funciona (200)** | Casos C3/C3p, C12c |
| Tipado (`tsconfig.app.json`) | OK | `TSC_EXIT=0` |
| Regresiones (revisión, búsqueda, celdas, pestañas) | OK | Casos G7–G10 |
| Backend | **Corregido y verificado** | `backend/api/urls.py`, 101/101 tests (§3.6) |

**Veredicto: LISTO PARA COMMIT.** El bloqueante H-01 está corregido y verificado de extremo a extremo; B-01 y B-02 quedaron corregidos; no hay bugs nuevos del cambio. Queda abierto, sin bloquear y fuera del alcance, el hallazgo preexistente R-01, además de las observaciones O-01/O-02/O-03 (§8).

---

## 2. Método

1. Lectura del plan y del `git diff` completo de `frontend/`.
2. Lectura íntegra de `InlineRename.tsx`, `lib/rename.ts`, los cuatro servicios de API y las integraciones en `Index.tsx`/`TableView.tsx`.
3. Contraste con el backend: `backend/api/urls.py`, `views.py`, `serializers.py`, `permissions.py` y `models.py`.
4. Reproducción de los `PATCH` con `curl` contra `http://localhost/api/...` usando un usuario temporal con permisos completos.
5. E2E en Chrome 156 headless por CDP (`--remote-debugging-port`), con **eventos reales** de ratón y teclado (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, `Input.insertText`) y aserciones sobre DOM, foco, selección, red y toasts. El navegador de escritorio de la sesión no estaba conectado (`browser.disconnected`), así que se usó Chrome local contra el mismo `http://localhost`.
6. Conteo de peticiones por `Network.requestWillBeSent` + `Network.responseReceived` (método, URL, `postData` y status reales).
7. Validación de los serializadores con `partial=True` y de los errores de unicidad en Django shell.
8. Limpieza de todos los datos temporales y verificación de conteos (§5).

**Revalidación post-fix (2026-11-05/06):**

9. Confirmación del fix en `backend/api/urls.py`, de la imagen nueva de `tlaix-django` y de la suite de backend (`python manage.py test api` → 101/101).
10. Nueva fixture temporal (tabla + 3 pestañas + 3 columnas + 3 filas + 9 celdas) y dos usuarios: propietario con permisos completos y visor con `view_table`/`change_table` + `view_tab` (sin `change_tab`, sin `change_*` globales).
11. E2E de los casos 2, 3, 7, 9, 11 y 12 con eventos reales, aserciones sobre `postData`, status, toasts, foco, selección, pestaña activa y nombre visible.
12. Batería de regresión: tabla, Escape/vacío/sin cambios/Enter+blur, posiciones, cambio de pestaña, búsqueda en revisión y edición de celda con persistencia.
13. `npm test` (163/163), `tsc` (0) y verificación de que el bundle servido sigue siendo `index-C-DScxTJ.js`.
14. Limpieza de la fixture de revalidación y verificación de restos (tablas, usuarios, grupos y permisos guardian).

**No se hizo:** pruebas de componente con jsdom/React Testing Library (el proyecto no las tiene), viewport móvil, lector de pantalla, edición simultánea de dos elementos, clic en otra tarjeta durante la edición, ni despliegue al dominio.

---

## 3. Comandos y resultados

### 3.1 `npm test`

```text
 ✓ src/lib/auth-modal.test.ts   (6 tests)
 ✓ src/lib/auth.test.ts        (37 tests)
 ✓ src/lib/review.test.ts      (89 tests)
 ✓ src/lib/rename.test.ts      (10 tests)
 ✓ src/lib/date-name.test.ts   (21 tests)

 Test Files  5 passed (5)
      Tests  163 passed (163)
```

Los 10 tests de `rename.test.ts` cubren recorte, espacios internos, acentos, vacío, solo espacios, igual al original y diferencias solo de espacios exteriores. Coinciden con la §7 del plan.

### 3.2 `npx tsc --noEmit -p tsconfig.app.json`

```text
TSC_EXIT=0
```

### 3.3 Bundle servido

```text
$ curl -s http://localhost/ | grep assets
assets/index-C-DScxTJ.js
assets/index-Bxuix4H4.css
```

Coincide con el bundle que reportó `docker-ops`, por lo que el E2E se ejecutó contra el código auditado.

### 3.4 `PATCH` por recurso — primera pasada (antes del fix)

| Recurso | Petición | Status | Cuerpo |
| --- | --- | --- | --- |
| Tabla | `PATCH /api/tables/<T>/` `{"name":"…"}` | **200** | tabla actualizada |
| Pestaña | `PATCH /api/tables/<T>/tabs/<P>/` `{"name":"…","label":"…"}` | **405** | `{"detail":"Method \"PATCH\" not allowed."}` |
| Columna | `PATCH /api/tables/<T>/columns/<C>/` `{"name":"…"}` | **405** | `{"detail":"Method \"PATCH\" not allowed."}` |
| Fila | `PATCH /api/tables/<T>/rows/<R>/` `{"name":"…"}` | **405** | `{"detail":"Method \"PATCH\" not allowed."}` |

### 3.5 Serializadores con `partial=True` (Django shell)

```json
{"row_partial_valid": true, "col_partial_valid": true, "tab_partial_valid": true,
 "col_dup_valid": false, "col_dup_errors": {"non_field_errors": ["The fields tab_id, name must make a unique set."]},
 "tab_dup_valid": false, "tab_dup_errors": {"non_field_errors": ["The fields table, name must make a unique set."]}}
```

Los serializadores **sí** soportan actualización parcial y ya devuelven 400 por duplicado. El único problema era el enrutado HTTP.

### 3.6 Revalidación post-fix

```text
$ docker compose ps
tlaix-django-1   tlaix-django   Up (imagen nueva)
tlaix-react-1    tlaix-react    Up

$ docker images tlaix-django
5e6281596d0d   2026-11-05 19:07:24 -0600 CST

$ docker compose exec -T django python manage.py test api
Ran 101 tests in 50.365s
OK

$ cd frontend && npm test
Test Files  5 passed (5)
     Tests  163 passed (163)

$ npx tsc --noEmit -p tsconfig.app.json
TSC_EXIT=0

$ curl -s http://localhost/ | grep assets
assets/index-C-DScxTJ.js
```

`PATCH` parcial en los cuatro recursos, verificado en el E2E de revalidación (status real de red):

| Recurso | Petición representativa | Status |
| --- | --- | --- |
| Tabla | `PATCH /api/tables/<T>/` `{"name":"qa_rename_tabla_20261105 b2"}` | **200** |
| Pestaña | `PATCH …/tabs/<P>/` `{"name":"pestana tres editada","label":"pestana tres editada"}` | **200** |
| Columna | `PATCH …/columns/<C>/` `{"name":"columna dos editada"}` | **200** |
| Fila | `PATCH …/rows/<R>/` `{"name":"fila uno final2"}` | **200** |

Detalle y evidencia completa en §7.

---

## 4. Posición de los cuatro puntos de renombrado

Verificado en DOM con `getBoundingClientRect()` (coordenadas en píxeles, viewport 1440×1000).

| Elemento | Orden real en el DOM | Rectángulos (left→right) | Estado |
| --- | --- | --- | --- |
| Columna | `Renombrar columna` · `Revisar columna` · `Eliminar columna` | lápiz 356→374 · revisar 530→548 | OK (lápiz a la izquierda) |
| Fila | `Renombrar fila` · `Revisar fila` | lápiz 102→120 · revisar 207→225 | OK |
| Pestaña | `Renombrar pestaña` · `X` | lápiz 279→297 · X 305→319 | OK (antes de la X) |
| Tabla (tarjeta) | grupo superior derecho: `Renombrar tabla` · `Eliminar tabla` | lápiz 1314→1346 · eliminar 1350→1382 | OK (mismo grupo flex) |

Los `title`/`aria-label` son los pedidos: `Renombrar columna X`, `Renombrar fila X`, `Renombrar pestaña X`, `Renombrar tabla X`. El icono es `Pencil` de `lucide-react` en los cuatro casos.

---

## 5. Datos de prueba y limpieza

### 5.1 Datos

- Tabla `qa_rename_tabla_20261104` con 3 pestañas (`pestana uno/dos/tres`), 3 columnas (`columna uno` text, `columna dos` text, `columna tres` int) y 3 filas (`fila uno/dos/tres`), 9 celdas.
- Usuario propietario `e2e_rename_20261104` con permisos de objeto completos sobre tabla y pestañas y permisos globales de `Column`/`Row`/`CellValue`.
- Usuario de solo lectura `e2e_rename_viewer_20261104` con `view_table`/`view_tab` sobre la tabla y permisos globales de `view_*` (para el caso 403).
- Usuario `e2e_idor_probe_20261104` (solo `view_row` global, sin permisos sobre la tabla `Test`) para la comprobación R-01.

### 5.2 Limpieza verificada

```text
tabla borrada:    Table 1→0 · Tab 3→0 · Column 3→0 · Row 3→0 · CellValue 9→0
usuarios:         e2e_rename_20261104 (id 33) y e2e_rename_viewer_20261104 (id 34) borrados
grupos:           qa_rename_global, qa_rename_viewer borrados
sonda IDOR:       e2e_idor_probe_20261104 (id 36) y qa_idor_probe borrados
restos:           tablas QA 0 · usuarios QA 0 · grupos QA 0 · permisos guardian sobre esos ids 0
```

La segunda tanda (fixture mínimo para D1/D2) también se eliminó y se volvió a verificar (`Table/Tab/Column/Row/CellValue` a 0). Chrome headless se cerró al terminar.

### 5.3 Fixture de revalidación post-fix

- Tabla `qa_rename_tabla_20261105` (renombrada varias veces durante las pruebas, hasta `qa_rename_tabla_20261105 c2`), con 3 pestañas, 3 columnas (`text`, `text`, `int`) y 3 filas, 9 celdas.
- Propietario `e2e_rename_20261105` (id 44): permisos de objeto completos sobre tabla y pestañas y permisos globales de `Column`/`Row`/`CellValue`.
- Visor `e2e_rename_viewer_20261105` (id 45): `view_table` + `change_table` sobre la tabla y `view_tab` sobre las pestañas; **sin** `change_tab` y **sin** `change_*` globales. Se le dio `change_table` a propósito para que el `PATCH` de pestaña llegara a la comprobación por objeto de la pestaña (y no se quedara en la de la tabla).
- La tabla se usó para renombrar pestañas, columnas, filas y la propia tabla, y para los casos de duplicado y 403.

**Limpieza de la revalidación (verificada):**

```text
tabla borrada:    Table 1→0 · Tab 3→0 · Column 3→0 · Row 3→0 · CellValue 9→0
usuarios:         e2e_rename_20261105 (id 44) y e2e_rename_viewer_20261105 (id 45) borrados
grupos:           qa_rename_global, qa_rename_viewer borrados
restos:           tablas QA 0 · usuarios QA 0 · grupos QA 0 · guardian sobre ids de la fixture 0
```

---

## 6. Matriz de aceptación (plan §6)

Estados: **Verificado (E2E)** = comprobado en navegador con red/DOM reales; **Falla** = comportamiento incorrecto reproducido. Los casos que dependían del `PATCH` (2, 3, 7, 9, 11 y 12) se re-ejecutaron tras el fix de H-01 (§7.2); el resto se verificó en la primera pasada y las regresiones se repitieron en §7.3.

| # | Caso (plan §6) | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | Lápiz en columna → input con foco y texto seleccionado | **Verificado (E2E)** | `present:true, focused:true, selection 0..11`; no abre el modo revisión; el lápiz de esa columna desaparece mientras edita |
| 2 | Enter con nombre nuevo en columna → `PATCH` correcto + toast | **Verificado (E2E)** | `PATCH …/columns/<C>/` `{"name":"columna uno editada"}` → **200**; toast `Columna renombrada correctamente`; texto y `aria-label` actualizados; persiste tras recargar (C2/C2p) |
| 3 | Blur con nombre nuevo en fila → `PATCH` correcto + toast | **Verificado (E2E)** | `PATCH …/rows/<R>/` `{"name":"fila uno final2"}` → **200**; toast `Fila renombrada correctamente`; persiste tras recargar (C3/C3p) |
| 4 | Escape en cualquier elemento → cancela sin petición | **Verificado (E2E)** | Tabla: 0 PATCH y nombre restaurado. Pestaña: 0 PATCH. Columna y fila: 0 PATCH, input cerrado y `aria-label` con el nombre original (F1/F2) |
| 5 | Nombre vacío → cancela sin petición | **Verificado (E2E)** | Tabla: borrado total del texto + Enter → 0 PATCH, nombre restaurado (G3) |
| 6 | Nombre sin cambios → cancela sin petición | **Verificado (E2E)** | Tabla: abrir + Enter sin tocar → 0 PATCH, input cerrado (G4) |
| 7 | Renombrar pestaña actualiza `name` y `label`; no cambia de selección | **Verificado (E2E)** | `PATCH …/tabs/<P>/` `{"name":"pestana tres editada","label":"pestana tres editada"}` → **200**; toast `Pestaña renombrada correctamente`; pestaña activa sigue en `pestana uno`; `GET /tabs/` confirma `name` y `label` sincronizados (C7p) |
| 8 | Renombrar tabla desde la tarjeta; no navega | **Verificado (E2E)** | `PATCH /api/tables/<T>/` → 200, tarjeta actualizada, un toast, `location.pathname` sigue `/` (G1) |
| 9 | Nombre duplicado → toast de error e input abierto | **Verificado (E2E)** | Tabla: 400, un solo toast `name: table with this name already exists.`, input abierto y enfocado. Pestaña: 400 `non_field_errors: The fields table, name must make a unique set.`, input abierto y pestaña activa sin cambios (C9a). Columna: 400 `non_field_errors: The fields tab_id, name must make a unique set.`, input abierto (C9b) |
| 10 | Error 401 → modal global sin toast duplicado | **Verificado (E2E)** | `PATCH` → 401; **0 toasts** en `[data-rht-toaster]`; modal con `Tu sesión expiró. Inicia sesión de nuevo.` |
| 11 | Error 403 → toast de permisos e input abierto | **Verificado (E2E)** | Tabla: usuario con `view_table` sin `change_table` → **403** (primera pasada). Revalidación: pestaña (**403** por `change_tab` de objeto), columna y fila (**403** por permiso global) → toast `You do not have permission to perform this action.`, input abierto y enfocado, sin navegar, pestaña activa sin cambios (C11tab/C11col/C11row) |
| 12 | Renombrar fila/columna en revisión actualiza `reviewTarget.label` | **Verificado (E2E)** | Tras renombrar, al reabrir la revisión el overlay muestra el nombre nuevo: columna `columna uno final` (C12b) y fila `fila uno final` (C12c). Nota: el overlay ocupa toda la pantalla, así que el caso «renombrar con el overlay abierto» no es alcanzable desde la UI; el contrato observable es «reabrir muestra el nombre nuevo» |
| 13 | Enter + blur → una sola petición | **Verificado (E2E)** | Tabla: exactamente **1** `PATCH`, status 200, un solo toast (G5) |
| 14 | Clic fuera del input en la tarjeta → guarda y no navega | **Verificado (E2E)** | Clic en la descripción de la tarjeta: 1 `PATCH` 200 y `pathname` sigue `/` |
| 15 | Modo revisión, búsqueda, celdas | **Verificado (E2E)** | Revisión de fila y de columna abren y cierran; búsqueda filtra (`fila dos`, `fila tres`, `fila uno final`); editar celda de texto hace `PUT` 200 y el valor persiste tras recargar (G8/G9/G10) |

### 6.1 Comprobaciones adicionales

| ID | Comprobación | Estado | Evidencia |
| --- | --- | --- | --- |
| E1 | Cuatro lápices en la posición pedida | **Verificado** | §4 |
| E2 | `maxLength` por elemento | **Verificado** | tabla 100, pestaña 100, columna 100, fila 200 |
| E3 | Lápiz de pestaña no cambia la pestaña | **Verificado** | Pestaña inactiva `pestana dos`: `aria-selected` sigue en `pestana uno` antes/después |
| E4 | Teclado sobre el lápiz de pestaña (`span role="button"`) | **Verificado** | Foco + Enter abre el input y no activa la pestaña |
| E5 | Payload de pestaña sincroniza `name` y `label` | **Verificado** | `{"name":"pestana dos x","label":"pestana dos x"}` |
| E6 | Sin toasts duplicados en éxito/400 | **Verificado** | 1 toast por operación (contador sobre `[data-rht-toaster]`) |
| E7 | Los errores 400/403 mantienen la edición abierta y reenfocan | **Verificado** | Input presente y `document.activeElement === input` tras el 400/403 (C9a/C9b/C11*) |
| E8 | Serializadores admiten `partial=True` | **Verificado** | §3.5 |

---

## 7. Revalidación post-fix (2026-11-05/06)

### 7.1 Contexto del fix

- `backend/api/urls.py` mapea `'patch': 'partial_update'` en las rutas de detalle de filas, columnas y pestañas.
- Imagen `tlaix-django` reconstruida (`5e6281596d0d`, 2026-11-05 19:07) y `tlaix-django-1` corriendo la imagen nueva.
- `backend/api/tests.py` incorpora `PartialUpdatePatchTestCase` (9 tests nuevos): `PATCH` 200 en los tres recursos, actualización parcial sin exigir campos de `PUT`, duplicados 400 y 403 sin permiso.
- `python manage.py test api` → **101/101 OK**.
- Frontend sin cambios: bundle servido `index-C-DScxTJ.js`; `npm test` **163/163**; `tsc` **0**.

### 7.2 Casos antes bloqueados

| ID | Caso | Resultado | Evidencia (red / DOM) |
| --- | --- | --- | --- |
| C2 | Columna + Enter | **Pasa** | `PATCH …/columns/3d6c3971…/` `{"name":"columna uno editada"}` → **200**; toast `Columna renombrada correctamente`; `aria-label` pasa a `Renombrar columna columna uno editada`; `pathname` sigue en `/table/<T>` |
| C2p | Persistencia de columna | **Pasa** | Tras recargar, `aria-label` sigue `Renombrar columna columna uno editada` |
| C3 | Fila + blur | **Pasa** | `PATCH …/rows/f13db4c2…/` `{"name":"fila uno final2"}` → **200**; toast `Fila renombrada correctamente`; `aria-label` actualizado |
| C3p | Persistencia de fila | **Pasa** | Tras recargar, `aria-label` sigue `Renombrar fila fila uno final2` |
| C7 | Pestaña inactiva + Enter | **Pasa** | `PATCH …/tabs/8ee78fc0…/` `{"name":"pestana tres editada","label":"pestana tres editada"}` → **200**; toast `Pestaña renombrada correctamente`; pestaña activa sigue en `pestana uno`; `pathname` sin cambios |
| C7p | Persistencia de pestaña | **Pasa** | Tras recargar, la pestaña muestra `pestana tres editada` y `GET /api/tables/<T>/tabs/` devuelve `name` y `label` sincronizados |
| C9a | Duplicado de pestaña | **Pasa** | `PATCH …/tabs/…/` `{"name":"pestana dos editada","label":"pestana dos editada"}` → **400**; un toast `non_field_errors: The fields table, name must make a unique set.`; input abierto y enfocado; pestaña activa sin cambios |
| C9b | Duplicado de columna | **Pasa** | `PATCH …/columns/13cc673e…/` `{"name":"columna uno final"}` → **400**; un toast `non_field_errors: The fields tab_id, name must make a unique set.`; input abierto y enfocado |
| C11tab | 403 en pestaña | **Pasa** | Visor con `view_table` + `change_table` + `view_tab`, sin `change_tab`: `PATCH …/tabs/c5dfabe8…/` → **403**; toast `You do not have permission to perform this action.`; input abierto; sin navegar |
| C11col | 403 en columna | **Pasa** | Mismo visor sin `change_column` global: `PATCH …/columns/…/` → **403**; toast de permisos; input abierto |
| C11row | 403 en fila | **Pasa** | Mismo visor sin `change_row` global: `PATCH …/rows/…/` → **403**; toast de permisos; input abierto |
| C12a | Revisión de columna tras renombrar | **Pasa** | El overlay abre con `Revisar columna: "columna uno editada"` |
| C12b | Renombrar columna y reabrir revisión | **Pasa** | `PATCH …/columns/…/` `{"name":"columna uno final"}` → **200**; al reabrir, `Revisar columna: "columna uno final"` |
| C12c | Revisión de fila con nombre nuevo | **Pasa** | El overlay abre con `Revisar fila: "fila uno final"` |

> **Alcance del caso 12:** el overlay de revisión ocupa toda la pantalla (`fixed inset-0 z-50`), por lo que no es posible pulsar el lápiz mientras está abierto. El contrato verificable es el que pide el plan: **al reabrir la revisión se muestra el nombre nuevo**. La rama de código que actualiza `reviewTarget.label` (`TableView.tsx:475-480` y `500-505`) queda cubierta por ese comportamiento y por revisión de código, no por una interacción simultánea.

### 7.3 Regresión (misma sesión, imagen nueva)

| ID | Comprobación | Resultado | Evidencia |
| --- | --- | --- | --- |
| G1 | Renombrar tabla | **Pasa** | `PATCH /api/tables/<T>/` `{"name":"qa_rename_tabla_20261105 b2"}` → **200**; toast `La tabla "…" se renombró exitosamente`; tarjeta actualizada; `pathname` `/` |
| G2 | Escape en tabla | **Pasa** | 0 peticiones; nombre sin cambios |
| G3 | Nombre vacío | **Pasa** | 0 peticiones; nombre sin cambios |
| G4 | Nombre sin cambios | **Pasa** | 0 peticiones; input cerrado |
| G5 | Enter + blur | **Pasa** | Exactamente 1 `PATCH` 200; sin navegar |
| G6 | Posición tarjeta | **Pasa** | Lápiz 1314→1346, papelera 1350→1382, mismo contenedor, orden lápiz→papelera |
| G7 | Posición TableView | **Pasa** | Pestaña: lápiz 279→297, X 305→319 (y análogos en las otras dos); columna y fila: lápiz siempre a la izquierda de «Revisar» |
| G8 | Cambio de pestaña | **Pasa** | `pestana uno` → `pestana dos editada` al pulsar la segunda pestaña |
| G9 | Búsqueda en revisión | **Pasa** | Filtra y muestra `fila dos`, `fila tres`, `fila uno final` |
| G10 | Edición de celda | **Pasa** | `PUT /api/tables/cell/<T>/<C>/<R>/` `{"value":"celda reval"}` → **200**; el valor persiste tras recargar |

### 7.4 Observaciones del arnés (no son bugs del producto)

- Dos aserciones fallaron en la primera pasada de revalidación por motivos del script, no de la aplicación: (a) se contó un toast anterior todavía visible al comprobar el duplicado de columna; (b) se hizo clic en un lápiz durante el cierre animado del overlay de revisión. Se corrigieron (espera de expiración de toasts y espera explícita a que el overlay desaparezca) y ambos casos pasaron.
- El conteo de toasts se hace sobre `[data-rht-toaster] [role="status"]` para no confundirlos con el aviso `role="status"` del diálogo de sesión expirada.

---

## 8. Hallazgos

### 8.1 Estado de hallazgos

| ID | Severidad | Estado | Nota |
| --- | --- | --- | --- |
| H-01 | Crítico | **Corregido y verificado** | `PATCH` enrutado en filas/columnas/pestañas; revalidado E2E |
| B-01 | Bajo | **Corregido** | Plan y especificación actualizados |
| B-02 | Bajo | **Corregido** | 9 tests de backend; 101/101 |
| B-03 | Alto (preexistente) | **Abierto** | Re-parentado de filas/columnas/pestañas vía `PUT`/`PATCH`; fuera del alcance del cambio |
| R-01 | Alto (preexistente) | **Abierto** | IDOR de lectura en `RowViewSet`; fuera del alcance del cambio |
| O-01 | Informativo | **Abierto** | Mensajes DRF en inglés |
| O-02 | Informativo | **Abierto** | `span[role="button"]` anidado en el trigger de pestaña |
| O-03 | Informativo | **Abierto** | `aria-label` del input con el nombre anterior mientras se edita |

### H-01 — Crítico: `PATCH` no está enrutado para pestañas, columnas y filas (405) — **CORREGIDO Y VERIFICADO**

- **Estado:** corregido el 2026-11-05 en `backend/api/urls.py`; imagen `tlaix-django` reconstruida; revalidado E2E el 2026-11-05/06 (§7.2).
- **Archivos (estado original):** `backend/api/urls.py:32-33` (filas), `36-37` (columnas), `40-41` (pestañas).
- **Descripción:** las rutas de detalle se declaraban con mapas de acciones explícitos que solo incluían `get`, `put` y `delete`:
  ```python
  path('tables/<str:table_id>/rows/<str:pk>/',
       RowViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'})),
  ```
  `ModelViewSet` implementa `partial_update`, pero al no estar en el mapa, DRF respondía **405** antes de ejecutar la validación del serializador. `TableViewSet` sí acepta `PATCH` porque se registra con `DefaultRouter`.
- **Causa raíz:** el plan (§4.3) asumió que «el backend ya soporta `PATCH` por ser `ModelViewSet`», pero el `URLconf` limitaba los métodos de esos tres `ViewSet`.
- **Reproducción:**
  1. Autenticarse con un usuario con permisos completos sobre una tabla temporal.
  2. `PATCH /api/tables/<T>/columns/<C>/` con `{"name":"columna uno x"}` → `405 {"detail":"Method \"PATCH\" not allowed."}`.
  3. Repetir con `/tabs/<P>/` (`name` + `label`) y `/rows/<R>/` (`name`) → mismo 405.
  4. En la UI: abrir el lápiz de una columna/fila/pestaña, escribir y pulsar Enter. La petición sale, recibe 405, se muestra el toast `Method "PATCH" not allowed.` y el input permanece abierto.
- **Impacto (histórico, antes del fix):** el renombrado inline solo funcionaba en tablas. Pestañas, columnas y filas quedaban inutilizables; además impedía validar duplicados de pestaña/columna, el 403 en esos recursos y la actualización de `reviewTarget.label`.
- **Propuesta de corrección (backend):**
  ```python
  path('tables/<str:table_id>/rows/<str:pk>/',
       RowViewSet.as_view({'get': 'retrieve', 'put': 'update',
                           'patch': 'partial_update', 'delete': 'destroy'})),
  path('tables/<str:table_id>/columns/<str:pk>/',
       ColumnViewSet.as_view({'get': 'retrieve', 'put': 'update',
                              'patch': 'partial_update', 'delete': 'destroy'})),
  path('tables/<str:table_id>/tabs/<str:pk>/',
       TabViewSet.as_view({'get': 'retrieve', 'put': 'update',
                           'patch': 'partial_update', 'delete': 'destroy'})),
  ```
  No hace falta tocar serializadores ni migraciones: `RowSerializer`, `ColumnSerializer` y `TabSerializer` ya validan con `partial=True` y devuelven 400 por duplicado (§3.5).
- **Fix aplicado:** `backend` añadió `'patch': 'partial_update'` a las tres rutas, reconstruyó la imagen `tlaix-django` y agregó `PartialUpdatePatchTestCase` (9 tests). `python manage.py test api` → **101/101 OK**.
- **Verificación del fix (E2E, §7.2):** `PATCH` 200 en columna (C2), fila (C3), pestaña (C7) y tabla (G1); duplicados 400 (C9a/C9b); 403 en pestaña/columna/fila (C11*); revisión con nombre nuevo (C12*). Sin regresiones (G2–G10).
- **Agente responsable:** `backend` (completado).
- **Coordinación:** fue un cambio de contrato respecto al plan original («sin cambios de backend»). Requirió reconstruir `django` (no bastaba con `react`) y volver a ejecutar los casos 2, 3, 7, 9 (pestaña/columna), 11 (pestaña) y 12; ya realizado.
- **Alternativa descartada:** usar `PUT` desde el frontend. En filas, `RowSerializer.data` es obligatorio en `PUT` (`serializers.py:47`), así que un renombrado parcial fallaría o exigiría enviar todas las celdas; el plan ya lo descarta.

### B-01 — Bajo: el plan y la documentación asumían que `PATCH` ya estaba enrutado — **CORREGIDO**

- **Archivos:** `docs/plans/2026-11-04-renombrado-inline.md` (antes `:169`), `SYSTEM_API_SPECIFICATION.md`.
- **Descripción:** la afirmación «El backend ya soporta `PATCH` por ser `ModelViewSet`» era incorrecta para las rutas con `as_view({...})`.
- **Estado:** el plan se actualizó (alcance y agentes incluyen `backend`; nueva §4.6 con el enrutado y el checklist) y `SYSTEM_API_SPECIFICATION.md` documenta `PATCH` en pestañas, columnas y filas, incluida la actualización parcial y los duplicados 400.
- **Impacto:** documental; inducía a error a futuros cambios.
- **Responsable:** `backend` / orquestador (completado).

### B-02 — Bajo: faltaban tests de backend que cubrieran `PATCH` en el detalle — **CORREGIDO**

- **Archivo:** `backend/api/tests.py`.
- **Descripción:** no había ningún test que hiciera `PATCH` a `/tabs/`, `/columns/` o `/rows/`; los tests del helper puro no atraviesan HTTP y no podían detectar el 405.
- **Estado:** se añadió `PartialUpdatePatchTestCase` (9 tests) que cubre `PATCH` 200 en los tres recursos, actualización parcial sin exigir los campos de `PUT`, duplicados 400 y 403 sin permiso. `python manage.py test api` → **101/101 OK**.
- **Responsable:** `backend` / `test-writer` (completado).

### B-03 — Alto, **preexistente y fuera del alcance del cambio**: re-parentado de filas/columnas/pestañas sin permiso sobre el destino

- **Archivos:** `backend/api/serializers.py:51` (`RowSerializer` incluye `table`), `:104` (`TabSerializer` incluye `table`), `:28-30` (`ColumnSerializer.tab_id` escribible); `backend/api/views.py:225-237`, `:164-183`, `:288-302`.
- **Descripción:** `PUT` y el nuevo `PATCH` aceptan los campos padre escribibles. Un usuario con permisos sobre la tabla A puede enviar `table`/`tab_id` apuntando a una tabla o pestaña B sin permisos sobre B; el objeto se mueve y deja de estar en A.
- **Reproducción (verificada por `test-writer` con `transaction.atomic()` + rollback):**
  - usuario con permisos solo sobre A;
  - `PATCH /api/tables/A/rows/<R>/` con `{"table": "<B>"}` → **200** y la fila aparece en B;
  - mismo patrón para columnas (`tab_id`) y pestañas (`table`).
- **Impacto:** movimiento/exfiltración de datos entre tablas y pérdida del objeto en la tabla origen. El `PUT` ya estaba expuesto; el `PATCH` recién habilitado amplía la superficie, aunque el frontend de renombrado solo envía `name`.
- **Propuesta:** hacer los campos padre de solo lectura en actualización (`table` en filas/pestañas, `tab_id` en columnas) o validar `change_table`/`view_tab` sobre el padre destino y devolver 400/403; añadir tests de regresión. Responsable: `backend`, ticket de seguridad aparte.
- **Nota:** no lo introduce el renombrado y **no bloquea** este commit; debe abordarse junto con R-01.

### R-01 — Alto, **preexistente y fuera del alcance del cambio**: lectura de filas de tablas sin permiso (IDOR)

- **Archivos:** `backend/api/views.py:219-237` (`RowViewSet`), `permissions.py:36-91`.
- **Descripción:** `RowViewSet` usa `DjangoModelPermissions` (permiso global) y su `get_queryset` hace `get_object_or_404(Table, id=table_id)` sin `check_object_permissions` ni filtro por `get_objects_for_user`. `TabViewSet`, en cambio, sí comprueba permisos por objeto (`views.py:296-298`).
- **Reproducción (verificada con usuario temporal):**
  1. Crear un usuario con **solo** el permiso global `api.view_row` y **ningún** permiso sobre la tabla `Test`.
  2. `GET /api/tables/<id_de_Test>/rows/` → **200** con las 3 filas y su campo `data` (valores de celdas).
  3. `GET /api/tables/tabview/<id_de_Test>/<tab>/` → **403** (comportamiento correcto).
- **Impacto:** cualquier usuario autenticado con `view_row` global puede leer filas y valores de celdas de tablas ajenas conociendo su id. Con `change_row`/`change_column` globales, el mismo patrón permitiría modificarlas (incluido el renombrado si se habilita `PATCH`).
- **Propuesta:** filtrar el queryset de `RowViewSet` por las tablas visibles (`get_objects_for_user(user, 'api.view_table', klass=Table)`) y/o migrar a permisos por objeto (`CompleteDjangoObjectPermissions`); añadir tests de 403/404. Responsable: `backend`.
- **Nota:** no lo introduce este cambio y **no bloquea** el commit del renombrado; merece su propio ticket de seguridad.

### O-01 — Informativo: mensajes del servidor en inglés en una UI en español

- **Evidencia (revalidación):** 400 `name: table with this name already exists.` / `non_field_errors: The fields table, name must make a unique set.`; 403 `You do not have permission to perform this action.`. El 405 `Method "PATCH" not allowed.` fue histórico de H-01 y ya no aparece en el flujo normal.
- El plan pide mostrar «el mensaje del servidor», así que el frontend cumple. Si se quiere coherencia de idioma, la traducción debe hacerse en backend (mensajes propios o `LANGUAGE_CODE`/traducciones de DRF). Responsable: `backend`.

### O-02 — Informativo: `span[role="button"]` anidado dentro de `<button role="tab">`

- **Archivo:** `frontend/src/components/InlineRename.tsx:205-219`, usado en `TableView.tsx:631-638`.
- El lápiz de pestaña se renderiza como `span role="button" tabindex="0"` dentro del `TabsTrigger` (que ya es un `<button>`). Es HTML interactivo anidado; funciona con ratón y teclado (E4), pero algunos lectores de pantalla pueden anunciarlo de forma confusa. El propio componente documenta que se hizo para evitar anidar botones.
- **Propuesta:** valorar mover el lápiz fuera del `TabsTrigger` (contenedor `flex` con trigger + lápiz) o usar un contenedor no interactivo para el trigger. Responsable: `frontend` (mejora, no bloqueante).

### O-03 — Informativo: `aria-label` del input conserva el nombre anterior

- **Archivo:** `InlineRename.tsx:188` con `label` construido desde `table.name`/`column.name`/`row.name`/`tab.label`.
- Mientras se edita, el `aria-label` es `Nuevo nombre de tabla <nombre anterior>` porque la prop `value` aún no cambió. Es funcional pero ligeramente obsoleto; podría usarse un texto genérico («Nuevo nombre de tabla»). Responsable: `frontend` (opcional).

---

## 9. Cobertura

### Revisado

- Contrato completo del plan y `git diff` de los 6 archivos de `frontend/` (2 nuevos, 4 modificados).
- Posición, `title`/`aria-label` y visibilidad de los cuatro lápices.
- Entrada en edición (foco, selección completa, `maxLength`, ocultación del lápiz en modo no controlado).
- Enter, blur, Escape, vacío, sin cambios, Enter+blur y clic fuera del input en la tarjeta.
- Payloads reales (`postData`) de los cuatro servicios y status HTTP reales.
- 400 por duplicado global, 403 con usuario de solo lectura, 401 con token inválido.
- Modo revisión de fila y columna, búsqueda, edición de celdas y persistencia.
- Enrutado y permisos del backend implicados, y validación de serializadores con `partial=True`.
- **Revalidación post-fix:** casos 2, 3, 7, 9 (pestaña/columna), 11 (pestaña/columna/fila) y 12, más la regresión G1–G10.
- **Backend:** `python manage.py test api` → 101/101; imagen nueva de Django verificada.
- Limpieza de datos temporales y verificación de conteos (primera pasada y revalidación).

### No revisado / limitado

- **Caso 12 en su variante «overlay abierto mientras se renombra»:** la UI no lo permite (el overlay ocupa toda la pantalla). Se verificó el contrato observable: al reabrir, el nombre es el nuevo.
- **Edición simultánea de dos elementos** y **clic en otra tarjeta mientras se edita** (fuera del contrato del plan).
- **Responsive/móvil**, contraste y lector de pantalla real.
- **Pruebas de componente** con jsdom/React Testing Library (el proyecto no las tiene).
- **Dominio `tlaix.smart-food.cc`:** no se tocó.

---

## 10. Casos de prueba sugeridos para `docs/qa/`

Listos para incorporar a una checklist de regresión (TC = test case). Todos usan datos temporales y deben limpiarse al final. Los TC RN-02 a RN-16 ya se ejecutaron en esta auditoría (matriz §6 y revalidación §7).

| TC | Pasos | Resultado esperado |
| --- | --- | --- |
| RN-01 | Abrir tabla con 1 pestaña, 2 columnas y 2 filas; comprobar orden de iconos | Columna: nombre·lápiz·revisar·eliminar; fila: nombre·lápiz·revisar; pestaña: label·lápiz·X; tarjeta: lápiz·eliminar |
| RN-02 | Clic en lápiz de columna | Input con foco, texto seleccionado, `maxLength=100`, sin abrir revisión |
| RN-03 | Editar columna + Enter | `PATCH /columns/<id>/` 200, texto y toast, sin recargar |
| RN-04 | Editar fila + clic fuera | `PATCH /rows/<id>/` 200, texto y toast |
| RN-05 | Editar pestaña inactiva + Enter | `PATCH /tabs/<id>/` con `name` y `label`, pestaña activa sin cambios |
| RN-06 | Editar tabla + Enter | `PATCH /tables/<id>/` 200, sin navegar a `/table/<id>` |
| RN-07 | Escape tras escribir | 0 peticiones; nombre original |
| RN-08 | Vaciar y Enter / abrir y Enter sin cambios | 0 peticiones; nombre original |
| RN-09 | Enter y clic fuera inmediato | Exactamente 1 `PATCH` |
| RN-10 | Renombrar tabla a un nombre existente | 400, un toast, input abierto y enfocado |
| RN-11 | Renombrar pestaña/columna a un nombre existente | 400 con mensaje de unicidad, input abierto |
| RN-12 | Token inválido + Enter | 401, modal «Tu sesión expiró», 0 toasts |
| RN-13 | Usuario con `view` sin `change` + Enter | 403, toast de permisos, input abierto, sin navegar |
| RN-14 | Renombrar fila/columna y reabrir revisión | El overlay muestra el nombre nuevo |
| RN-15 | Regresión | Revisión de fila/columna, búsqueda, edición de celda y persistencia siguen funcionando |
| RN-16 | Regresión backend | `PATCH` 200 en tab/column/row; `PUT` sigue funcionando; duplicados 400 |

---

## 11. Riesgos residuales y priorización

1. **R-01 (Alto, preexistente):** IDOR de lectura de filas/celdas por permisos globales en `RowViewSet`. Abrir ticket aparte; no mezclar con este cambio.
2. **B-03 (Alto, preexistente):** re-parentado de filas/columnas/pestañas sin permiso sobre el destino vía `PUT`/`PATCH`. Abordar junto con R-01 en un ticket de seguridad.
3. **O-01/O-02/O-03 (Informativo):** idioma de los mensajes del servidor, semántica del lápiz de pestaña (`span` dentro de `<button>`) y `aria-label` obsoleto mientras se edita.
4. **Riesgo operativo bajo:** el fix de H-01 vive en `backend/api/urls.py`; cualquier despliegue debe reconstruir la imagen de Django (no hay bind mount ni `--reload`). Documentado en `docs/ops/2026-11-05-patch-detalle-restart-django.md`.

**Prioridad recomendada:** commit del renombrado (H-01, B-01 y B-02 cerrados; frontend y backend verificados). R-01 y B-03 en paralelo, como trabajo de seguridad independiente.
