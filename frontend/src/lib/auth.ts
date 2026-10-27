/**
 * Utilidades de autenticación compartidas por el interceptor de la API,
 * el contexto de sesión y las pantallas de login.
 *
 * Son funciones puras para poder probarlas en Node, sin depender del DOM.
 */

/** Endpoints de autenticación: un 401 aquí es una respuesta esperada, no una sesión expirada. */
const AUTH_ENDPOINTS = [
  "/user",
  "/user/login",
  "/user/register",
  "/user/recover",
  "/user/logout",
];

const FALLBACK_ORIGIN = "http://localhost";

/** Quita origen, query y hash para comparar solo la ruta. */
function normalizeUrl(url: string): string {
  let path = url.trim();

  const absoluteOrigin = /^[a-z][a-z\d+.-]*:\/\/[^/]+/i.exec(path);
  if (absoluteOrigin) {
    path = path.slice(absoluteOrigin[0].length) || "/";
  }

  path = path.split("#")[0].split("?")[0];

  if (!path.startsWith("/")) path = `/${path}`;

  // Tolera la ausencia de barra final (`/user/login` ≡ `/user/login/`),
  // pero no acepta subrutas como `/user/login/extra`
  if (path.length > 1) path = path.replace(/\/+$/, "");

  return path;
}

/** `true` si la URL corresponde a un endpoint de autenticación. */
export function isAuthEndpoint(url?: string | null): boolean {
  if (!url) return false;
  return AUTH_ENDPOINTS.includes(normalizeUrl(url));
}

/** Error de axios (o similar) con la marca que pone el interceptor global. */
interface AuthErrorLike {
  response?: { status?: number };
  isAuthRedirect?: boolean;
}

/** `true` si el error es un 401 o ya disparó la redirección al login. */
export function isAuthError(error: unknown): boolean {
  const candidate = error as AuthErrorLike | null | undefined;
  if (!candidate) return false;
  return candidate.response?.status === 401 || candidate.isAuthRedirect === true;
}

/** Origen de referencia: el indicado, el del navegador o uno de reserva para tests. */
function resolveOrigin(origin?: string): string {
  if (origin) return origin;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return FALLBACK_ORIGIN;
}

/**
 * Sanea la ruta a la que volver tras el login.
 * Acepta solo rutas del mismo origen; cualquier intento de open redirect
 * (`//evil.com`, `https://evil.com`, barras invertidas) devuelve `/`.
 */
export function sanitizeReturnTo(
  value: string | null | undefined,
  origin?: string
): string {
  if (!value) return "/";

  const candidate = value.trim();
  if (!candidate) return "/";

  // Rechaza barras invertidas y rutas protocol-relative antes de parsear
  if (candidate.includes("\\") || candidate.startsWith("//")) return "/";

  let baseOrigin: string;
  try {
    baseOrigin = new URL(resolveOrigin(origin)).origin;
  } catch {
    return "/";
  }

  try {
    const url = new URL(candidate, baseOrigin);
    if (url.origin !== baseOrigin) return "/";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) {
      return "/";
    }
    // Volver al propio login provocaría un bucle: mejor aterrizar en la raíz
    if (url.pathname === "/login" || url.pathname === "/login/") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/** Construye `/login?returnTo=...&expired=1` conservando la ruta solicitada. */
export function buildLoginPath(returnTo: string, expired?: boolean): string {
  const params = new URLSearchParams({ returnTo });
  if (expired) params.set("expired", "1");
  return `/login?${params.toString()}`;
}

interface RedirectDecision {
  status?: number | null;
  url?: string | null;
  pathname?: string | null;
  alreadyRedirecting?: boolean;
}

/**
 * Decide si un error debe provocar la redirección global al login.
 * Función pura para poder probar las exclusiones y la guarda anti-bucle.
 */
export function shouldRedirectToLogin({
  status,
  url,
  pathname,
  alreadyRedirecting,
}: RedirectDecision): boolean {
  return (
    status === 401 &&
    !isAuthEndpoint(url) &&
    !alreadyRedirecting &&
    pathname !== "/login"
  );
}

interface ReturnToLocation {
  pathname?: string | null;
  search?: string | null;
  hash?: string | null;
}

/** Ruta a la que volver tras el login: pathname + search + hash, con `/` por defecto. */
export function buildReturnTo({ pathname, search, hash }: ReturnToLocation): string {
  const base = pathname && pathname.length > 0 ? pathname : "/";
  return `${base}${search ?? ""}${hash ?? ""}`;
}
