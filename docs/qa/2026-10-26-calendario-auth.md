# QA: icono de calendario en «Nombre de la Columna» + redirección global por 401

- **Fecha:** 2026-10-26
- **Alcance:**
  1. Atajo de fecha en el diálogo **Agregar Nueva Columna** (`AddColumnDialog`), con ciclo fecha completa → día → mes (número) → mes (nombre) → año.
  2. Redirección global al login ante cualquier **401** de un endpoint autenticado, conservando la ruta solicitada y recargándola tras autenticarse.
- **Plan:** `docs/plans/2026-10-26-calendario-columnas-auth-401.md`
- **Contrato de API:** sin cambios. Se reutilizan `GET /api/user/`, `POST /api/user/login/`, `POST /api/user/logout/`, `GET /api/tables/`, `POST /api/tables/<table_id>/columns/` y el resto de endpoints existentes.
- **Implementación:**
  - Frontend: `frontend/src/lib/date-name.ts` (nuevo), `frontend/src/lib/auth.ts` (nuevo), `frontend/src/components/ProtectedRoute.tsx` (nuevo), `frontend/src/components/AddColumnDialog.tsx`, `frontend/src/pages/TableView.tsx`, `frontend/src/pages/Index.tsx`, `frontend/src/api/api-client.ts`, `frontend/src/api/manageErrors.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/Login.tsx`, `frontend/src/components/Header.tsx`.
  - Backend: **sin cambios**.
  - Tests unitarios de las utilidades nuevas: `frontend/src/lib/date-name.test.ts` (21) y `frontend/src/lib/auth.test.ts` (38), 59 tests que pasan en Node sin jsdom.

## 1. Resumen

| Capa | Estado | Evidencia |
| --- | --- | --- |
| Tipado (`tsc -p tsconfig.app.json`) | OK | 0 errores (los 5 preexistentes de `AuthContext`, `Login` y `Header` quedaron corregidos) |
| Tests frontend (`npm test`) | OK | 89 passed (30 previos + 59 nuevos), 3 archivos |
| Build de producción | OK | `npm run build` → `built in 9.49s` |
| Lógica pura (formatos y saneado) | OK | Comprobación con esbuild + Node: los 5 formatos, `sanitizeReturnTo`, `buildLoginPath`, `isAuthEndpoint`, `shouldRedirectToLogin` y `buildReturnTo` devuelven lo esperado |
| Interceptor fuera del navegador | OK | Bundle real ejecutado en Node sin `window`: el 401 se propaga intacto (sin `ReferenceError`); con `window` simulado, 4 × 401 concurrentes ⇒ **una** navegación |
| E2E en navegador | OK | Ejecutado con Docker + navegador real; evidencia en §10 |

## 2. Rutas y pantallas afectadas

| Ruta / pantalla | Cambio visible |
| --- | --- |
| `/login` | Aviso «Tu sesión expiró. Inicia sesión de nuevo.» con `?expired=1`; tras autenticarse recarga `returnTo`; si ya hay sesión redirige sin mostrar el formulario |
| `/` (Index) | Ruta protegida: sin cookie redirige a `/login?returnTo=%2F`; los 401 no generan toasts duplicados |
| `/table/:tableId` | Ruta protegida; los 401 de cualquier consulta o guardado redirigen al login conservando la ruta |
| Modo revisión (overlay dentro de `/table/:tableId`) | Un 401 al guardar no emite toasts propios: el interceptor redirige y el overlay se cierra para no bloquear la navegación |
| Diálogo **Agregar Nueva Columna** (dentro de `/table/:tableId`) | Icono `CalendarDays` junto a `Nombre de la Columna *`; aviso inline de nombre duplicado; el diálogo permanece abierto si la API falla; el nombre se limita a 100 caracteres |
| Cabecera (**Cerrar Sesión**) | Si la API confirma (o responde 401), limpia el estado local y recarga `/login`; si falla por otro motivo, **no** navega y muestra el error |

