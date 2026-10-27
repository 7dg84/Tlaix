import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { sanitizeReturnTo } from '@/lib/auth';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Evita que <Navigate> compita con la recarga completa tras autenticarse
  const [redirecting, setRedirecting] = useState(false);
  const [params] = useSearchParams();
  const { login, isLoggedIn, isAuthReady } = useAuth();

  // Ruta solicitada antes del 401 o del acceso directo sin sesión
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const expired = params.get('expired') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const success = await login({ email, password });
      if (success) {
        setRedirecting(true);
        // Recarga completa: reejecuta todas las consultas de la ruta solicitada
        window.location.assign(returnTo);
        return;
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  // Si ya hay sesión (por ejemplo, cookie válida), no mostramos el formulario
  if (isAuthReady && isLoggedIn && !redirecting) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded shadow">
        <h2 className="text-2xl font-semibold mb-6">Iniciar sesión</h2>

        {expired && (
          <div
            role="status"
            className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            Tu sesión expiró. Inicia sesión de nuevo.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block mb-2">Correo</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            required
          />

          <label className="block mb-2">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
