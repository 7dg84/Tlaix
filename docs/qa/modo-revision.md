# QA: modo revisión (fila / columna)

- **Fecha:** 2026-10-23
- **Alcance:** overlay fullscreen de revisión por fila y por columna, atajos de teclado por tipo y endpoints de lectura `cellvalues`.
- **Entorno de verificación:** Docker Compose (`tlaix-django-1`, `tlaix-react-1`, `tlaix-db-1` PostgreSQL 15) + navegador de escritorio.
- **Plan:** `docs/plans/2026-10-23-modo-revision.md`
- **Contrato de API:** `docs/api/review-cellvalues.md` (fuente canónica: `SYSTEM_API_SPECIFICATION.md` §4.4 y §4.5)
- **Implementación:**
  - Backend: `backend/api/views.py` (`RowCellValuesView` L831, `ColumnCellValuesView` L904), `backend/api/urls.py` L26-29.
  - Frontend: `frontend/src/components/ReviewMode.tsx`, `frontend/src/lib/review.ts`, `frontend/src/api/review.ts`, `frontend/src/pages/TableView.tsx` (L552 y L586 iconos; L654-664 overlay).
  - Tests: `backend/api/tests.py` L1033 y L1306; `frontend/src/lib/review.test.ts`.

## 1. Resumen

El modo revisión está **implementado y verificado**. No se detectaron bloqueantes ni hallazgos de seguridad en el alcance revisado.

| Capa | Estado | Evidencia |
| --- | --- | --- |
| Backend (`cellvalues` fila/columna) | OK | 24 tests específicos; suite completa `Ran 92 tests … OK` |
| Frontend (lógica pura) | OK | `30 passed` en Vitest |
| Frontend (build) | OK | `npm run build` → `built in 12.78s` |
| E2E manual (navegador) | OK | Matriz de la sección 6 (dataset 60 filas × 6 columnas) |
| Tipado estricto | Deuda preexistente | `npx tsc --noEmit -p tsconfig.app.json` → 5 errores ajenos al modo revisión |

## 2. Requisitos y cómo se verifican

Criterios tomados del plan (sección «Criterios de aceptación»). La columna «Verificación» indica el método real usado: **E2E** (navegador, §6), **unit** (Vitest, §7.2), **API** (tests de Django, §4) o **código** (lectura estática, sin ejecución).