## 3. Datos de prueba (solo entorno local)

> No hay credenciales de desarrollo fijas en el repositorio. **No usar credenciales reales en este documento ni en capturas.**

1. Crear un usuario local con email (el login busca por `email`, no por `username`):
   ```bash
   docker compose exec django python manage.py createsuperuser
   ```
   Introducir un email de prueba local (por ejemplo `qa@localhost`) y una contraseña de desarrollo.
2. Tener al menos una tabla con una pestaña y una columna, para poder abrir **Agregar Columna**.
3. Para el caso de duplicado: crear primero una columna llamada con la fecha del día (por ejemplo `2026-10-26`) y repetir el nombre.

## 4. Matriz de pruebas — icono de calendario

| # | Paso | Resultado esperado |
| --- | --- | --- |
| C1 | Abrir una tabla → **Agregar Columna** | El foco inicial está en el campo de nombre; el icono de calendario aparece junto a la etiqueta |
| C2 | 1.er clic en el icono | El campo muestra la fecha local `YYYY-MM-DD` (p. ej. `2026-10-26`) y conserva el foco con el caret al final |
| C3 | 2.º clic | Día con dos dígitos (`26`) |
| C4 | 3.er clic | Mes numérico (`10`) |
| C5 | 4.º clic | Mes en nombre en español (`octubre`) |
| C6 | 5.º clic | Año (`2026`) |
| C7 | 6.º clic | Vuelve a la fecha completa (`2026-10-26`) |
| C8 | Editar el nombre a mano y volver a pulsar el icono | El ciclo se reinicia: escribe la fecha completa |
| C9 | Cerrar (Cancelar, `Esc` o clic fuera) y reabrir | El ciclo vuelve a empezar por la fecha completa |
| C10 | Elegir cualquier tipo de columna (texto, checkbox, entero, decimal, lista, fecha) | El icono sigue visible y funciona igual |
| C11 | Pulsar el icono | No se envía el formulario ni se crea la columna (el botón es `type="button"`) |
| C12 | Usar un nombre ya existente en la pestaña | Aviso inline «Ya existe una columna llamada … en esta pestaña»; el envío no se bloquea |
| C13 | Enviar un duplicado | El backend responde 400, el diálogo **permanece abierto** y no se muestra un falso éxito |
| C14 | Crear una columna con nombre válido | Toast de éxito **único** («Columna creada correctamente», en `TableView`), el diálogo se cierra y el ciclo se reinicia |
| C15 | Revisar la cabecera de la tabla y las celdas | Sin cambios: el icono no aparece en la cabecera ni rellena celdas |
| C16 | Con `title`/`aria-label` del icono | Anuncia el **próximo** valor, p. ej. «Rellenar mes en nombre (octubre)» |
| C17 | Pegar un nombre de más de 100 caracteres | El input se detiene en 100 (no se envía al backend un valor que supere `max_length`)

## 5. Matriz de pruebas — sesión expirada y 401

