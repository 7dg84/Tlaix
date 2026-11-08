import axios from 'axios';
import { API_BASE_URL } from './config';
import { shouldOpenLoginModal } from '../lib/auth';
import { requestAuthModal } from '../lib/auth-modal';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Habilita el envío automático del auth_token en cookies
});

/**
 * Cualquier 401 de un endpoint autenticado significa sesión expirada:
 * se abre el modal global de login sin salir de la ruta actual.
 * Los endpoints de autenticación quedan excluidos para que las credenciales
 * inválidas se muestren en el propio formulario.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    const hasWindow = typeof window !== 'undefined';

    if (
      hasWindow &&
      shouldOpenLoginModal({
        status,
        url,
        pathname: window.location.pathname,
      })
    ) {
      error.isAuthRedirect = true;
      requestAuthModal('expired');
    }

    return Promise.reject(error);
  }
);
