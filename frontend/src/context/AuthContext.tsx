import React, { createContext, useState, useEffect, useContext } from 'react';
import { toast } from 'react-hot-toast';
import { loginApi, logoutApi, registerApi, recoverApi, getCurrentUser } from '../api/users';
import { isAuthError } from '../lib/auth';

export interface AuthUser {
    id?: string | number;
    username: string;
    email?: string;
    [key: string]: unknown;
}

export interface LoginPayload {
    email: string;
    password: string;
}

export interface RegisterPayload {
    username: string;
    email: string;
    password: string;
}

export interface RecoverPayload {
    email: string;
}

export interface AuthContextValue {
    isLoggedIn: boolean;
    /** `false` hasta que la sonda `getCurrentUser()` termina: evita redirigir antes de saber si hay cookie. */
    isAuthReady: boolean;
    user: AuthUser | null;
    login: (payload: LoginPayload) => Promise<boolean>;
    logout: () => Promise<boolean>;
    register: (payload: RegisterPayload) => Promise<boolean>;
    recover: (payload: RecoverPayload) => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);

    // Check if user is logged in on mount via HTTPOnly cookie
    useEffect(() => {
        let mounted = true;
        const checkUser = async () => {
            try {
                const res = await getCurrentUser();
                if (!mounted) return;
                if (res?.data) {
                    setIsLoggedIn(true);
                    setUser(res.data);
                    localStorage.setItem('username', res.data.username);
                }
            } catch {
                // Not logged in or error; ensure state cleared
                if (!mounted) return;
                setIsLoggedIn(false);
                setUser(null);
                localStorage.removeItem('username');
            } finally {
                if (mounted) setIsAuthReady(true);
            }
        };
        checkUser();
        return () => { mounted = false };
    }, []);

    const login = async ({ email, password }: LoginPayload): Promise<boolean> => {
        try {
            const res = await loginApi({ email, password }); // axios POST with credentials
            // Backend returns user object; cookie set via Set-Cookie HTTPOnly
            const loggedUser: AuthUser | undefined = res.data?.user || res.data;
            if (!loggedUser) {
                toast.error('No se pudo verificar la sesión');
                return false;
            }
            localStorage.setItem('username', loggedUser.username);
            setIsLoggedIn(true);
            setUser(loggedUser);
            toast.success('Inicio de sesión correcto');
            return true;
        } catch (err) {
            if (err.response) {
                const { status, data: respData } = err.response;
                if (status === 404) toast.error('Usuario no encontrado');
                else if (status === 401) toast.error('Credenciales incorrectas');
                else if (status === 400) {
                    // posible objeto de validación: { email: ["..."], password: ["..."] }
                    if (typeof respData === 'object') {
                        const msgs = Object.values(respData).flat().join(' - ');
                        toast.error(msgs || 'Error de validación (400)');
                    } else {
                        toast.error(respData?.message || 'Solicitud inválida (400)');
                    }
                } else {
                    toast.error(respData?.message || `Error del servidor (${status})`);
                }
            } else {
                toast.error('Error de red o sin respuesta del servidor');
            }
            console.error(
                'Error al iniciar sesión. Status:',
                err?.response?.status ?? 'sin respuesta'
            );
            return false;
        }
    };

    const logout = async (): Promise<boolean> => {
        try {
            await logoutApi(); // No need to pass token, it's in cookies
        } catch (error) {
            // Si la cookie sigue viva no fingimos un cierre que no ocurrió
            if (!isAuthError(error)) {
                const status =
                    (error as { response?: { status?: number } })?.response?.status ??
                    'sin respuesta';
                console.error('Error al cerrar sesión. Status:', status);
                toast.error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
                return false;
            }
            // Un 401 significa que la sesión ya no existe en el backend
        }

        setIsLoggedIn(false);
        setUser(null);
        localStorage.removeItem('username');
        return true;
    };

    const register = async (data: RegisterPayload): Promise<boolean> => {
        try {
            await registerApi(data);
            toast.success('Cuenta creada exitosamente Ya puedes iniciar sesión');
            return true;
        } catch (err) {
            if (err.response) {
                const { status, data: respData } = err.response;
                if (status === 404) toast.error('Error 404');
                else if (status === 401) toast.error('Error 401');
                else if (status === 400) {
                    // posible objeto de validación: { email: ["..."], password: ["..."] }
                    if (typeof respData === 'object') {
                        const msgs = "Error en:\n" + Object.keys(respData).flat().join(' - ') + '\n' + Object.values(respData).flat().join(' - ')
                        toast.error(msgs || 'Error de validación (400)');
                    } else {
                        toast.error(respData?.message || 'Solicitud inválida (400)');
                    }
                } else {
                    toast.error(respData?.message || `Error del servidor (${status})`);
                }
            } else {
                toast.error('Error de red o sin respuesta del servidor');
            }
            console.error(
                'Error al registrar la cuenta. Status:',
                err?.response?.status ?? 'sin respuesta'
            );
            return false;
        }
    }

    const recover = async (data: RecoverPayload): Promise<boolean> => {
        try {
            await recoverApi(data); // axios POST

            toast.success('Correo de recuperación enviado');

            return true;
        } catch (err) {
            if (err.response) {
                const { status, data: respData } = err.response;
                if (status === 404) toast.error('Usuario no encontrado');
                else if (status === 401) toast.error('Credenciales incorrectas');
                else if (status === 400) {
                    // posible objeto de validación: { email: ["..."], password: ["..."] }
                    if (typeof respData === 'object') {
                        const msgs = Object.values(respData).flat().join(' - ');
                        toast.error(msgs || 'Error de validación (400)');
                    } else {
                        toast.error(respData?.message || 'Solicitud inválida (400)');
                    }
                } else {
                    toast.error(respData?.message || `Error del servidor (${status})`);
                }
            } else {
                toast.error('Error de red o sin respuesta del servidor');
            }
            console.error(
                'Error al solicitar la recuperación. Status:',
                err?.response?.status ?? 'sin respuesta'
            );
            return false;
        }
    }

    return (
        <AuthContext.Provider value={{ isLoggedIn, isAuthReady, user, login, logout, register, recover }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de AuthProvider');
    }
    return context;
};