| # | Paso | Resultado esperado |
| --- | --- | --- |
| A1 | Con sesión válida, invalidar la cookie desde la página (`POST /api/user/logout/` en consola/DevTools) y editar una celda o cambiar de pestaña | Redirección inmediata a `/login?returnTo=<ruta>&expired=1`, sin recargar manualmente |
| A2 | Observar `/login` tras A1 | Aviso visible «Tu sesión expiró. Inicia sesión de nuevo.» |
| A3 | Iniciar sesión tras A1 | Recarga completa de la ruta original (incluye query y hash); la tabla vuelve a consultar y muestra los datos |
| A4 | Entrar directo a `/table/<id>` sin cookie (ventana privada) | Loader breve → `/login?returnTo=%2Ftable%2F<id>`; no se ve una tabla vacía |
| A5 | Entrar directo a `/` sin cookie | Redirección a `/login?returnTo=%2F` |
| A6 | Credenciales inválidas en `/login` | Error en el formulario («Credenciales incorrectas» o «Usuario no encontrado»); **no** hay redirección ni bucle |
| A7 | Email inexistente | Toast «Usuario no encontrado» (404 del backend); sin redirección |
| A8 | Provocar un 403 (permiso retirado) | No redirige; se muestra el error correspondiente |
| A9 | `GET /api/user/` con cookie inválida | 401 esperado; **no** redirige (sonda de sesión excluida) |
| A10 | Cerrar sesión desde la cabecera con la API disponible | Limpia estado y `localStorage`, y recarga `/login` |
| A11 | `POST /api/user/logout/` con cookie ya expirada | 401 excluido del interceptor; se considera logout exitoso (limpia estado y va a `/login`), sin bucle |
| A12 | Abrir `/login?returnTo=https://evil.com` o `//evil.com` | Tras iniciar sesión va a `/`, nunca a un origen externo |
| A13 | Varias peticiones simultáneas que reciben 401 | Una sola redirección (guarda anti-bucle) |
| A14 | Bloquear `**/api/user/logout/` en DevTools y pulsar **Cerrar Sesión** | Toast «No se pudo cerrar la sesión. Inténtalo de nuevo.»; el diálogo se queda abierto y **no** navega a `/login`; la sesión sigue activa |
| A15 | 401 al guardar dentro del modo revisión (cookie revocada) | Redirección inmediata al login; **sin** toasts de 401 del overlay; al volver tras el login se reinicia la revisión (progreso no restaurado, aceptado) |
| A16 | `/login?returnTo=%2Flogin` o `/login/` | Tras iniciar sesión va a `/` (nunca al propio login) |

## 6. Estados y errores esperados

| Situación | UI esperada |
| --- | --- |
| Comprobando sesión (`isAuthReady === false`) | Loader a pantalla completa en rutas protegidas |
| 401 en endpoint autenticado | Redirección inmediata; sin toast de error (la redirección es el aviso) |
| 401 en login/registro/recuperación/logout/`GET /user/` | Sin redirección; el formulario muestra el error |
| 403 | Toast de error del backend; la pantalla no cambia |
| Error de validación al crear columna (400) | Toast con el mensaje real del backend (un solo toast) y diálogo abierto |
| Nombre duplicado | Aviso inline no bloqueante + 400 controlado al enviar (solo el mensaje del backend) |
| Fallo de red al crear columna | Toast de error y diálogo abierto (no se pierde lo escrito) |
| 401 guardando en modo revisión | Redirección global; sin toast de 401 en el overlay; el overlay se cierra |
| Fallo al cerrar sesión (red/500) | Toast «No se pudo cerrar la sesión. Inténtalo de nuevo.»; la UI sigue autenticada y no navega |

## 7. Limitaciones y notas conocidas

- **E2E ejecutado:** la matriz de navegador se validó con Docker Compose y un usuario temporal; resultados en §10. El usuario y la columna de prueba se eliminaron al terminar.
- El login del backend busca por **email**; un superusuario sin email no podrá iniciar sesión desde la SPA.
- `POST /api/user/recover/` está **comentado** en `backend/api/urls.py`; `recoverApi` devolvería 404. Ninguna pantalla usa hoy `recover`, pero conviene confirmarlo con backend antes de exponerlo.
- La recarga tras el login es intencional (`window.location.assign`): se pierde el estado en memoria de la SPA y se reejecutan todas las consultas, tal como pide el requisito.
- El aviso de duplicado compara el nombre **exacto** (distingue mayúsculas y minúsculas); el backend sigue siendo la autoridad final.
- Un 401 durante la creación de una columna mantiene el diálogo abierto, pero la redirección al login recarga la página y se pierde el formulario: comportamiento esperado de una sesión expirada.
- **Modo revisión:** se acepta la redirección dura del interceptor. El progreso de revisión (índice, borrador y avances no guardados) **no se restaura** tras el login; el overlay se cierra para no bloquear la navegación y ya no emite toasts de 401.
- **Logout fallido:** si la API no responde o falla por un motivo distinto de 401, la cookie HTTPOnly sigue viva, por lo que no se limpia el estado ni se navega; el usuario permanece autenticado y ve el error. Un 401 sí se considera cierre exitoso.
- Los logs de error de `login`, `register` y `recover` solo registran el **status** HTTP (o «sin respuesta»), nunca el cuerpo de la petición ni el objeto de error (evita exponer la contraseña).

