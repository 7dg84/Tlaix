# Auditoría QA — Icono de calendario en columnas + redirección global por 401

- **Fecha:** 2026-10-26
- **Auditor:** `qa`
- **Plan auditado:** `docs/plans/2026-10-26-calendario-columnas-auth-401.md`
- **QA de referencia:** `docs/qa/2026-10-26-calendario-auth.md`
- **Alcance:** diff de trabajo sin commitear (`git status`: 13 archivos modificados, `frontend/src/components/ui/sonner.tsx` eliminado y 7 archivos nuevos entre código, plan y QA), backend **sin cambios** (solo lectura para validar `Column.name` y `unique_together`).
- **Método:** lectura del código, `npm test`, `tsc`, `npm run build`, `eslint` (informativo) y **sondas de ejecución** del interceptor real (`api-client.ts` empaquetado con esbuild y ejecutado en Node contra servidores HTTP locales que devuelven 401/403).
- **Nota de lectura:** este informe refleja el estado **previo** a las correcciones. El seguimiento, las correcciones aplicadas y la evidencia E2E están en `docs/qa/2026-10-26-calendario-auth.md` §9-§10.

---

## 1. Veredicto

**APTO CON OBSERVACIONES**

- No se encontraron hallazgos **Críticos** ni **Altos**.
- Los criterios de aceptación de la Parte A (icono de calendario) y de la Parte B (401 global) **se cumplen** y están verificados por código, por los tests unitarios nuevos y por sondas de ejecución del interceptor real.
- Las observaciones son de **Medio** (interacción con el modo revisión + cobertura del interceptor) y varias de **Bajo/Info** (higiene de logs, doble toast de error, robustez fuera del navegador, documentación).
- **Seguimiento (2026-10-26):** la matriz E2E de navegador se ejecutó con Docker Compose y navegador real; la evidencia está en `docs/qa/2026-10-26-calendario-auth.md` §10. Los hallazgos M-1, M-2, B-1 a B-4, B-6, I-1 e I-4 quedaron corregidos y verificados (detalle en §9 de ese documento).

---

## 2. Hallazgos

### MEDIO

#### M-1 · El 401 global anula el flujo de recuperación del modo revisión y se pierde el progreso

- **Archivos/líneas:**
  - `frontend/src/api/api-client.ts:26-40` (redirección global)
  - `frontend/src/components/ReviewMode.tsx:415-421` (panel + toast de error de guardado)
  - `frontend/src/components/ReviewMode.tsx:487-491` (cierre del overlay al detectar 401)
  - `frontend/src/components/ReviewMode.tsx:65-78` (`describeSaveError`: mensaje específico de 401)
  - `frontend/src/pages/TableView.tsx:444-457` (`updateCellValue` → `saveCell` → `cellService.update`)
- **Descripción:** `ReviewMode` ya tenía un tratamiento propio del 401: revierte el editor, muestra un panel de error con «Reintentar / Salir», un toast con `describeSaveError(error)` y, al cerrar, otro toast «Tu sesión expiró. Vuelve a iniciar sesión.» (`:489`). El interceptor nuevo se ejecuta **antes** de que ese `catch` se resuelva y hace `window.location.assign(...)`, por lo que el overlay nunca llega a mostrarse: la página se recarga y el usuario pierde el índice de revisión, el borrador del ítem actual y cualquier avance no guardado. Además se emiten toasts de 401 que el plan quería eliminar (solo se limpiaron `TableView`/`Index`).
- **Reproducción (estática + sonda):** cualquier `PUT /api/tables/cell/<table>/<column>/<row>/` con cookie revocada. Sonda del interceptor real (`api-client.ts` empaquetado) contra un servidor que responde 401:

  ```
  assigned ( 1 ): [ '/login?returnTo=%2Ftable%2Fabc%3Fx%3D1%23y&expired=1' ]
  status codes: [ 401, 401, 401, 401 ]
  ```

  Es decir: el 401 dispara la navegación sin esperar a que `ReviewMode` decida nada. Con `ReviewMode` abierto el `returnTo` es `/table/<id>`; el overlay y su estado no se restauran tras el login.
