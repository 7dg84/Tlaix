import { useEffect } from "react";
import { Loader2, LogIn } from "lucide-react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useAuthModal } from "@/context/AuthModalContext";
import { Button } from "@/components/ui/button";

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

/** Pantalla de fondo cuando no hay sesión; el formulario vive en el modal global. */
const AuthRequiredScreen = () => {
  const { openLogin } = useAuthModal();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="text-muted-foreground">Inicia sesión para continuar.</p>
      <Button className="gap-2" onClick={() => openLogin("required")}>
        <LogIn className="w-4 h-4" />
        Iniciar sesión
      </Button>
    </div>
  );
};

/**
 * Guarda de rutas privadas: espera la sonda de sesión y, si no hay cookie,
 * muestra el fondo de acceso y abre el modal global de login.
 */
export const ProtectedRoute = () => {
  const { isLoggedIn, isAuthReady } = useAuth();
  const { openLogin } = useAuthModal();

  useEffect(() => {
    if (isAuthReady && !isLoggedIn) {
      openLogin("required");
    }
  }, [isAuthReady, isLoggedIn, openLogin]);

  if (!isAuthReady) return <FullPageLoader />;

  if (!isLoggedIn) return <AuthRequiredScreen />;

  return <Outlet />;
};