## 8. Tests unitarios (`vitest`, entorno Node)

Comando: `cd frontend && npm test` (o `npx vitest run src/lib/date-name.test.ts src/lib/auth.test.ts`). No requiere jsdom, Docker ni backend.

### `src/lib/date-name.test.ts` (21 tests)

- `DATE_NAME_SEQUENCE` en orden `full, day, month, monthName, year`.
- `nextDateNameMode`: cadena completa, recorrido de los cinco modos sin saltos y reinicio en `full` ante un modo desconocido.
- `formatDateName` con fechas locales construidas por componentes (nunca `new Date("YYYY-MM-DD")`):
  - `2026-10-26` → `full` `2026-10-26`, `day` `26`, `month` `10`, `monthName` `octubre`, `year` `2026`.
  - `2026-01-05` → `day` `05`, `month` `01`, `monthName` `enero`.
  - `2026-12-31` → `full` `2026-12-31`, `day` `31`, `month` `12`, `monthName` `diciembre`.
  - `23:59:59` y `00:00:01` del 26/10 siguen dando `2026-10-26` (sin desplazamiento UTC).
- `describeDateNameMode`: textos «Rellenar …» con el valor esperado del modo.
- Determinismo comprobado con `TZ=UTC`, `America/Mexico_City`, `Asia/Tokyo` y `Pacific/Kiritimati`.

### `src/lib/auth.test.ts` (38 tests)

