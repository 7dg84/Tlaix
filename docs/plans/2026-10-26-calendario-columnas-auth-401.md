# Icono de calendario en la creación de columnas + redirección global por 401

- **Fecha:** 2026-10-26
- **Estado:** implementado y verificado (2026-10-26)
- **Agentes:** `frontend` (implementación), `test-writer` (utilidades puras), `qa` (matriz E2E), `docker-ops` (rebuild), `orchestrator` (coordinación)

## Objetivo

Dos mejoras independientes:

1. **Nombre de columna con fecha rápida:** en el diálogo **Agregar Nueva Columna**, añadir un icono de calendario junto a la etiqueta `Nombre de la Columna *`. Al pulsarlo, rellena el campo **Nombre de la Columna** con la fecha actual; al pulsarlo de nuevo, cicla entre **fecha completa → día → mes (número) → mes (nombre) → año**.
2. **Sesión expirada:** si cualquier petición autenticada recibe **401**, mostrar el login de inmediato. Tras iniciar sesión, volver a la pantalla solicitada y **reejecutar todas las consultas a la API**, como si se recargara la página.

> **Corrección respecto al plan anterior:** el icono **no** va en la cabecera de la tabla ni rellena celdas. Actúa exclusivamente sobre el campo de texto `Nombre de la Columna` del diálogo de creación. No se modifica `TableView` en su cabecera ni `CellEditor`.

## Contexto actual

| Archivo | Rol actual |
| --- | --- |
| `frontend/src/components/AddColumnDialog.tsx` | Diálogo de creación; estado `columnName`; etiqueta `Nombre de la Columna *`; `onAddColumn(column)` |
| `frontend/src/pages/TableView.tsx` | Renderiza `<AddColumnDialog onAddColumn={handleAddColumn} />`; `handleAddColumn` crea la columna vía API |
| `frontend/src/api/columns.ts` | `columnService.create(tableId, data)` → `POST /tables/<tableId>/columns/` |
| `backend/api/models.py` | `Column.name` es `CharField(max_length=100)`; `unique_together = [["tab", "name"]]` |
| `frontend/src/api/api-client.ts` | Axios con `withCredentials: true`; **sin interceptores** |
| `frontend/src/api/manageErrors.ts` | Toasts y logs; hoy no distingue 401 |
| `frontend/src/context/AuthContext.tsx` | `isLoggedIn`, `user`, `login`, `logout`; sonda `getCurrentUser()` al montar |
| `frontend/src/pages/Login.tsx` | Login y `navigate("/")`; no conserva la ruta solicitada |
| `frontend/src/App.tsx` | Rutas sin guardas; `AuthProvider` está **fuera** de `BrowserRouter` |
| `frontend/src/components/Header.tsx` | Diálogo de perfil/login; logout sin redirección |

Dependencias ya disponibles: `date-fns` (incluido `date-fns/locale` para `es`) y `lucide-react` (`CalendarDays`). No hace falta `react-day-picker` ni un calendario emergente: el icono solo genera texto.

---

# Parte A — Icono de calendario en «Nombre de la Columna»

## Ubicación exacta

En `AddColumnDialog`, la etiqueta actual es:

```tsx
<div className="space-y-2">
  <Label htmlFor="column-name">Nombre de la Columna *</Label>
  <Input
    id="column-name"
    value={columnName}
    onChange={(e) => setColumnName(e.target.value)}
    placeholder="Ej: Estado, Cantidad, Precio"
  />
</div>
```

Se propone colocar el botón **inmediatamente a la derecha de la etiqueta**, en la misma fila:

```tsx
<div className="flex items-center gap-2">
  <Label htmlFor="column-name">Nombre de la Columna *</Label>
  <button
    type="button"
    onClick={handleDateName}
    title={describeDateNameMode(dateNameMode, new Date())}
    aria-label={describeDateNameMode(dateNameMode, new Date())}
    className="text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  >
    <CalendarDays className="w-4 h-4" />
  </button>
</div>
```