| # | Requisito | Verificación | Evidencia |
| --- | --- | --- | --- |
| R1 | Icono de revisión por columna, a la izquierda de la `X`, alineado a la derecha; la columna «Acciones» no lo muestra | código + E2E | `TableView.tsx` L547-571 (grupo `flex items-center gap-1`), L572 (`Acciones` sin botón) |
| R2 | Overlay a pantalla completa, bloquea el scroll de fondo, cierra con `Esc` y con la `X` | código + E2E | `ReviewMode.tsx` L1051-1060 (portal a `body`, `fixed inset-0`), L211-212 (`body.overflow = hidden`), L695-706 y L1090-1098 |
| R3 | Modo columna recorre **todas** las filas, aunque la tabla solo tenga 50 cargadas | API + E2E | `ColumnCellValuesView` (sin paginación, L925); E2E «Estado: 60 items» |
| R4 | Modo fila recorre todas las columnas de datos de la fila | API + E2E | `RowCellValuesView` L875-893; E2E «Fila 01: 6 columnas» |
| R5 | Cabecera con el elemento fijo, el contexto del cruce y progreso `n / total` correcto | código + E2E | `ReviewMode.tsx` L740-743, L1004-1010 (contexto), L1082-1089 (`aria-live="polite"`) |
| R6 | Foco automático al abrir y tras cada navegación | código + E2E | `ReviewMode.tsx` L253-292 (`requestAnimationFrame` + `input.select()`); E2E `selectionStart 0 / selectionEnd len` |
| R7 | Texto/número/fecha: `Enter` guarda y avanza; `←`/`→` guardan solo si cambió | E2E + unit | `commitValue` L398 (`isSameCellValue`); unit `isSameCellValue`; E2E «flechas sin cambio no hacen PUT» |
| R8 | Checkbox: `Espacio` alterna; `0`/`f` → `false`; `1`/`t` → `true`; guarda solo si cambió | E2E + código | `handleCheckboxKey` L531-566; E2E «Espacio alterna sin PUT» |
| R9 | Lista: opciones numeradas, número + `Enter` selecciona, letras filtran sin acentos, `↑`/`↓` resaltan | E2E + unit | `handleSelectKey` L568-647; `filterOptions`/`parseOptionNumber`; E2E «12 opciones numeradas», «rech → Rechazado», «buffer 12 → Finalizado» |
| R10 | Endpoints 200 con todos los ítems y 401/403/404 correctos; suite backend completa | API | Sección 4 (24 tests); `Ran 92 tests … OK` |
| R11 | Fallo de guardado no avanza, no pierde el valor, permite reintentar | E2E + código | `commitValue` L415-427, panel L1021-1043, `handleRetry` L477-491; E2E 502 y 403 |
| R12 | Al cerrar, la tabla muestra lo guardado y conserva su paginación | código + E2E | `TableView.tsx` `saveCell` L393-417 (optimista + reversión); `ReviewMode` no toca estado de paginación |
| R13 | Sin regresiones en edición inline, alta/baja de filas, columnas o pestañas | API + E2E | Suite backend completa (92 tests) y smoke E2E de la tabla |
| R14 | `npx tsc --noEmit` y `npm run build` pasan | comando | Build OK; **`tsc --noEmit` es un no-op** (ver §8) |

## 3. Datos de prueba E2E

Dataset **temporal** (creado para la verificación y eliminado después; no forma parte del repo ni de la BD compartida):

| Elemento | Detalle |
| --- | --- |
| Tabla | 1 tabla, 1 pestaña |
| Filas | 60 (`Fila 01` … `Fila 60`) — más de un bloque de 50 para probar R3 |
| Columnas | 6: `Texto` (`text`), `Entero` (`int`), `Decimal` (`float`), `Hecho` (`checkbox`), `Estado` (`select` con 12 opciones), `Fecha` (`date`) |
| Opciones de `Estado` | 12, entre ellas `Rechazado` (posición 10) y `Finalizado` (posición 12) |
| Usuario | Autenticado con `view_table` + `view_tab` y permiso de edición de celdas |

> Los nombres de las opciones y los valores concretos son irrelevantes para la matriz; lo relevante es el **tipo** de columna y el número de opciones (12 > 9, para forzar el buffer multi-dígito).

## 4. Matriz de endpoints

### 4.1 `GET /api/tables/<table_id>/rows/<pk>/cellvalues/?tab_id=<opcional>`

| Caso | Esperado | Test |
| --- | --- | --- |
| Fila con los 6 tipos | 200; un ítem por columna con `type`, `options`, `order`, `is_required`, `value` | `test_returns_all_columns_with_values_for_every_type` |
| Payload de `target` y `tab` | 200; `target` = `{id, name, order}` y `tab` = `{id, name, label}` | `test_target_and_tab_payload` |
| Celda inexistente | 200; `value: null` y el ítem **no** se omite | `test_missing_cells_are_null` |
| `order` empatado | 200; orden `order, id` estable entre peticiones | `test_items_are_ordered_by_order_then_id_with_ties` |
| Nº de consultas | No escala con el número de columnas (una consulta de celdas + `select_related`) | `test_does_not_scale_queries_with_column_count` |
| `?tab_id=` explícito | 200; solo columnas de esa pestaña | `test_explicit_tab_id_returns_only_that_tab_columns` |
| Sin `tab_id` | 200; usa la primera pestaña por `order, id` | `test_defaults_to_first_tab_by_order` |
| Tabla sin pestañas | 200; `tab: null`, `items: []`, `total: 0` | `test_table_without_tabs_returns_empty_payload` |
| `tab_id` de otra tabla | 404 | `test_tab_from_another_table_returns_404` |
| Fila de otra tabla | 404 | `test_row_from_another_table_returns_404` |
| Tabla inexistente | 404 | `test_table_not_found_returns_404` |
| Sin autenticación | 401 | `test_anonymous_returns_401` |
| Autenticado sin permisos | 403 | `test_user_without_permissions_returns_403` |
| Permiso de tabla pero no de pestaña | 403 | `test_user_with_table_permission_but_without_tab_permission_returns_403` |
| Auth por cabecera `Token` y por cookie `auth_token` | 200 en ambos casos | `test_authenticates_with_token_header_and_auth_cookie` |

