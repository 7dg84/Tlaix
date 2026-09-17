import React, { createContext, useState, useEffect, useContext } from 'react';
import { toast } from 'react-hot-toast';
import { loginApi, logoutApi, registerApi, recoverApi, getCurrentUser } from '../api/users'

export const AuthContext = createContext({
    isLoggedIn: false,
    user: null as any,
    login: (payload: { email: string, password: any }) => { succes: Boolean },
    logout: () => { },
    register: (payload: { username: string, email: string, password: string }) => { succes: Boolean },
    recover: (payload: { email: string }) => { succes: Boolean }
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState<any>(null);

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
            } catch (err) {
                // Not logged in or error; ensure state cleared
                setIsLoggedIn(false);
                setUser(null);
                localStorage.removeItem('username');
            }
        };
        checkUser();
        return () => { mounted = false };
    }, []);

    const login = async (data: []) => {
        try {
            const res = await loginApi(data); // axios POST with credentials
            // Backend returns user object; cookie set via Set-Cookie HTTPOnly
            const user = res.data.user || res.data;
            console.log(user);
            if (user) {
                localStorage.setItem('username', user.username);
                setIsLoggedIn(true);
                setUser(user);
            }
            toast.success('Inicio de sesión correcto');
            return true;
        } catch (err: any) {
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
            console.error(err);
            return false;
        }
    };

    const logout = async () => {
        try {
            await logoutApi(); // No need to pass token, it's in cookies
            setIsLoggedIn(false)
            localStorage.removeItem('username');
            setUser(null);
            // Cookie is deleted automatically by backend
        } catch (error) {
            toast.error('Error en el cierre de sesion.')
            console.error('Error during logout:', error);
        }
    };

    const register = async (data: []) => {
        try {
            const res = await registerApi(data);
            toast.success('Cuenta creada exitosamente Ya puedes iniciar sesión');
            return true;
        } catch (err: any) {
            if (err.response) {
                const { status, data: respData } = err.response;
                if (status === 404) toast.error('Error 404');
                else if (status === 401) toast.error('Error 401');
                else if (status === 400) {
                    // posible objeto de validación: { email: ["..."], password: ["..."] }
                    if (typeof respData === 'object') {
                        let msgs = "Error en:\n" + Object.keys(respData).flat().join(' - ') + '\n' + Object.values(respData).flat().join(' - ')
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
            console.error(err)
        }
        return false;
    }

    const recover = async (data: []) => {
        try {
            const res = await recoverApi(data); // axios POST

            toast.success('Correo de recuperacion enviado');

            return true;
        } catch (err: any) {
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
            console.error(err);
        }
        return false;
    }

    return (
        <AuthContext.Provider value={{ isLoggedIn, user, login, logout, register, recover }}>
            {children}
        </AuthContext.Provider>
    );


};
export const useAuth = () => {
    return useContext(AuthContext);
}