- `type="button"` para que **nunca** envíe el formulario/diálogo.
- `aria-label` y `title` dinámicos según el **próximo** modo.
- El icono es pequeño y queda pegado al texto de la etiqueta, no al extremo derecho del diálogo.
- Alternativa visual: botón dentro del `Input` como adorno derecho (`pr-10` + `absolute right-2`). La etiqueta es la opción recomendada porque el requisito dice «junto a Nombre de la Columna *».

## Decisiones

| ID | Decisión | Motivo |
| --- | --- | --- |
| **D1** | El icono rellena **solo el campo Nombre de la Columna**; no toca celdas, filas ni la cabecera de la tabla. | Corrección explícita del requisito. |
| **D2** | Secuencia de clics: **fecha completa → día → mes (número) → mes (nombre) → año → fecha completa**. | Confirmado por el usuario: el mes muestra `10` y, al pulsar de nuevo, `octubre`; después el año. |
| **D3** | Valores generados: `YYYY-MM-DD`, `DD`, `MM`, `MMMM` (español), `YYYY` (con ceros a la izquierda en día y mes). | Nombres válidos, ordenables y sin ambigüedad. Ej.: `2026-10-26`, `26`, `10`, `octubre`, `2026`. |
| **D4** | Se muestra **siempre**, independientemente del tipo de columna. | Confirmado: el nombre es independiente del tipo; el atajo sirve también para columnas de texto/notas. |
| **D5** | El ciclo se reinicia al **editar manualmente** el nombre, al **cerrar/reabrir** el diálogo y tras **crear** la columna. No hay reset por tiempo. | En un formulario, el tiempo de espera impredecible es peor que un ciclo estable. |
| **D6** | Tras cada clic, el foco vuelve al `Input` con el caret al final. | Permite seguir editando el nombre sin volver a hacer clic. |
| **D7** | La fecha se calcula en **hora local** con `date-fns` (`format(date, ...)`), nunca con `toISOString()`. | Evita que el día cambie por UTC. |
| **D8** | Si el nombre generado ya existe en la pestaña, se avisa y se deja decidir al usuario; no se añaden sufijos automáticos. | El backend tiene `unique_together (tab, name)`. Un sufijo automático rompería el nombre esperado. |

> **Confirmado por el usuario (2026-10-26):** formato ISO `2026-10-26`; mes numérico y luego nombre (`10` → `octubre`); icono visible en todos los tipos; recarga completa tras el login.

### Alternativas

- ~~Solo columnas de tipo Fecha~~: descartado; el icono se muestra en todos los tipos.
- ~~Formato localizado `26/10/2026`~~: descartado; se usa ISO `2026-10-26`.
- **Calendario emergente:** no aporta nada aquí; el objetivo es rellenar un texto, no elegir una fecha.

## UX y flujo

```text
┌──────────────────────────────────────────────────────┐
│ Agregar Nueva Columna                                │
│                                                      │
│ Nombre de la Columna *  [📅]                         │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 2026-10-26                                       │ │
│ └──────────────────────────────────────────────────┘ │
│ Tipo de Columna *                                    │
│ [ Fecha                                        ▾ ]  │
│                                                      │
│                         [Cancelar] [Agregar Columna] │
└──────────────────────────────────────────────────────┘
```

1. El usuario abre **Agregar Columna**.
2. Pulsa el icono de calendario:
   - 1.er clic → `2026-10-26`
   - 2.º clic → `26`
   - 3.er clic → `10`
   - 4.º clic → `octubre`
   - 5.º clic → `2026`
   - 6.º clic → `2026-10-26`
3. El campo queda enfocado y el usuario puede editarlo o enviar el formulario.
4. Si escribe manualmente, el siguiente clic vuelve a empezar por la fecha completa.
5. Al crear la columna, el diálogo se cierra y el ciclo se reinicia.