- **Impacto:** pérdida del progreso de revisión (potencialmente decenas de filas) y dos UX de 401 conviviendo (panel de reintento vs. redirección dura). No hay corrupción de datos: el guardado falla y `saveCell` revierte (`TableView.tsx:432-440`).
- **Propuesta (agente `frontend`):**
  1. En `ReviewMode.tsx:421` y `:489`, no emitir toast si `isAuthError(error)` (importar de `@/lib/auth`), igual que en `TableView`/`Index`. El aviso pasa a ser la redirección.
  2. Decidir explícitamente el producto: si se acepta la redirección dura (lo que pide el plan), documentar en `docs/qa` que el progreso de revisión se pierde; si no, marcar la petición de guardado con una opción (`config.skipAuthRedirect = true` para `cellService.update`) y dejar que `ReviewMode` mantenga su flujo de reintento/salida.
  3. Añadir a la matriz E2E el caso «401 guardando dentro del modo revisión».

#### M-2 · La lógica central del interceptor (exclusiones + guarda anti-bucle + `returnTo`) no tiene test automatizado

- **Archivos/líneas:** `frontend/src/api/api-client.ts:19-44` (lógica inline); tests existentes solo sobre utilidades: `frontend/src/lib/auth.test.ts`, `frontend/src/lib/date-name.test.ts`.
- **Descripción:** lo único cubierto por `npm test` son las funciones puras (`isAuthEndpoint`, `isAuthError`, `sanitizeReturnTo`, `buildLoginPath`). La decisión de redirección (`status === 401 && !isAuthEndpoint(url) && !isRedirectingToLogin && pathname !== '/login'`) y la construcción de `returnTo` viven dentro del módulo del cliente axios, que no es testeable sin DOM (y ver B-2). Una regresión aquí afecta a **toda** la autenticación de la SPA.
- **Impacto:** el criterio «ningún bucle de redirección» y «401 en login no redirige» queda protegido solo por la E2E manual, que está pendiente. El propio `auth.test.ts:44-49` documenta un caso frágil (`/user/login` sin barra ⇒ no excluido) que hoy no rompe solo porque todos los llamadores usan barra final.
- **Evidencia de que hoy funciona** (sonda ejecutada contra el bundle real, 4 peticiones concurrentes):

  ```
  assigned ( 1 ): [ '/login?returnTo=%2Ftable%2Fabc%3Fx%3D1%23y&expired=1' ]
  isAuthRedirect flags: [ true, undefined, undefined, undefined ]   // /user/ y /user/login/ no redirigen
  assigned tras segunda tanda: 1                                    // guarda anti-bucle efectiva
  [pathname=/login] 401 -> assigned: 0                              // no redirige en /login
  [403] assigned: 0                                                 // 403 no se trata como 401
  ```
- **Propuesta (agentes `frontend` + `test-writer`):** extraer a `lib/auth.ts` dos funciones puras y testearlas:
  - `shouldRedirectToLogin({ status, url, pathname, alreadyRedirecting }): boolean`
  - `buildReturnTo(location: { pathname, search, hash }): string`
  Casos mínimos: 401+`/tables/`⇒true; 401+`/user/*`⇒false; 401+`/login`⇒false; 403⇒false; 401 con `alreadyRedirecting`⇒false; `returnTo` con query y hash.

---

### BAJO

#### B-1 · `logout()` fallido deja la cookie viva y produce un rebote `/login` → `/`

- **Archivos/líneas:** `frontend/src/components/Header.tsx:44-49`, `frontend/src/context/AuthContext.tsx:109-121` (`finally` limpia estado, pero la cookie HTTPOnly no se puede borrar desde JS), `frontend/src/pages/Login.tsx:36-38` (`<Navigate>` si `isLoggedIn`).
- **Descripción:** si `POST /api/user/logout/` falla (red caída, 500), `logout()` limpia el estado local y muestra «Error en el cierre de sesión.» (`AuthContext.tsx:113`), y `Header` navega igualmente a `/login`. Allí la sonda `GET /user/` responde 200 (la cookie sigue válida), `isLoggedIn` pasa a `true` y el `<Navigate>` devuelve al usuario a `/`. Resultado: no puede cerrar sesión y ve un rebote sin explicación; el toast de error se destruye con la recarga.
- **Reproducción:** DevTools → Network → *Block request URL* `**/api/user/logout/` → con sesión válida, cabecera → **Cerrar Sesión**.
- **Propuesta (agente `frontend`):** `logout(): Promise<boolean>`; en `Header.handleLogout`, redirigir solo si `true`, o si el error es 401 (cookie ya inválida). Si falla por otro motivo, cerrar el diálogo y mantener al usuario en la página con el toast visible.

