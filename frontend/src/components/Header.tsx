import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackLink?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, showBackLink }) => {
  const { isLoggedIn, user, login, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const success = await login({ email, password } as any);
      if (success) {
        setIsOpen(false);
        setEmail('');
        setPassword('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  return (
    <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="container mx-auto px-4 py-6 flex justify-between items-center">
        <div>
          {showBackLink && (
            <Link to="/" className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al menú
            </Link>
          )}
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {title}
          </h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {/* Botón de Perfil / Iniciar sesión */}
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 border-primary/20 hover:border-primary/50 transition-colors">
                <User className="w-5 h-5 text-primary" />
                {isLoggedIn && user ? (
                  <span className="font-semibold hidden sm:inline-block max-w-[150px] truncate">{user.username}</span>
                ) : (
                  <span className="hidden sm:inline-block">Iniciar Sesión</span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">

              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-center">
                  {isLoggedIn ? 'Perfil de Usuario' : 'Iniciar Sesión'}
                </DialogTitle>
              </DialogHeader>

              {isLoggedIn && user ? (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">Nombre de usuario</p>
                    <p className="text-lg font-medium p-3 bg-muted rounded-md border">{user.username}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">Correo electrónico</p>
                    <p className="text-lg font-medium p-3 bg-muted rounded-md border">{user.email || 'No proporcionado'}</p>
                  </div>
                  <Button variant="destructive" className="w-full flex items-center gap-2 mt-4 py-6 text-lg" onClick={handleLogout}>
                    <LogOut className="w-5 h-5" />
                    Cerrar Sesión
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo electrónico</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="py-6 text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="py-6 text-base"
                    />
                  </div>
                  <Button type="submit" className="w-full mt-4 py-6 text-lg" disabled={isSubmitting}>
                    {isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
};