## Estado y código propuesto

En `AddColumnDialog`:

```ts
import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  DateNameMode,
  describeDateNameMode,
  formatDateName,
  nextDateNameMode,
} from "@/lib/date-name";

const nameInputRef = useRef<HTMLInputElement>(null);
const [dateNameMode, setDateNameMode] = useState<DateNameMode>("full");

const handleDateName = () => {
  const nextName = formatDateName(dateNameMode, new Date());
  setColumnName(nextName);
  setDateNameMode(nextDateNameMode(dateNameMode));

  // Devolver el foco al campo después del repintado
  requestAnimationFrame(() => {
    const input = nameInputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(nextName.length, nextName.length);
  });
};

// En el Input:
<Input
  id="column-name"
  ref={nameInputRef}
  value={columnName}
  onChange={(e) => {
    setColumnName(e.target.value);
    setDateNameMode("full"); // edición manual reinicia el ciclo
  }}
  ...
/>
```

- No se usa `onMouseDown preventDefault` porque aquí no hay `CellEditor` ni guardado en `blur`; el único efecto es mover el foco al botón y luego devolverlo al input.
- El estado `dateNameMode` es local al diálogo; se reinicia al montar/cerrar.

## Utilidades puras: `frontend/src/lib/date-name.ts`

```ts
export type DateNameMode = "full" | "day" | "month" | "monthName" | "year";

export const DATE_NAME_SEQUENCE: DateNameMode[] = [
  "full",
  "day",
  "month",
  "monthName",
  "year",
];

export function nextDateNameMode(mode: DateNameMode): DateNameMode;

/**
 * Devuelve el texto que se escribirá en el campo Nombre de la Columna.
 * - full:      "2026-10-26"
 * - day:       "26"
 * - month:     "10"
 * - monthName: "octubre"
 * - year:      "2026"
 * Usa la fecha local; nunca toISOString().
 */
export function formatDateName(mode: DateNameMode, date: Date): string;

/** Texto para title/aria-label: "Rellenar fecha completa (2026-10-26)", etc. */
export function describeDateNameMode(mode: DateNameMode, date: Date): string;
```

Implementación de referencia:

```ts
import { format } from "date-fns";
import { es } from "date-fns/locale";

const FORMATS: Record<DateNameMode, string> = {
  full: "yyyy-MM-dd",
  day: "dd",
  month: "MM",
  monthName: "MMMM",
  year: "yyyy",
};

export function formatDateName(mode: DateNameMode, date: Date): string {
  return format(date, FORMATS[mode], { locale: es });
}
```

- `format` usa la zona local del navegador.
- `MMMM` con `locale: es` produce `octubre` (minúscula, como es correcto en español).
- Día y mes quedan con dos dígitos (`05`, `03`), lo que mantiene nombres consistentes.
- El año es siempre de cuatro dígitos.

## Casos límite

| Caso | Comportamiento esperado |
| --- | --- |
| Campo vacío | El primer clic escribe la fecha completa |
| Nombre ya escrito manualmente | El clic lo reemplaza por el valor del modo actual |
| Edición manual después de un clic | El ciclo vuelve a `full` |
| Cierre y reapertura del diálogo | El ciclo vuelve a `full` |
| Nombre duplicado en la misma pestaña | Aviso inline; el backend rechaza con 400 si se envía igual |
| Nombre > 100 caracteres | No ocurre con los formatos propuestos; el backend valida `max_length=100` |
| Tipo de columna distinto de `date` | El icono sigue disponible (decisión D4) |
| Zona horaria | Se usa la fecha local; no hay desplazamiento UTC |
| El usuario pulsa el icono muchas veces | Ciclo indefinido `full → day → month → monthName → year → full` |

## Unicidad del nombre (robustez recomendada)

