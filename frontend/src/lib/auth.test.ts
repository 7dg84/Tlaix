import { describe, expect, it } from "vitest";
import {
  buildLoginPath,
  buildReturnTo,
  isAuthEndpoint,
  isAuthError,
  sanitizeReturnTo,
  shouldRedirectToLogin,
} from "./auth";

// Origen explícito para no depender del DOM: Vitest corre en Node.
const ORIGIN = "https://tlaix.test";

describe("isAuthEndpoint", () => {
  it("reconoce los endpoints de autenticación", () => {
    expect(isAuthEndpoint("/user/")).toBe(true);
    expect(isAuthEndpoint("/user/login/")).toBe(true);
    expect(isAuthEndpoint("/user/register/")).toBe(true);
    expect(isAuthEndpoint("/user/recover/")).toBe(true);
    expect(isAuthEndpoint("/user/logout/")).toBe(true);
  });

  it("no confunde los endpoints de datos con los de autenticación", () => {
    expect(isAuthEndpoint("/tables/")).toBe(false);
    expect(isAuthEndpoint("/tables/1/")).toBe(false);
    expect(isAuthEndpoint("/tables/1/rows/")).toBe(false);
  });

  it("ignora la query string y el hash al comparar", () => {
    expect(isAuthEndpoint("/user/login/?next=/")).toBe(true);
    expect(isAuthEndpoint("/user/logout/?next=/")).toBe(true);
    expect(isAuthEndpoint("/user/#perfil")).toBe(true);
    expect(isAuthEndpoint("/tables/?page=2")).toBe(false);
  });

  it("reconoce URLs absolutas solo si la ruta coincide exactamente", () => {
    // normalizeUrl quita el origen pero no el prefijo `/api`: la comparación es exacta.
    // En la práctica axios conserva `config.url` relativo (`/user/login/`) y aplica
    // `baseURL: '/api/'` al enviar, así que el caso con `/api` no ocurre hoy.
    expect(isAuthEndpoint("https://tlaix.test/user/login/")).toBe(true);
    expect(isAuthEndpoint("http://localhost:8000/user/")).toBe(true);
    expect(isAuthEndpoint("https://tlaix.test/api/user/login/")).toBe(false);
    expect(isAuthEndpoint("https://tlaix.test/api/tables/1/")).toBe(false);
  });

  it("tolera la ausencia de barra final: /user/login y /user son endpoints de auth", () => {
    expect(isAuthEndpoint("/user/login")).toBe(true);
    expect(isAuthEndpoint("/user/logout")).toBe(true);
    expect(isAuthEndpoint("/user")).toBe(true);
  });

  it("rechaza subrutas de los endpoints de autenticación", () => {
    // La normalización solo quita la barra final; nunca acepta prefijos.
    expect(isAuthEndpoint("/user/login/extra")).toBe(false);
    expect(isAuthEndpoint("/user/login/extra/")).toBe(false);
    expect(isAuthEndpoint("/user/anything/")).toBe(false);
    expect(isAuthEndpoint("/user/logout/otra-cosa")).toBe(false);
  });

  it("devuelve false para valores vacíos o ausentes", () => {
    expect(isAuthEndpoint(null)).toBe(false);
    expect(isAuthEndpoint(undefined)).toBe(false);
    expect(isAuthEndpoint("")).toBe(false);
  });
});

describe("isAuthError", () => {
  it("considera error de autenticación un 401", () => {
    expect(isAuthError({ response: { status: 401 } })).toBe(true);
  });

  it("considera error de autenticación un error ya redirigido", () => {
    expect(isAuthError({ isAuthRedirect: true })).toBe(true);
    expect(isAuthError({ response: { status: 401 }, isAuthRedirect: true })).toBe(
      true
    );
  });

  it("no trata como sesión expirada un 403 ni un 400", () => {
    expect(isAuthError({ response: { status: 403 } })).toBe(false);
    expect(isAuthError({ response: { status: 400 } })).toBe(false);
  });

  it("devuelve false si no hay respuesta ni marca de redirección", () => {
    expect(isAuthError(undefined)).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError({})).toBe(false);
    expect(isAuthError({ isAuthRedirect: false })).toBe(false);
    expect(isAuthError(new Error("network error"))).toBe(false);
  });
});