### 4.2 `GET /api/tables/<table_id>/columns/<pk>/cellvalues/`

| Caso | Esperado | Test |
| --- | --- | --- |
| Todas las filas, sin paginación | 200; `total` = nº de filas de la tabla (60 en el dataset), no 50 | `test_returns_every_row_without_pagination` |
| Metadatos de la columna | 200; `target` con `type`, `options`, `order`, `is_required`, `tab_id` | `test_target_contains_column_metadata` |
| Valores y celdas vacías | 200; `value` coincide con la celda y `null` si no existe | `test_values_match_cells_and_missing_cells_are_null` |
| `order` empatado | 200; orden `order, created_at, id` estable | `test_rows_are_ordered_deterministically_when_order_ties` |
| Nº de consultas | No escala con el número de filas (una consulta de celdas) | `test_does_not_scale_queries_with_row_count` |
| Columna de otra tabla | 404 | `test_column_from_another_table_returns_404` |
| Sin autenticación | 401 | `test_anonymous_returns_401` |
| Autenticado sin permisos | 403 | `test_user_without_permissions_returns_403` |
| Permiso de tabla pero no de pestaña | 403 | `test_user_with_table_permission_but_without_tab_permission_returns_403` |

### 4.3 Casos del contrato sin test dedicado

Verificados por lectura del código (`APIView` + `get_object_or_404`), **no** por test automático:

| Caso | Comportamiento esperado | Dónde se resuelve |
| --- | --- | --- |
| Tabla inexistente en la ruta de **columna** | 404 | `views.py` L916 (`get_object_or_404(Table, …)`) |
| Método distinto de `GET` | 405 | `APIView` sin `post`/`put`/`delete` |

> No se observó ningún caso en que el backend devuelva 200 con un mensaje de permiso: cuando la UI muestra «No tienes permiso…», el status real es **403**, y sin sesión **401**.

## 5. Matriz tipo × teclas

Leyenda: **E2E** = comprobado en navegador; **unit** = cubierto por Vitest; **código** = verificado leyendo el handler (sin ejecución dedicada). `—` = la tecla no se intercepta (comportamiento nativo del control o sin efecto).