El backend exige `unique_together (tab, name)`. Generar `2026-10-26` dos veces en la misma pestaña producirá un 400. Para que el diálogo no se cierre con un falso «éxito»:

1. Pasar los nombres existentes al diálogo:
   ```tsx
   <AddColumnDialog
     onAddColumn={handleAddColumn}
     existingNames={columns.map((c) => c.name)}
   />
   ```
2. Si el nombre generado ya existe, mostrar un aviso inline:
   > «Ya existe una columna llamada “2026-10-26” en esta pestaña. Edita el nombre o elige otro valor.»
   No bloquear el envío; el usuario decide.
3. Hacer que `onAddColumn` sea **async y devuelva `boolean`**:
   ```ts
   onAddColumn: (column: ColumnDefinition) => Promise<boolean>;
   ```
   El diálogo espera el resultado, cierra solo si `true` y mantiene el formulario abierto si falla. `handleAddColumn` en `TableView` devuelve `true`/`false` y conserva su toast de error.
4. Evitar el doble toast actual («Columna agregada correctamente» en el diálogo + «Columna creada correctamente» en la tabla): dejar el éxito en un solo lugar.

Esta mejora es pequeña y evita una experiencia confusa justo en el caso que el nuevo atajo hace más probable (crear varias columnas con la fecha del día).

---

# Parte B — 401 global y reautenticación

## Comportamiento actual

- No hay interceptor de respuestas: un 401 solo produce un toast (`manageError`) y la pantalla se queda con datos viejos.
- `TableView` e `Index` cargan datos al montar sin comprobar sesión; no hay guardas de ruta.
- `Login` siempre navega a `/`, perdiendo la tabla solicitada.
- `AuthContext` comprueba la sesión con `getCurrentUser()` al montar, pero `isLoggedIn` empieza en `false` sin estado de «comprobando», así que una guarda ingenua redirigiría antes de saber si hay cookie.
- `logout` solo limpia el estado si la API responde; con cookie expirada no limpia nada.

## Diseño propuesto

### 1. Interceptor central en `api-client.ts`

```ts
const AUTH_EXACT = new Set(["/user/"]);
const AUTH_PREFIXES = [
  "/user/login/",
  "/user/register/",
  "/user/recover/",
  "/user/logout/",
];

const isAuthEndpoint = (url = "") =>
  AUTH_EXACT.has(url) || AUTH_PREFIXES.some((p) => url.startsWith(p));

let redirecting = false;

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url ?? "";

    if (
      status === 401 &&
      !isAuthEndpoint(url) &&
      !redirecting &&
      window.location.pathname !== "/login"
    ) {
      redirecting = true;
      error.isAuthRedirect = true;

      const returnTo =
        window.location.pathname + window.location.search + window.location.hash;
      const params = new URLSearchParams({ returnTo, expired: "1" });

      // Recarga completa: limpia estado en memoria y muestra el login de inmediato.
      window.location.assign(`/login?${params.toString()}`);
    }

    return Promise.reject(error);
  }
);
```

**Exclusiones obligatorias** para evitar bucles:

- `GET /user/` (sonda de sesión al montar; 401 es normal sin cookie).
- `POST /user/login/` (credenciales incorrectas → 401; debe mostrar el error en el formulario).
- `POST /user/register/`, `POST /user/recover/`.
- `POST /user/logout/` (si la cookie ya expiró, no debe redirigir en bucle).
- Si ya estamos en `/login`, no redirigir.

### 2. `manageErrors.ts` y toasts

- Si `error.response?.status === 401` o `error.isAuthRedirect`, retornar sin toast ni log ruidoso.
- En `TableView`/`Index`, los `catch` que muestran «No se pudo cargar…» deben omitir el 401; la redirección ya está en curso.

### 3. `AuthContext`: estado de «comprobando sesión»

Añadir `isAuthReady` (o `isAuthLoading`) al contexto:

