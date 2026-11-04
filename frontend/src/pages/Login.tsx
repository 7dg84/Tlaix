import { Navigate, useSearchParams } from "react-router-dom";
import { sanitizeReturnTo } from "@/lib/auth";

/**
 * La ruta `/login` se conserva solo para enlaces antiguos.
 * El formulario real vive en el modal global; al entrar aquí se vuelve a la
 * ruta solicitada y, si no hay sesión, `ProtectedRoute` abre el modal.
 */
const Login = () => {
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get("returnTo"));

  return <Navigate to={returnTo} replace />;
};

export default Login;