#### B-2 · El interceptor no es seguro fuera del navegador: `ReferenceError: window is not defined` enmascara el 401

- **Archivos/líneas:** `frontend/src/api/api-client.ts:24` (guarda `typeof window !== 'undefined'`) vs. `:35-39` (usa `window.location` sin guarda).
- **Descripción:** la guarda de `:24` solo protege el cálculo de `pathname`; si `window` no existe, `pathname` queda `''` (≠ `/login`), la condición se cumple y `:35` lanza `ReferenceError`, sustituyendo el error 401 original.
- **Evidencia (sonda ejecutada sobre el bundle real en Node):**

  ```
  typeof window = undefined
  rejected name   : ReferenceError
  rejected message: window is not defined
  has response    : false status: undefined
  isAuthRedirect  : undefined
  ```
  Consecuencia colateral: `isAuthError()` devuelve `false` y `manageError` mostraría «Error: window is not defined» en lugar del error HTTP.
- **Impacto:** hoy la app es solo navegador, así que no afecta a producción; sí bloquea cualquier test/SSR futuro y hace que el interceptor no se pueda cubrir con Vitest (ver M-2).
- **Propuesta (agente `frontend`):** al inicio del rechazo, `if (typeof window === 'undefined') return Promise.reject(error);`, o calcular `pathname`/`returnTo` dentro de un único `if (typeof window !== 'undefined')`.

#### B-3 · Doble toast de error al crear una columna rechazada (incluido el duplicado)

- **Archivos/líneas:** `frontend/src/pages/TableView.tsx:354-357` (`manageError(error)` + `toast.error("No se pudo crear la columna...")`).
- **Descripción:** `manageError` ya emite un toast por cada campo de `response.data` (para un duplicado, `non_field_errors`) y acto seguido se emite el genérico. El criterio «no debe haber doble toast» se cumplió para el éxito (correcto: solo `TableView.tsx:351`), pero no para el error.
- **Reproducción:** crear dos columnas con el mismo nombre en la misma pestaña (backend: `UniqueTogetherValidator` sobre `unique_together (tab, name)` ⇒ 400) ⇒ dos toasts.
- **Propuesta (agente `frontend`):** si `error.response?.status === 400`, dejar solo el mensaje del backend; en otro caso, solo el genérico.

#### B-4 · El error de axios con las credenciales se imprime en consola en login/registro

- **Archivos/líneas:** `frontend/src/context/AuthContext.tsx:104` (`console.error(err)`), `:147` (registro), `:178` (recuperación).
- **Descripción:** el objeto de error de axios incluye `config.data` con el cuerpo de la petición. Verificado con una sonda sobre el cliente real:

  ```
  error.config.data = {"email":"qa@localhost","password":"<REDACTADO>"}
  error.config.url  = /user/login/
  ```
  Cualquier `console.error(err)` en el `catch` del login imprime la contraseña en claro en la consola del navegador (y en cualquier captura o herramienta de reporte de errores que se añada en el futuro).
- **Impacto:** exposición local de credenciales; riesgo bajo (quien ve la consola ya tenía la sesión), pero es justo el tipo de log que la auditoría pide evitar. Es preexistente, aunque el archivo se tocó en esta entrega y el plan pedía «no logs ruidosos».
- **Propuesta (agente `frontend`):** registrar solo lo necesario: `console.error('Login falló', err?.response?.status ?? err?.message)`; eliminar el `console.error` del todo si el toast ya informa.

#### B-5 · `TODO.md` y el plan no reflejan el trabajo terminado

- **Archivos/líneas:** `TODO.md:25` (el ítem del icono de calendario sigue `- [ ]`), `TODO.md` (no hay entrada para el 401/reautenticación), `docs/plans/2026-10-26-calendario-columnas-auth-401.md:4` (estado «aprobado») y `:489-518` (fases 1-4 sin marcar).
- **Descripción:** el plan exige actualizar `TODO.md` y el propio plan «con estado final y resultados» (§Documentación a actualizar, líneas 634-639). `docs/qa/2026-10-26-calendario-auth.md` sí existe y es correcto.
- **Propuesta (agente `frontend`/`orchestrator`):** marcar el ítem del calendario, añadir «Redirección global por 401 + reautenticación» y actualizar el estado del plan a «implementado, E2E pendiente».

#### B-6 · Carrera entre `<Navigate>` y `window.location.assign` tras el login

