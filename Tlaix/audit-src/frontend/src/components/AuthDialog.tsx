import React, { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthModalReason } from "@/lib/auth-modal";

interface AuthDialogProps {
  open: boolean;
  reason: AuthModalReason;
  onOpenChange: (open: boolean) => void;
  onLoginSuccess: () => void;
  onLogoutSuccess: () => void;
}

/**
 * Modal único de autenticación: login, aviso de sesión expirada y perfil.
 * Se abre desde la cabecera y desde el interceptor global (401).
 */
export const AuthDialog: React.FC<AuthDialogProps> = ({
  open,
  reason,
  onOpenChange,
  onLoginSuccess,
  onLogoutSuccess,
}) => {
  const { isLoggedIn, user, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const showProfile = reason === "profile" && isLoggedIn && !!user;
  const showExpiredNotice = reason === "expired" && !showProfile;
  const showRequiredNotice = reason === "required" && !showProfile;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const success = await login({ email, password });
      if (success) {
        setEmail("");
        setPassword("");
        onLoginSuccess();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const success = await logout();
      if (success) onLogoutSuccess();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            {showProfile ? "Perfil de Usuario" : "Iniciar Sesión"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {showProfile
              ? "Datos de la cuenta y opción para cerrar sesión."
              : "Introduce tu correo y contraseña para acceder."}
          </DialogDescription>
        </DialogHeader>

        {showExpiredNotice && (
          <div
            role="status"
            className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            Tu sesión expiró. Inicia sesión de nuevo.
          </div>
        )}

        {showRequiredNotice && (
          <p className="text-sm text-muted-foreground text-center">
            Inicia sesión para continuar.
          </p>
        )}

        {showProfile ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">
                Nombre de usuario
              </p>
              <p className="text-lg font-medium p-3 bg-muted rounded-md border">
                {user.username}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">
                Correo electrónico
              </p>
              <p className="text-lg font-medium p-3 bg-muted rounded-md border">
                {user.email || "No proporcionado"}
              </p>
            </div>
            <Button
              variant="destructive"
              className="w-full flex items-center gap-2 mt-4 py-6 text-lg"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="w-5 h-5" />
              {isLoggingOut ? "Cerrando sesión..." : "Cerrar Sesión"}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="auth-email">Correo electrónico</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="py-6 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Contraseña</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="py-6 text-base"
              />
            </div>
            <Button
              type="submit"
              className="w-full mt-4 py-6 text-lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Iniciando sesión..." : "Iniciar Sesión"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