- `isAuthEndpoint`: los cinco endpoints de auth, exclusión de `/tables/…`, query y hash ignorados, URLs absolutas, tolerancia de barra final (`/user/login` ≡ `/user/login/`), rechazo de subrutas (`/user/login/extra`, `/user/login/extra/`, `/user/anything/`, `/user/logout/otra-cosa`) y valores vacíos.
- `isAuthError`: 401 y `isAuthRedirect`; 403, 400 y errores sin respuesta no cuentan.
- `sanitizeReturnTo` (origen explícito `https://tlaix.test`): raíz por defecto; conserva ruta + query + hash; rechaza `//`, `///`, otros orígenes, `/\`, `\\`, `javascript:`, `http:evil.com`, userinfo y subdominios parecidos; **`/login` y `/login/` se reducen a `/`**; funciona sin DOM.
- `buildLoginPath`: `returnTo` codificado, `expired=1` opcional y viaje de ida y vuelta con query y hash.
- `shouldRedirectToLogin`: 401 + `/tables/1/` ⇒ `true`; 401 + `/user/login/`, `/user/`, `/user/logout/` y `/user/login` ⇒ `false`; `pathname === "/login"` ⇒ `false`; `alreadyRedirecting: true` ⇒ `false`; 403, 400 y estado ausente ⇒ `false`; sin URL ⇒ `true` (defensivo).
- `buildReturnTo`: concatenación de `pathname` + `search` + `hash`; `/` para `/`, `""` y sin `pathname`; omite `search`/`hash` nulos y conserva solo el hash.

> **Actualizado por `test-writer` (2026-10-26):** los dos casos que reflejaban el contrato anterior ya están ajustados al comportamiento corregido y añadidos los tests de `shouldRedirectToLogin` y `buildReturnTo`. `npx vitest run src/lib/auth.test.ts src/lib/date-name.test.ts` ⇒ **59 passed**; `npm test` ⇒ **89 passed**; `tsc -p tsconfig.app.json` ⇒ 0 errores.

### Comportamientos observados (no son defectos)

- `isAuthEndpoint("/user/login")` **sí** se considera endpoint de auth: `normalizeUrl` quita las barras finales y la comparación es contra rutas normalizadas. Las subrutas (`/user/login/extra`) siguen fuera.
- `sanitizeReturnTo("/login")` devuelve `/` para evitar bucles de reautenticación.
- `sanitizeReturnTo("https:/evil.com")` devuelve `/evil.com`: el navegador lo resuelve como ruta del mismo origen, no como host externo; no es un open redirect.
- `isAuthEndpoint` con una URL absoluta que incluya el prefijo `/api` devuelve `false`; axios conserva `config.url` relativo y aplica `baseURL: '/api/'`, por lo que no ocurre en la práctica.

## 9. Auditoría QA (2026-10-26)

- **Informe completo:** `docs/reports/2026-10-26-auditoria-calendario-auth-401.md`
- **Veredicto:** APTO CON OBSERVACIONES (sin hallazgos Críticos ni Altos).
- **Verificado por QA:** `npm test` (89 passed tras actualizar los tests unitarios), `tsc -p tsconfig.app.json` (0 errores), `npm run build` (OK) y sondas del interceptor real: 4 × 401 concurrentes ⇒ **una** navegación a `/login?returnTo=…&expired=1`; `/user/` y `/user/login/` no redirigen; `pathname=/login` no redirige; 403 no redirige; guarda anti-bucle efectiva.

### Hallazgos detectados (estado original; ver correcciones abajo)

| ID | Severidad | Resumen | Caso de prueba a añadir |
| --- | --- | --- | --- |
| M-1 | Medio | Un 401 al guardar dentro del **modo revisión** dispara la recarga global antes de que `ReviewMode` muestre su panel de reintento: se pierde el progreso de revisión y se duplican avisos de 401. | Abrir modo revisión, revocar la cookie, avanzar un ítem ⇒ documentar el comportamiento aceptado (recarga + pérdida de progreso) o corregirlo. |
| B-1 | Bajo | Si `POST /user/logout/` falla, la cookie sigue viva: `/login` detecta sesión válida y devuelve al usuario a `/`, sin poder cerrar sesión. | Bloquear `**/api/user/logout/` en DevTools ⇒ «Cerrar Sesión» no debe rebotar. |
| B-4 | Bajo | `console.error(err)` en `AuthContext` imprime `config.data` con la contraseña en claro al fallar el login. | Revisar la consola tras un login fallido: no debe contener la contraseña. |
| M-2 | Medio (cobertura) | La decisión de redirección del interceptor y la guarda anti-bucle no tienen test automatizado. | Extraer `shouldRedirectToLogin`/`buildReturnTo` a `lib/auth.ts` y cubrirlas en `auth.test.ts`. |

### Correcciones aplicadas (2026-10-26)

| ID | Estado | Cambio |
| --- | --- | --- |
| M-1 | **Corregido** | `ReviewMode` importa `isAuthError`: el `catch` de `commitValue` ya no emite toast en 401 y `handleClose` cierra el overlay sin el toast «Tu sesión expiró». Se acepta la redirección dura y la pérdida de progreso (documentada en §7) |
| M-2 | **Corregido (código + tests)** | Nuevas funciones puras `shouldRedirectToLogin({ status, url, pathname, alreadyRedirecting })` y `buildReturnTo({ pathname, search, hash })` en `lib/auth.ts`; el interceptor las usa. Cubiertas en `auth.test.ts` |
| B-1 | **Corregido** | `logout(): Promise<boolean>`; si falla con un error distinto de 401 muestra «No se pudo cerrar la sesión. Inténtalo de nuevo.», registra solo el status y devuelve `false` sin limpiar estado. Un 401 se considera cierre exitoso. `Header` solo navega si `true` |
| B-2 | **Corregido** | Guarda `hasWindow = typeof window !== "undefined"` en la condición y antes de `window.location`; fuera del navegador el 401 se propaga sin `ReferenceError` (verificado con el bundle real en Node) |
| B-3 | **Corregido** | `TableView.handleAddColumn` ya no añade un toast genérico tras `manageError`: se muestra solo el mensaje real del backend o el de red |
| B-4 | **Corregido** | `login`, `register` y `recover` registran únicamente `status` (o «sin respuesta»), nunca el cuerpo ni el objeto de error |
| B-6 | **Corregido** | `Login` usa `redirecting`: tras el login exitoso se marca y se hace `window.location.assign(returnTo)`; `<Navigate>` solo se renderiza si `isAuthReady && isLoggedIn && !redirecting` |
| I-1 | **Corregido** | `isAuthEndpoint` tolera la ausencia de barra final (`/user/login`) sin aceptar subrutas (`/user/login/extra`) |
| I-4 | **Corregido** | `AddColumnDialog` limita el nombre a `maxLength={100}` |
| Robustez | **Corregido** | `sanitizeReturnTo("/login")` y `sanitizeReturnTo("/login/")` devuelven `/` |
| B-5 | **Corregido** | `TODO.md` y el estado del plan actualizados por el orquestador |
| I-2, I-3, I-5, I-6 | Pendiente / fuera de alcance | Guarda anti-bucle entre recargas, doble `new Date()` por render, toasts de shadcn sin uso y ruido de éxito al cargar pestañas |

## 10. Evidencia E2E (2026-10-26)

Entorno: Docker Compose local (`http://localhost`), imagen `react` reconstruida con `--no-cache`, usuario temporal `e2e_calendar_20261026` y tabla existente `Test` (pestaña `General`).