| Tecla | `text` | `int` | `float` | `date` | `checkbox` | `select` (lista) |
| --- | --- | --- | --- | --- | --- | --- |
| `Enter` | Guarda y avanza (E2E) | Guarda y avanza; `1.5` → error, sin PUT (E2E) | Guarda y avanza (E2E) | Guarda y avanza (E2E) | Guarda y avanza solo si cambió (E2E) | Elige resaltado/buffer, guarda y avanza (E2E) |
| `←` / `→` | Guarda solo si cambió y navega (E2E) | Igual (E2E) | Igual (E2E) | Igual (E2E) | Igual (E2E) | Igual (E2E) |
| `Esc` | Guarda pendiente y cierra (E2E) | Igual | Igual | Igual | Igual (E2E) | 1.º limpia filtro/buffer; 2.º guarda y cierra (código L695-706) |
| `Espacio` | Escribe espacio | — | — | — | Alterna el valor local, **sin** PUT (E2E) | — |
| `0` / `1` | — | — | — | — | `false` / `true`, sin PUT hasta guardar (E2E) | — |
| `t` / `f` | — | — | — | — | `true` / `false` (E2E) | — |
| `1..N` + `Enter` | — | — | — | — | — | Selecciona por número; buffer multi-dígito (E2E: `12` → Finalizado) |
| Número fuera de rango | — | — | — | — | — | `99` → «Opción 99 no válida», sin guardar ni avanzar (E2E) |
| Letras | Escribe | — | — | — | — | Filtra por subcadena normalizada (E2E `rech` → Rechazado; unit `filterOptions`) |
| `↑` / `↓` | — | — | — | — | — | Mueve el resaltado en la lista filtrada (código L609-619) |
| `Backspace` | Borra carácter | Borra carácter | Borra carácter | — | — | Borra el último dígito del buffer (código L621-626) |
| `Tab` / `Shift+Tab` | Trampa de foco dentro del overlay (código L506-529) | Igual | Igual | Igual | Igual | Igual |
| `Alt+←` / `Alt+→` | Se anula el atajo de historial del navegador; no navega el historial (E2E) | Igual | Igual | Igual | Igual | Igual |
| `Ctrl+←` / `Ctrl+→` | Movimiento de cursor por palabra (nativo; `ctrlKey` se ignora, código L651) | Igual | Igual | — | — | — |
| `Shift+←` / `Shift+→` | Selección nativa de texto (código L719-725) | Igual | Igual | Igual | Igual | Selección del filtro (código L569-575) |

### 5.1 Validación por tipo (sin PUT cuando el valor no es válido)

| Tipo | Entrada | Resultado | Evidencia |
| --- | --- | --- | --- |
| `int` | `1.5` | Error «El valor debe ser un número entero.»; no hay PUT ni avance | E2E + `ReviewMode.tsx` L381-386 |
| `int` | `5` | PUT 200 y avance | E2E |
| `float` | `2.5` | PUT 200 | E2E + unit `draftToValue("float", "2.5")` |
| `float` | texto no numérico | `Number(...)` → `NaN`; error «El valor debe ser un número.» | código L387-396 |
| `date` | `2026-10-15` | PUT 200 y avance | E2E |
| `checkbox` | alternar sin `Enter`/flecha | Solo estado local; no hay PUT | E2E |
| `select` | opción inexistente | «Opción N no válida»; no hay PUT | E2E |
| `text` | vacío | `""`; se considera igual a `null` (no PUT si no cambió) | unit `isSameCellValue("text", "", null)` |

## 6. Evidencia E2E (navegador)

Dataset de la sección 3, backend y frontend en Docker. Resultados observados:

### 6.1 Columna `Estado` (`select`, 12 opciones)

| Acción | Resultado |
| --- | --- |
| Abrir «Revisar columna Estado» | Carga **60 items** (no 50); 12 opciones numeradas `1..12` |
| Escribir `rech` | Filtra a `Rechazado` |
| `Enter` | `PUT … 200` y avanza al siguiente ítem |
| Escribir `12` + `Enter` | Selecciona `Finalizado` (buffer multi-dígito) y avanza |
| Escribir `99` + `Enter` | «Opción 99 no válida»; no guarda ni avanza |
| `←` / `→` sin cambiar el valor | No se emite `PUT`; solo navega |
| `Alt+←` | No navega el historial del navegador |

### 6.2 Checkbox `Hecho`

| Acción | Resultado |
| --- | --- |
| `Espacio` | Alterna el valor local; **sin** `PUT` |
| `Enter` o `→` | Guarda **solo si cambió** y avanza |
| `1` / `t` | Valor `true` |
| `0` / `f` | Valor `false` |

### 6.3 Texto / Entero / Decimal / Fecha

| Acción | Resultado |
| --- | --- |
| Editar + `Enter` | Guarda y avanza |
| `Entero` con `1.5` | Error «El valor debe ser un número entero.»; sin `PUT` |
| `Entero` con `5` | `PUT … 200` |
| `Decimal`, `Fecha`, `Texto` | Guardan y avanzan |