- **Archivos/líneas:** `frontend/src/pages/Login.tsx:22-26` (`window.location.assign(returnTo)`) y `:36-38` (`<Navigate to={returnTo} replace />` cuando `isLoggedIn`).
- **Descripción:** `login()` hace `setIsLoggedIn(true)` antes de devolver `true`; al re-renderizarse `Login` se cumple `isAuthReady && isLoggedIn` y se monta `<Navigate>`, mientras el `handleSubmit` ya lanzó la recarga completa. Ambas navegaciones apuntan al mismo `returnTo`, así que el destino final es correcto, pero puede haber una navegación SPA + recarga (doble montaje de `TableView` y peticiones duplicadas) y un parpadeo.
- **Impacto:** solo rendimiento/parpadeo; no hay divergencia de destino ni bucle.
- **Propuesta (agente `frontend`):** un `useRef`/estado `justLoggedIn` que desactive la rama `<Navigate>` durante el submit, o mover la redirección a un `useEffect` que solo actúe cuando no venimos de un submit.

---

### INFO

#### I-1 · `isAuthEndpoint` exige barra final exacta

- `frontend/src/lib/auth.ts:36-39` compara la ruta normalizada contra una lista exacta. `apiClient.post('/user/login')` (sin barra) **sí** redirigiría ante un 401. Hoy no ocurre (todos los llamadores usan barra: `frontend/src/api/users.ts:3-7`) y está documentado en `auth.test.ts:44-49`. Sugerencia: normalizar la barra final en `normalizeUrl` para que la exclusión sea robusta.

#### I-2 · La guarda anti-bucle es por carga de página

- `frontend/src/api/api-client.ts:11,32` — `isRedirectingToLogin` es estado de módulo y solo se reinicia al recargar. Cubre el caso real (varios 401 simultáneos ⇒ una sola navegación, verificado). No protege un bucle **entre recargas**: si un endpoint de datos devolviera 401 con la sesión válida (inconsistencia de backend), el ciclo `/table → /login → (Navigate por sesión válida) → /table → …` sería infinito. Sugerencia defensiva: si `expired=1`, no auto-navegar desde `/login`; o un contador en `sessionStorage` que a los 2 rebotes muestre el formulario.

#### I-3 · `new Date()` y `describeDateNameMode` evaluados dos veces por render

- `frontend/src/components/AddColumnDialog.tsx:170-171` llama `describeDateNameMode(dateNameMode, new Date())` para `title` y otra vez para `aria-label`. Es trivial en coste, pero las dos fechas podrían diferir si el render cruza medianoche, dejando `title` y `aria-label` incoherentes (y ambos distintos del valor que se escribirá en el clic). Sugerencia: `const nextLabel = useMemo(...)` o una sola variable local.

#### I-4 · El nombre aceptado por el input no está acotado a `max_length=100`

- `frontend/src/components/AddColumnDialog.tsx:177-188`: no hay `maxLength`. Un pegado largo produce un 400 del backend (que se maneja bien: el diálogo no se cierra), pero se puede evitar en cliente. Los valores generados por el icono son ≤ 10 caracteres, así que el atajo cumple el requisito.

#### I-5 · Restos de la infraestructura de toasts de shadcn/Radix sin uso

- `frontend/src/components/ui/toaster.tsx`, `frontend/src/components/ui/use-toast.ts`, `frontend/src/hooks/use-toast.ts` solo se referencian entre sí; nadie los monta (el único `Toaster` es el de `react-hot-toast` en `frontend/src/App.tsx:18`). La entrega eliminó correctamente `ui/sonner.tsx` y la dependencia `sonner`; estos tres quedan como código muerto (preexistente).

#### I-6 · Ruido de toasts de éxito al cargar pestañas

- `frontend/src/pages/TableView.tsx:131` emite «Contenido de pestaña cargado» en cada carga/cambio de pestaña, incluida la recarga posterior al login. Preexistente y ajeno al diff, pero convive mal con el nuevo flujo de reautenticación (el usuario aterriza con un toast de éxito no solicitado).

---

### Comprobaciones sin hallazgo (para constancia)