```ts
const [isAuthReady, setIsAuthReady] = useState(false);

// en checkUser
try { ... } catch { clearAuth(); } finally { if (mounted) setIsAuthReady(true); }
```

- `login` y `logout` actualizan `isLoggedIn`/`user`.
- `logout` debe limpiar el estado local en `finally`, incluso si la API falla.
- Mantener `getCurrentUser()` como sonda única al montar.

### 4. `ProtectedRoute`

Nuevo `frontend/src/components/ProtectedRoute.tsx`:

```tsx
export const ProtectedRoute = () => {
  const { isLoggedIn, isAuthReady } = useAuth();
  const location = useLocation();

  if (!isAuthReady) return <FullPageLoader />;
  if (!isLoggedIn) {
    const params = new URLSearchParams({
      returnTo: location.pathname + location.search + location.hash,
    });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return <Outlet />;
};
```

En `App.tsx`:

```tsx
<Route element={<ProtectedRoute />}>
  <Route path="/" element={<Index />} />
  <Route path="/table/:tableId" element={<TableView />} />
</Route>
<Route path="/login" element={<Login />} />
```

Esto evita el parpadeo de una tabla vacía cuando se entra directo sin cookie.

### 5. `Login`: volver a la ruta y recargar

```tsx
const [params] = useSearchParams();
const returnTo = sanitizeReturnTo(params.get("returnTo"));
const expired = params.get("expired") === "1";

// tras auth.login(...) exitoso:
window.location.assign(returnTo); // recarga completa
```

- `window.location.assign` garantiza que **todos** los `useEffect`/consultas se ejecuten de nuevo, tal como pide el requisito. `navigate()` no remonta `TableView` si ya está en la misma ruta y no invalida los `useEffect`.
- Mostrar un aviso discreto si `expired === "1"`: «Tu sesión expiró. Inicia sesión de nuevo».
- Si `isAuthReady && isLoggedIn` al entrar a `/login`, redirigir a `returnTo` con `<Navigate replace />`.

### 6. `sanitizeReturnTo` (evitar open redirect)

```ts
export function sanitizeReturnTo(value: string | null): string {
  if (!value) return "/";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
```

Acepta solo rutas del mismo origen. Rechaza `//evil.com`, `https://evil.com` y variantes con `\`.

### 7. Logout

- `Header.handleLogout`: `await logout(); setIsOpen(false); window.location.assign("/login");`.
- `AuthContext.logout`: limpiar `isLoggedIn`, `user` y `localStorage` en `finally`.
- El interceptor excluye `/user/logout/`, así que un 401 aquí no redirige antes de tiempo.

## Flujos

### 401 durante el uso

```text
Acción del usuario (guardar celda, cargar filas, listar tablas)
        │
        ▼
API responde 401
        │
        ▼
Interceptor: ¿endpoint de auth? ── sí ──► rechazar (login/formulario muestra error)
        │ no
        ▼
window.location.assign("/login?returnTo=<ruta>&expired=1")
        │
        ▼
Login visible; AuthContext monta y getCurrentUser() → 401 (excluido)
        │
        ▼
Usuario inicia sesión → window.location.assign(returnTo)
        │
        ▼
Recarga completa: AuthContext + componentes vuelven a consultar la API
```

### Entrada directa sin sesión

```text
/table/:id → ProtectedRoute
        │
        ├─ isAuthReady=false → loader
        ├─ isLoggedIn=false → Navigate /login?returnTo=/table/:id
        └─ isLoggedIn=true  → TableView (carga datos)
