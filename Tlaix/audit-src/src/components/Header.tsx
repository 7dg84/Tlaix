import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackLink?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, showBackLink }) => {
  const { isLoggedIn, user } = useAuth();
  const { openLogin, openProfile } = useAuthModal();

  const handleOpenAuth = () => {
    if (isLoggedIn && user) {
      openProfile();
      return;
    }
    openLogin('login');
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
          {/* Botón de Perfil / Iniciar sesión: abre el modal global */}
          <Button
            variant="outline"
            className="flex items-center gap-2 border-primary/20 hover:border-primary/50 transition-colors"
            onClick={handleOpenAuth}
          >
            <User className="w-5 h-5 text-primary" />
            {isLoggedIn && user ? (
              <span className="font-semibold hidden sm:inline-block max-w-[150px] truncate">
                {user.username}
              </span>
            ) : (
              <span className="hidden sm:inline-block">Iniciar Sesión</span>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};