describe("sanitizeReturnTo", () => {
  it("devuelve la raíz cuando no hay ruta solicitada", () => {
    expect(sanitizeReturnTo(null, ORIGIN)).toBe("/");
    expect(sanitizeReturnTo(undefined, ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("   ", ORIGIN)).toBe("/");
  });

  it("conserva la ruta interna con query y hash", () => {
    expect(sanitizeReturnTo("/table/abc?x=1#y", ORIGIN)).toBe("/table/abc?x=1#y");
  });

  it("conserva rutas internas simples", () => {
    expect(sanitizeReturnTo("/", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("/table/abc", ORIGIN)).toBe("/table/abc");
  });

  it("no vuelve al propio login para evitar un bucle de redirección", () => {
    expect(sanitizeReturnTo("/login", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("/login/", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("/login?returnTo=/table/1", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("https://tlaix.test/login", ORIGIN)).toBe("/");
  });

  it("rechaza URLs protocol-relative", () => {
    expect(sanitizeReturnTo("//evil.com", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("///evil.com", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("//evil.com/table/1", ORIGIN)).toBe("/");
  });

  it("rechaza URLs absolutas de otro origen", () => {
    expect(sanitizeReturnTo("https://evil.com", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("https://evil.com/table/1", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("http://tlaix.test/table/1", ORIGIN)).toBe("/");
  });

  it("rechaza rutas con barras invertidas", () => {
    expect(sanitizeReturnTo("/\\evil.com", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("\\\\evil.com", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("/table/..\\evil.com", ORIGIN)).toBe("/");
  });

  it("rechaza esquemas peligrosos como javascript:", () => {
    expect(sanitizeReturnTo("javascript:alert(1)", ORIGIN)).toBe("/");
  });

  it("normaliza a ruta interna las variantes de esquema con una sola barra", () => {
    // `https:/evil.com` no cambia de host: el navegador la resuelve como `/evil.com`
    // del mismo origen, así que no es un open redirect.
    expect(sanitizeReturnTo("https:/evil.com", ORIGIN)).toBe("/evil.com");
  });

  it("rechaza variantes con userinfo y subdominios parecidos", () => {
    expect(sanitizeReturnTo("http:evil.com", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("https://tlaix.test@evil.com", ORIGIN)).toBe("/");
    expect(sanitizeReturnTo("https://tlaix.test.evil.com/table/1", ORIGIN)).toBe(
      "/"
    );
  });

  it("reduce una URL absoluta del mismo origen a su ruta", () => {
    expect(sanitizeReturnTo("https://tlaix.test/table/abc?x=1#y", ORIGIN)).toBe(
      "/table/abc?x=1#y"
    );
  });

  it("funciona sin origen explícito cuando no hay DOM", () => {
    // En Node no existe window.location: se usa el origen de reserva interno.
    expect(sanitizeReturnTo("/table/abc?x=1")).toBe("/table/abc?x=1");
    expect(sanitizeReturnTo("//evil.com")).toBe("/");
  });
});

describe("buildLoginPath", () => {
  it("incluye returnTo codificado y el aviso de sesión expirada", () => {
    expect(buildLoginPath("/table/abc", true)).toBe(
      "/login?returnTo=%2Ftable%2Fabc&expired=1"
    );
  });

  it("omite expired cuando no se pide el aviso", () => {
    expect(buildLoginPath("/table/abc")).toBe("/login?returnTo=%2Ftable%2Fabc");
    expect(buildLoginPath("/table/abc", false)).toBe(
      "/login?returnTo=%2Ftable%2Fabc"
    );
  });

  it("codifica la ruta para que query y hash sobrevivan al viaje de ida y vuelta", () => {
    const path = buildLoginPath("/table/abc?x=1#y", true);
    const params = new URLSearchParams(path.slice(path.indexOf("?") + 1));

    expect(params.get("returnTo")).toBe("/table/abc?x=1#y");
    expect(params.get("expired")).toBe("1");
    expect(sanitizeReturnTo(params.get("returnTo"), ORIGIN)).toBe(
      "/table/abc?x=1#y"
    );
  });
});

describe("shouldRedirectToLogin", () => {
  it("redirige ante un 401 de un endpoint autenticado", () => {
    expect(
      shouldRedirectToLogin({
        status: 401,
        url: "/tables/1/",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(true);
  });

  it("no redirige en los endpoints de autenticación", () => {
    // pathname fuera de /login: la exclusión viene de isAuthEndpoint
    expect(
      shouldRedirectToLogin({
        status: 401,
        url: "/user/login/",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectToLogin({
        status: 401,
        url: "/user/",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectToLogin({
        status: 401,
        url: "/user/logout/",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(false);
  });

  it("no redirige en el login sin barra final", () => {
    expect(
      shouldRedirectToLogin({
        status: 401,
        url: "/user/login",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(false);
  });

  it("no redirige si ya estamos en la pantalla de login", () => {
    expect(
      shouldRedirectToLogin({
        status: 401,
        url: "/tables/1/",
        pathname: "/login",
        alreadyRedirecting: false,
      })
    ).toBe(false);
  });

  it("no redirige si ya hay una redirección en curso", () => {
    expect(
      shouldRedirectToLogin({
        status: 401,
        url: "/tables/1/",
        pathname: "/table/1",
        alreadyRedirecting: true,
      })
    ).toBe(false);
  });

  it("no redirige ante errores que no son 401", () => {
    expect(
      shouldRedirectToLogin({
        status: 403,
        url: "/tables/1/",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectToLogin({
        status: 400,
        url: "/tables/1/",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectToLogin({
        url: "/tables/1/",
        pathname: "/table/1",
        alreadyRedirecting: false,
      })
    ).toBe(false);
  });

  it("redirige si faltan la URL o el estado de redirección", () => {
    // Defensivo: sin URL no se puede excluir un endpoint de auth.
    expect(
      shouldRedirectToLogin({
        status: 401,
        pathname: "/table/1",
      })
    ).toBe(true);
  });
});

describe("buildReturnTo", () => {
  it("compone pathname, query y hash", () => {
    expect(
      buildReturnTo({ pathname: "/table/1", search: "?x=1", hash: "#y" })
    ).toBe("/table/1?x=1#y");
  });

  it("devuelve la raíz para el índice", () => {
    expect(buildReturnTo({ pathname: "/" })).toBe("/");
  });

  it("cae en la raíz si el pathname está vacío o ausente", () => {
    expect(buildReturnTo({ pathname: "" })).toBe("/");
    expect(buildReturnTo({})).toBe("/");
  });

  it("omite search y hash cuando no existen", () => {
    expect(buildReturnTo({ pathname: "/table/1" })).toBe("/table/1");
    expect(buildReturnTo({ pathname: "/table/1", search: null, hash: null })).toBe(
      "/table/1"
    );
  });

  it("conserva el hash aunque no haya query", () => {
    expect(buildReturnTo({ pathname: "/table/1", hash: "#y" })).toBe(
      "/table/1#y"
    );
  });
});