```

## Archivos y cambios

| Archivo | Cambio |
| --- | --- |
| `frontend/src/components/AddColumnDialog.tsx` | Icono `CalendarDays` junto a la etiqueta; estado del ciclo; relleno de `columnName`; reset al editar/cerrar; submit async (recomendado) |
| `frontend/src/lib/date-name.ts` | **Nuevo**; `DateNameMode`, secuencia, `formatDateName`, `describeDateNameMode` |
| `frontend/src/lib/date-name.test.ts` | **Nuevo**; tests de formatos y ciclo |
| `frontend/src/pages/TableView.tsx` | Pasar `existingNames`; `handleAddColumn` devuelve `boolean` (recomendado); sin cambios en cabecera/celdas |
| `frontend/src/api/api-client.ts` | Interceptor de respuesta 401, exclusiones y guarda anti-bucle |
| `frontend/src/api/manageErrors.ts` | Ignorar 401/`isAuthRedirect` |
| `frontend/src/context/AuthContext.tsx` | `isAuthReady`, limpieza de estado en `finally` |
| `frontend/src/components/ProtectedRoute.tsx` | **Nuevo**; loader + `Navigate` con `returnTo` |
| `frontend/src/App.tsx` | Rutas protegidas con `ProtectedRoute` |
| `frontend/src/pages/Login.tsx` | `useSearchParams`, aviso de sesión expirada, recarga a `returnTo` |
| `frontend/src/components/Header.tsx` | Logout redirige a `/login` |
| `frontend/src/lib/auth.ts` | **Nuevo**; `sanitizeReturnTo`, `buildLoginPath`, `isAuthEndpoint` exportables |
| `frontend/src/lib/auth.test.ts` | **Nuevo**; tests de las utilidades |

**Backend:** sin cambios. `Column.name` ya admite el texto; `unique_together` ya valida duplicados.

---

# Tareas por fases

## Fase 0 — Decisiones confirmadas

- [x] Formato de la fecha completa: `2026-10-26` (ISO).
- [x] Mes: `10` y, al pulsar de nuevo, `octubre`; después el año.
- [x] Mostrar el icono en todos los tipos de columna.
- [x] Recarga completa tras el login.

## Fase 1 — Utilidades del nombre con fecha

- [x] Crear `lib/date-name.ts` con `DateNameMode`, secuencia, `formatDateName`, `describeDateNameMode`.
- [x] Tests: fecha completa, día, mes numérico, mes en nombre, año, ceros a la izquierda, 1 de enero, 31 de diciembre, ciclo completo, hora local.
- [x] `npm test` y `tsc -p tsconfig.app.json` sin errores nuevos.

## Fase 2 — Icono en `AddColumnDialog`

- [x] Añadir `CalendarDays` junto a `Nombre de la Columna *`.
- [x] Implementar `handleDateName` y el estado `dateNameMode`.
- [x] Reset del ciclo en `onChange` manual, al cerrar/reabrir y tras crear.
- [x] Devolver el foco al input con el caret al final.
- [x] `type="button"`, `aria-label` y `title` dinámicos.
- [x] (Recomendado) `existingNames` + aviso de duplicado.
- [x] (Recomendado) `onAddColumn` async/boolean; cerrar solo si la API confirma.

## Fase 3 — Autenticación

- [x] Crear `lib/auth.ts` + tests (`sanitizeReturnTo`, `isAuthEndpoint`).
- [x] Añadir interceptor 401 y exclusiones en `api-client.ts`.
- [x] Ajustar `manageErrors.ts` y los `catch` de `TableView`/`Index`.
- [x] Añadir `isAuthReady` y limpieza en `finally` en `AuthContext`.
- [x] Crear `ProtectedRoute` y proteger `/` y `/table/:tableId`.
- [x] Actualizar `Login` (returnTo, expired, recarga completa).
- [x] Actualizar `Header` (logout → `/login`).
- [x] Verificar que el login con credenciales inválidas **no** redirige.

## Fase 4 — Verificación

- [x] `npm test` (tests nuevos + 30 existentes).
- [x] `npm run build`.
- [x] `npx tsc --noEmit -p tsconfig.app.json` (0 errores; se corrigieron los 5 preexistentes).
- [x] Rebuild de `tlaix-react` y E2E en navegador.

## Resultado de la ejecución (2026-10-26)

- **Tests frontend:** `npm test` → **89 passed** (30 previos + 59 nuevos: 21 de `date-name`, 38 de `auth`).
- **Tipado:** `npx tsc --noEmit -p tsconfig.app.json` → **0 errores**.
- **Build:** `npm run build` → OK.
- **Docker:** rebuild `--no-cache` de `react` y contenedor recreado; app sirviendo en `http://localhost`.
- **E2E real (navegador):**
  - Ciclo del icono verificado 6 veces: `2026-10-26` → `26` → `10` → `octubre` → `2026` → `2026-10-26`; foco y caret vuelven al input en cada clic.
  - Edición manual reinicia el ciclo; el aviso de duplicado aparece; un 400 mantiene el diálogo abierto sin falso éxito.
  - Creación real de una columna `2026-10-26`: un solo toast «Columna creada correctamente» y cierre del diálogo.
  - 401 al crear una fila → `/login?returnTo=%2Ftable%2F<id>&expired=1` con aviso de sesión expirada; tras login vuelve a la tabla y se reejecutan las consultas.
  - Credenciales inválidas: toast «Credenciales incorrectas», sin redirección.
  - Logout → `/login`; acceso directo a `/table/<id>` sin cookie → `/login?returnTo=%2Ftable%2F<id>`.
  - Datos temporales de E2E (usuario y columna) eliminados al terminar.