### 6.4 Modo fila

| Acción | Resultado |
| --- | --- |
| Abrir «Revisar fila Fila 01» | Recorre las 6 columnas con su tipo correcto |
| Terminar el último ítem | Muestra «Revisión completada» |

### 6.5 Errores y cierre

| Escenario | Acción | Resultado |
| --- | --- | --- |
| Fallo de red / backend caído (`502`) | `Enter` | Panel de error inline; el valor se revierte; no avanza |
| Reintento | «Reintentar» con el backend arriba | `PUT … 200` y avance |
| Permiso retirado (`403`) | `Enter` | Mensaje «No tienes permiso para modificar esta celda.» |
| Salida tras el error | «Salir sin guardar» | Cierra el overlay sin persistir |
| Cambio pendiente + `X` | Clic en la `X` | `PUT … 200` y cierra |

### 6.6 Persistencia y foco

| Comprobación | Resultado |
| --- | --- |
| Recargar la tabla tras editar los 6 tipos | Los valores persisten en los 6 tipos |
| Foco al abrir y tras navegar | Foco en el editor del ítem actual |
| Selección del texto | `selectionStart = 0`, `selectionEnd = longitud` (escribir reemplaza) |

> Los códigos `502` y `403` se provocaron deteniendo el contenedor de Django y retirando el permiso, respectivamente. No se usaron datos reales de otros usuarios.

## 7. Automatización y comandos

Ejecutados el 2026-10-23 en el entorno local:

```bash
# Backend (suite completa, incluye 24 tests de cellvalues)
docker exec tlaix-django-1 python manage.py test api
# → Ran 92 tests in 112.710s / OK
```

```bash
# Frontend: lógica pura del modo revisión
cd frontend
npm test
# → src/lib/review.test.ts (30 tests) 30 passed
```

```bash
# Build de producción
cd frontend
npm run build
# → ✓ built in 12.78s (1798 modules)
```

```bash
# Chequeo de tipos "de fachada" (no-op)
cd frontend
npx tsc --noEmit
# → exit 0, sin comprobar nada
```

```bash
# Chequeo de tipos real
cd frontend
npx tsc --noEmit -p tsconfig.app.json
# → 5 errores preexistentes (ver §8)
```

### 7.1 Cobertura de los tests del backend

| Clase | Tests | Qué cubre |
| --- | --- | --- |
| `RowCellValuesViewTestCase` (`tests.py` L1033) | 15 | Tipos, payload, celdas nulas, orden, consultas, `tab_id`, tabla sin pestañas, 404/401/403, auth por cookie y cabecera |
| `ColumnCellValuesViewTestCase` (`tests.py` L1306) | 9 | Todas las filas, metadatos, valores, orden, consultas, 404/401/403 |
| Resto de la suite | 68 | Permisos de tablas/tabs/columnas, fecha, carga masiva, paginación y orden de `TabView` (regresión) |

### 7.2 Cobertura de los tests del frontend

`frontend/src/lib/review.test.ts` — 30 tests:

| Bloque | Tests |
| --- | --- |
| `normalizeText` | 2 |
| `filterOptions` | 5 |
| `buildRowReviewItems` | 2 |
| `buildColumnReviewItems` | 1 |
| `isSameValue` | 6 |
| `isSameCellValue` | 4 |
| `parseOptionNumber` | 2 |
| `valueToDraft` | 2 |
| `draftToValue` | 6 |

## 8. Limitaciones conocidas

