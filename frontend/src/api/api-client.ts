import axios from 'axios';
import { API_BASE_URL } from './config';
import {
  buildLoginPath,
  buildReturnTo,
  shouldRedirectToLogin,
} from '../lib/auth';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Habilita el envío automático del auth_token en cookies
});

// Guarda anti-bucle: una sola redirección al login por carga de página
let isRedirectingToLogin = false;

/**
 * Cualquier 401 de un endpoint autenticado significa sesión expirada:
 * se muestra el login de inmediato conservando la ruta solicitada.
 * Los endpoints de autenticación y la propia pantalla de login quedan excluidos
 * para que las credenciales inválidas se muestren en el formulario.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    const hasWindow = typeof window !== 'undefined';

    if (
      hasWindow &&
      shouldRedirectToLogin({
        status,
        url,
        pathname: window.location.pathname,
        alreadyRedirecting: isRedirectingToLogin,
      })
    ) {
      isRedirectingToLogin = true;
      error.isAuthRedirect = true;

      const returnTo = buildReturnTo(window.location);

      // Recarga completa: limpia el estado en memoria y muestra el login de inmediato
      window.location.assign(buildLoginPath(returnTo, true));
    }

    return Promise.reject(error);
  }
);