---

# Pruebas

## Unitarias (`vitest`)

### `date-name.test.ts`

- `nextDateNameMode`: `full→day→month→monthName→year→full`.
- `formatDateName` con una fecha local fija (`new Date(2026, 9, 26, 12, 0, 0)`):
  - `full` → `2026-10-26`.
  - `day` → `26`.
  - `month` → `10`.
  - `monthName` → `octubre`.
  - `year` → `2026`.
- Fecha `new Date(2026, 0, 5)`: `day` → `05`; `month` → `01`; `monthName` → `enero`.
- Fecha `new Date(2026, 11, 31)`: `full` → `2026-12-31`; `day` → `31`; `month` → `12`; `monthName` → `diciembre`.
- `describeDateNameMode`: textos en español y valor esperado.
- No usar `new Date("2026-10-26")` en los tests (se interpreta como UTC); construir con componentes locales.

### `auth.test.ts`

- `sanitizeReturnTo(null)` → `/`.
- `/table/abc?x=1#y` → se conserva.
- `//evil.com`, `https://evil.com`, `/\evil.com` → `/`.
- `buildLoginPath("/table/abc", true)` → `/login?returnTo=%2Ftable%2Fabc&expired=1`.
- `isAuthEndpoint("/user/")`, `/user/login/`, `/user/logout/` → true.
- `isAuthEndpoint("/tables/")` → false.

## E2E (navegador real)

### Icono de calendario

1. Abrir una tabla → **Agregar Columna**.
2. Pulsar el icono:
   - 1.er clic: el input muestra `2026-10-26`.
   - 2.º: `26`.
   - 3.º: `10`.
   - 4.º: `octubre`.
   - 5.º: `2026`.
   - 6.º: vuelve a `2026-10-26`.
3. Editar manualmente el nombre y volver a pulsar: empieza por la fecha completa.
4. Crear la columna y verificar que se crea con el nombre mostrado.
5. Repetir el mismo nombre en la misma pestaña: aviso/400 controlado, sin falso éxito.
6. Comprobar que no se toca ninguna celda ni la cabecera de la tabla.

### Autenticación

1. Login válido; abrir una tabla.
2. Invalidar la cookie (`POST /api/user/logout/` desde la página) sin recargar.
3. Guardar una celda o cargar más filas → **redirección inmediata** a `/login?returnTo=…&expired=1`.
4. Verificar el aviso «Tu sesión expiró».
5. Iniciar sesión → vuelve a `/table/...` y la tabla vuelve a consultar y mostrar los datos.
6. Entrar directo a `/table/...` sin cookie → login (sin parpadeo de tabla).
7. Credenciales inválidas en `/login` → error en el formulario, **sin** redirección ni bucle.
8. Un 403 (permiso retirado) → **no** redirige; muestra el error correspondiente.