1. **Reducer de teclado dentro del componente (deuda técnica).** El plan preveía `reduceReviewKey` en `frontend/src/lib/review.ts`; la implementación final mantiene `handleKeyDown`, `handleSelectKey` y `handleCheckboxKey` dentro de `ReviewMode.tsx` (L506-735). Consecuencia: la lógica de teclado **no** tiene tests unitarios; solo está cubierta por E2E. Debe extraerse a `lib/review.ts` en una tarea posterior de `frontend`/`test-writer`.
2. **`npx tsc --noEmit` es un no-op.** `frontend/tsconfig.json` declara `"files": []` y solo `references`, por lo que el comando termina con exit 0 sin comprobar ningún archivo. Cualquier verificación de tipos debe usar `npx tsc --noEmit -p tsconfig.app.json`.
3. **5 errores de tipos preexistentes**, ajenos al modo revisión:
   - `frontend/src/components/Header.tsx` L34 — `TS1345` (expresión `void` evaluada como booleana).
   - `frontend/src/context/AuthContext.tsx` L152 (×3) — `TS2322` (tipos de las mutaciones de auth incompatibles con `data: []`).
   - `frontend/src/pages/Login.tsx` L19 — `TS1345`.
   - Consecuencia: el criterio R14 del plan («`npx tsc --noEmit` pasa») **no es verificable** tal como está redactado; el build sí pasa porque Vite no type-checkea. Responsable de la corrección: `frontend` (fuera del alcance de este cambio).
4. **Sin tests de componente.** No hay tests de `ReviewMode.tsx` (render, foco, teclado, portal). Vitest solo cubre `lib/review.ts`; la verificación del componente es E2E manual. Sugerido para `test-writer` (ver §9).
5. **E2E no automatizado.** La evidencia de la sección 6 se obtuvo manualmente sobre un dataset temporal ya eliminado; no es reproducible sin recrear los datos. No se incluyen capturas para no exponer datos de sesión.
6. **Sin paginación en el endpoint de columna (por diseño).** En tablas muy grandes el payload crece linealmente. El contrato lo documenta y lo deja para una segunda fase (`docs/api/review-cellvalues.md` §Rendimiento).
7. **Filas no asociadas a pestaña.** El eje de columna devuelve las filas de toda la tabla, igual que `TabView`; es un comportamiento preexistente y está fuera de alcance.

## 9. Casos de prueba sugeridos (pendientes)

Para `test-writer` / `frontend`:

1. **Unit — reducer de teclado** (tras extraerlo): `Enter` guarda y avanza; `←`/`→` solo hacen `PUT` si cambió; `Alt+←` no navega; `Shift+←` no intercepta.
2. **Unit — selección con filtro:** dígitos limpian el filtro; `Enter` con buffer fuera de rango no guarda; `Esc` con filtro limpia y el segundo `Esc` cierra.
3. **Componente (RTL) — `ReviewMode`:**
   - carga inicial: spinner → primer ítem con foco y texto seleccionado;
   - error de carga 403 → mensaje y botón «Cerrar»;
   - error de guardado 500 → panel inline, valor revertido, «Reintentar» reemite el `PUT`;
   - `X` con cambio pendiente → `PUT` antes de `onClose`;
   - `role="dialog"`, `aria-modal`, `aria-labelledby` y foco atrapado con `Tab`.
4. **Componente — abort al cerrar:** cerrar durante la carga no debe producir `setState` ni toast de error.
5. **E2E automatizado (opcional):** tabla semilla de 60 filas × 6 columnas con un script de seed, para que la evidencia sea reproducible.

## 10. Riesgos residuales

| Riesgo | Nivel | Mitigación actual |
| --- | --- | --- |
| Regresión del teclado sin tests unitarios | Medio | E2E manual; extracción del reducer pendiente |
| Tipado no verificado por CI (`tsc` no-op) | Medio | Usar `-p tsconfig.app.json` en CI; 5 errores preexistentes por corregir |
| Payload grande en tablas de muchas filas | Bajo | Payload ligero y una sola consulta; paginación por cursor evaluada a futuro |
| Dependencia de `onSave` que lance el error | Bajo | `TableView.saveCell` revierte y relanza (L406-416); `updateCellValue` conserva el comportamiento previo para la edición inline |
| Diferencias de comportamiento entre `date` nativo y el resto | Bajo | Flechas navegan; edición por selector nativo o dígitos; documentado en las pistas del pie |