| Requisito | Resultado | Evidencia |
| --- | --- | --- |
| Icono junto a `Nombre de la Columna *`, solo ese campo | OK | `AddColumnDialog.tsx:165-176`; cabecera/celdas intactas (`TableView.tsx:577-637`) |
| Ciclo `2026-10-26 → 26 → 10 → octubre → 2026 → 2026-10-26` | OK | `date-name.ts:8-22,33-37`; `date-name.test.ts:29-53` |
| Fecha local, sin `toISOString()` | OK | `date-name.ts:48-50` (solo `format` de date-fns + locale `es`); sin `toISOString` en `src/` |
| Reset al editar a mano / cerrar / crear | OK | `AddColumnDialog.tsx:71,76,184` |
| Foco y caret al final | OK | `AddColumnDialog.tsx:86-91` |
| `type="button"`, `aria-label`, `title`, `focus-visible` | OK | `AddColumnDialog.tsx:167-175` |
| Aviso de duplicado (`existingNames`) sin bloquear el envío | OK | `AddColumnDialog.tsx:62-64,187-198`; `TableView.tsx:527-530` |
| Submit async/boolean: no cierra ni hay falso éxito si la API falla | OK | `AddColumnDialog.tsx:107-139`; `TableView.tsx:324-361` |
| Un solo toast de éxito | OK | solo `TableView.tsx:351` (el diálogo ya no lo emite) |
| `unique_together (tab, name)` ⇒ 400 | OK (lectura) | `backend/api/models.py:46,55`; `backend/api/serializers.py:27-37` genera `UniqueTogetherValidator` porque `tab_id` tiene `source='tab'` |
| 401 de endpoint autenticado ⇒ login con `returnTo` + `expired=1` | OK | sonda: `/login?returnTo=%2Ftable%2Fabc%3Fx%3D1%23y&expired=1` |
| Exclusiones `/user/`, `/user/login/`, … y `/login` | OK | sonda: 1 sola navegación entre 4 peticiones; `pathname=/login` ⇒ 0 |
| Guarda anti-bucle | OK | sonda: segunda tanda de 401 ⇒ 0 navegaciones |
| 403 no se trata como 401 | OK | sonda: `assigned: 0`; `auth.test.ts:70-73` |
| `returnTo` sin open redirect | OK | `auth.ts:68-97`; `auth.test.ts:102-142`; verificado con el parser de URL (`https:/evil.com` ⇒ mismo origen `/evil.com`; `//evil.com`, `/\evil.com`, `https://tlaix.test@evil.com` ⇒ `/`) |
| XSS en el aviso de duplicado | OK | `{trimmedName}` interpolado como texto (React escapa); sin `dangerouslySetInnerHTML` en el diff |
| IDOR/autorización | No aplica | no hay endpoints nuevos; `ProtectedRoute` es solo UI |
| Todo el tráfico pasa por `apiClient` | OK | grep de `fetch(`/`XMLHttpRequest`/`axios.` en `src/`: solo los módulos de `src/api/*` sobre `apiClient` |
| `react-hot-toast` (sin `sonner`) | OK | sin referencias a `sonner`; dependencia y `ui/sonner.tsx` eliminados |
| `logout` limpia estado en `finally` | OK | `AuthContext.tsx:115-120` |

---

## 3. Riesgos residuales y pruebas que faltan

### 3.1 Pruebas que faltan (prioridad alta)

1. **E2E de navegador completa** (`docs/qa/2026-10-26-calendario-auth.md` §4-§5): sigue sin ejecutarse. Imprescindible para A1-A13 y C1-C16, especialmente:
   - C2-C7 (ciclo real con foco/caret) y C9 (reset al cerrar con `Esc`/clic fuera, no solo con Cancelar).
   - C13 (400 por duplicado con el diálogo abierto) y C14 (toast único).
   - A1-A3 (401 en plena edición ⇒ redirección ⇒ login ⇒ vuelta con datos), A6 (credenciales inválidas sin redirección), A8 (403 sin redirección).
2. **401 dentro del modo revisión** (nuevo, ver M-1).
3. **Tests del interceptor** (M-2) y de `sanitizeReturnTo('/login')`, `isAuthEndpoint` sin barra final.
4. **Caso «logout con la API caída»** (B-1).
5. No hay `jsdom`/`@testing-library/react` en `devDependencies`, por lo que no existen tests de componente: el ciclo del icono, el aviso de duplicado y el submit async solo se validan por E2E.

### 3.2 Riesgos residuales (preexistentes, fuera del diff — requieren ticket aparte)