---

# Criterios de aceptación

## Icono de calendario

- [x] El icono está en `AddColumnDialog`, junto a `Nombre de la Columna *`.
- [x] Rellena **ese campo** con la fecha actual; no modifica celdas ni cabeceras.
- [x] Secuencia: completa → día → mes (número) → mes (nombre) → año → completa.
- [x] El campo queda enfocado y editable tras cada clic.
- [x] Editar manualmente reinicia el ciclo a «fecha completa».
- [x] Cerrar/reabrir el diálogo reinicia el ciclo.
- [x] Los nombres generados son válidos (`max_length=100`) y no hay fechas parciales problemáticas (es texto).
- [x] Un nombre duplicado no produce un falso «columna creada» (aviso/400 controlado).
- [x] Funciona con cualquier tipo de columna.

## Autenticación

- [x] Cualquier 401 de un endpoint autenticado muestra el login de inmediato.
- [x] Se conserva la ruta original en `returnTo` (incluyendo query y hash).
- [x] Tras el login se recarga la ruta y **todas** las consultas se reejecutan.
- [x] `/login`, `/user/`, `/user/login/`, `/user/register/`, `/user/recover/` y `/user/logout/` no provocan bucles.
- [x] Credenciales inválidas muestran error en el formulario, sin redirección.
- [x] Un 403 no redirige.
- [x] `returnTo` no permite open redirects.
- [x] Logout limpia el estado local y lleva a `/login`.

---

# Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El nombre generado ya existe en la pestaña | Aviso inline + submit async que mantiene el diálogo abierto; no cerrar con falso éxito |
| El usuario espera que el icono rellene celdas | El plan y la UI lo limitan al campo Nombre; el `title` lo dice explícitamente |
| Desplazamiento por zona horaria | `format` local; prohibido `toISOString()` |
| El ciclo se queda en un modo inesperado | Reset al editar/cerrar/crear; sin timeout |
| El icono envía el formulario sin querer | `type="button"` |
| 401 en la sonda `/user/` o en el login | Exclusión explícita de endpoints de auth |
| Bucles de redirección | Guarda `redirecting`, comprobación de `/login`, `returnTo` saneado |
| Pérdida de estado al recargar tras login | Es el comportamiento pedido («como si se recargara la página») |
| `isAuthReady` mal inicializado | Loader en `ProtectedRoute` hasta que `getCurrentUser` termine |

---

# Fuera de alcance

- Rellenar celdas o columnas completas con fechas.
- Iconos de calendario en la cabecera de la tabla o en el modo revisión.
- Fechas parciales como valores de celda.
- Cambios en el backend (el `Column.name` y el `POST` actual bastan).
- Migración a React Query para invalidar consultas; se usa recarga completa, que es lo pedido.
- Refresco silencioso de token: el backend usa cookie HTTPOnly; no hay refresh token.

---

# Documentación a actualizar

- `docs/qa/2026-10-26-calendario-auth.md`: matriz de pruebas y evidencia E2E.
- `TODO.md`: registrar ambas tareas al completarlas.
- `docs/plans/2026-10-26-calendario-columnas-auth-401.md`: este plan, con estado final y resultados.
- `SYSTEM_API_SPECIFICATION.md`: **sin cambios** (no hay endpoints nuevos).

---

# Decisiones confirmadas

1. **Formato:** `2026-10-26` (ISO).
2. **Mes:** `10` y, al pulsar de nuevo, `octubre`; después el año.
3. **Visibilidad:** en todos los tipos de columna.
4. **Auth:** recarga completa tras el login (`window.location.assign`).
