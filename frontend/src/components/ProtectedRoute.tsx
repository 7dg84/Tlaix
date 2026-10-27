import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { buildLoginPath } from "@/lib/auth";

/** Loader a pantalla completa mientras se comprueba la sesión. */
const FullPageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2
      className="w-6 h-6 animate-spin text-muted-foreground"
      aria-hidden="true"
    />
    <span className="sr-only">Comprobando sesión...</span>
  </div>
);

/**
 * Guarda de rutas privadas: espera la sonda de sesión y, si no hay cookie,
 * manda al login conservando la ruta solicitada (pathname + search + hash).
 */
export const ProtectedRoute = () => {
  const { isLoggedIn, isAuthReady } = useAuth();
  const location = useLocation();

  if (!isAuthReady) return <FullPageLoader />;

  if (!isLoggedIn) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={buildLoginPath(returnTo)} replace />;
  }

  return <Outlet />;
};