- **Enumeración de usuarios en login:** `backend/api/views.py:36` usa `get_object_or_404(User, email=...)` ⇒ 404 para email inexistente y 401 para contraseña incorrecta; la UI además lo hace visible con toasts distintos (`AuthContext.tsx:88-89`). Sin rate limiting en `POST /api/user/login/` ni en registro.
- **`POST /user/login/` no rota el token:** `AuthToken.objects.get_or_create` reutiliza el token; no hay revocación por inactividad (cookie de 7 días, `config/settings.py:168-172`). El «sesión expirada» del plan solo ocurre por logout/revocación o caducidad de la cookie.
- **`AUTH_TOKEN_COOKIE_SECURE = False`** (`config/settings.py:170`): debe ser `True` en producción con HTTPS. `SameSite=Lax` mitiga CSRF de POST, pero conviene revisar `CSRF_TRUSTED_ORIGINS`/`CORS_ALLOWED_ORIGINS` en el despliegue real.
- **Autorización al crear columnas:** `backend/api/views.py:185-216` acepta `tab_id` del payload sin verificar que pertenezca al `table_id` de la URL ni llama a `check_object_permissions` sobre la tabla (a diferencia de `TabViewSet.create`, `:304-315`). Un usuario con permiso global de `add_column` podría crear columnas en una pestaña ajena. **No es una regresión de esta entrega** (el frontend ya enviaba `tab_id` antes), pero es la superficie IDOR más cercana al cambio.
- **`order: columns.length`** (`TableView.tsx:334`, preexistente) puede colisionar tras borrar columnas intermedias, produciendo orden ambiguo en `tabview`.
- **Sin timeout global en `apiClient`**: si la sonda `GET /user/` se cuelga, `ProtectedRoute` muestra el loader indefinidamente (`ProtectedRoute.tsx:25`). Solo `cellService.update` define `timeout: 15000`.

---

## 4. Comandos ejecutados y resultados

| Comando | Resultado |
| --- | --- |
| `cd frontend; npm test` | **OK** — 3 archivos, **75 tests passed** (`auth.test.ts` 24, `date-name.test.ts` 21, `review.test.ts` 30), 3.46 s |
| `cd frontend; npx tsc --noEmit -p tsconfig.app.json` | **OK** — exit 0, sin errores (los 5 preexistentes citados en el plan quedaron corregidos) |
| `cd frontend; npm run build` | **OK** — `built in 10.70s`; `dist/assets/index-Cwt7YDQG.js` 485.53 kB (gzip 157.84 kB). Único aviso: `caniuse-lite` desactualizado (no bloqueante) |
| `cd frontend; npx eslint <13 archivos del diff>` (informativo, no exigido por el plan) | **15 errores / 3 warnings, todos preexistentes** (`no-explicit-any` en `Index.tsx`/`TableView.tsx`, `exhaustive-deps` en `TableView.tsx:78`, `react-refresh` en `AuthContext.tsx`). **Ningún error en los archivos nuevos** (`auth.ts`, `date-name.ts`, `ProtectedRoute.tsx`, `api-client.ts`, `Login.tsx`, `AddColumnDialog.tsx`, `Header.tsx`, `App.tsx`) |
| Sonda del interceptor (bundle real con esbuild, ejecutado en Node, servidores HTTP locales 401/403) | 4 peticiones 401 concurrentes ⇒ **1** `location.assign('/login?returnTo=%2Ftable%2Fabc%3Fx%3D1%23y&expired=1')`; `/user/` y `/user/login/` **no** redirigen; `pathname=/login` ⇒ 0; 403 ⇒ 0; segunda tanda ⇒ 0 (guarda efectiva) |
| Sonda sin `window` (Node) | `ReferenceError: window is not defined` (B-2) |
| Sonda de fuga en `error.config.data` | `{"email":"…","password":"<REDACTADO>"}` (B-4) |
| Lectura de backend (solo lectura) | `Column.name = CharField(max_length=100)` y `unique_together = [['tab','name']]` (`backend/api/models.py:46,55`); `ColumnSerializer` (`serializers.py:27-37`) genera `UniqueTogetherValidator` |

**No ejecutado:** `docker compose` (prohibido en el encargo) ⇒ sin E2E real, sin validación en vivo del 400 por duplicado ni del 401 con cookie revocada. Los archivos de sonda se crearon en `C:\Users\uriel\AppData\Local\Temp\opencode\tlaix-qa\` (fuera del repositorio); **no se modificó ningún archivo del proyecto**.
