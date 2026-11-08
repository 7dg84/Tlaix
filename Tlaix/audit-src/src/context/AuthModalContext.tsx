import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { AuthDialog } from "@/components/AuthDialog";
import {
  notifyAuthModalClosed,
  registerAuthModalListener,
  requestAuthModal,
  type AuthModalReason,
} from "@/lib/auth-modal";

type LoginReason = Exclude<AuthModalReason, "profile">;

interface AuthModalContextValue {
  /** Abre el modal en modo login. `expired` añade el aviso de sesión expirada. */
  openLogin: (reason?: LoginReason) => void;
  /** Abre el modal en modo perfil (solo tiene sentido con sesión activa). */
  openProfile: () => void;
}

interface AuthModalState {
  open: boolean;
  reason: AuthModalReason;
}

const INITIAL_STATE: AuthModalState = { open: false, reason: "login" };

export const AuthModalContext = createContext<AuthModalContextValue | undefined>(
  undefined
);

/**
 * Proveedor global del modal de login/perfil.
 *
 * El interceptor de axios pide la apertura mediante `requestAuthModal`; aquí se
 * mantiene el estado y se renderiza una única instancia del modal, la misma que
 * usa el botón de la cabecera.
 */
export const AuthModalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { clearSession } = useAuth();
  const [state, setState] = useState<AuthModalState>(INITIAL_STATE);

  useEffect(
    () =>
      registerAuthModalListener((reason) => {
        // Un 401 invalida la sesión local: la guarda de rutas desmonta la
        // pantalla y, tras el login, vuelve a montarla y a lanzar sus consultas.
        if (reason === "expired") clearSession();
        setState({ open: true, reason });
      }),
    [clearSession]
  );

  const close = useCallback(() => {
    setState((prev) => (prev.open ? { ...prev, open: false } : prev));
    notifyAuthModalClosed();
  }, []);

  const openLogin = useCallback((reason: LoginReason = "login") => {
    requestAuthModal(reason);
  }, []);

  const openProfile = useCallback(() => {
    requestAuthModal("profile");
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close]
  );

  const handleLoginSuccess = useCallback(() => {
    // La guarda de rutas vuelve a montar la página cuando `isLoggedIn` pasa a
    // true, así que sus `useEffect` reejecutan las consultas sin recargar.
    close();
  }, [close]);

  const handleLogoutSuccess = useCallback(() => {
    // Tras cerrar sesión el modal sigue abierto, ahora en modo login.
    requestAuthModal("login");
  }, []);

  const value = useMemo(
    () => ({ openLogin, openProfile }),
    [openLogin, openProfile]
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthDialog
        open={state.open}
        reason={state.reason}
        onOpenChange={handleOpenChange}
        onLoginSuccess={handleLoginSuccess}
        onLogoutSuccess={handleLogoutSuccess}
      />
    </AuthModalContext.Provider>
  );
};

export const useAuthModal = (): AuthModalContextValue => {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error("useAuthModal debe usarse dentro de AuthModalProvider");
  }
  return context;
};