| # | Caso | Resultado observado |
| --- | --- | --- |
| C1-C7 | Ciclo del icono, 6 clics consecutivos | `2026-10-26` → `26` → `10` → `octubre` → `2026` → `2026-10-26`; `aria-label` se actualiza en cada paso y el foco vuelve a `#column-name` |
| C8 | Editar a mano (`Manual`) y pulsar el icono | Escribe `2026-10-26` y reinicia el ciclo |
| C12 | Nombre duplicado | Aviso inline: «Ya existe una columna llamada "2026-10-26" en esta pestaña…» |
| C13 | Enviar el duplicado | `POST /columns/` → 400; el diálogo permanece abierto, el botón se rehabilita y no hay falso éxito |
| C14 | Crear una columna válida `2026-10-26` | `POST /columns/` → 201; toast único «Columna creada correctamente»; el diálogo se cierra |
| A1-A3 | Revocar cookie (`POST /api/user/logout/` desde la página) y crear una fila | Redirección a `/login?returnTo=%2Ftable%2Fb7f799d5-fedc-41f1-92be-bbeeef9a2e6d&expired=1`; aviso «Tu sesión expiró…»; tras login vuelve a la tabla y se ven «Contenido de pestaña cargado» y los datos |
| A6 | Contraseña incorrecta | Toast «Credenciales incorrectas»; la URL sigue en `/login?...`; sin redirección ni bucle |
| A10 | Cerrar sesión desde la cabecera | Navega a `/login` (sin `expired`) |
| A4 | Acceso directo a `/table/<id>` sin cookie | Redirección a `/login?returnTo=%2Ftable%2Fb7f799d5-fedc-41f1-92be-bbeeef9a2e6d` (sin `expired`) |

**Limpieza:** se eliminaron la columna temporal `2026-10-26` (id `16e28e37-0075-4f36-b6b5-cb914463bc07`) y el usuario temporal (id 26). No quedaron filas `fila-401` (el POST recibió 401) ni columnas duplicadas.
