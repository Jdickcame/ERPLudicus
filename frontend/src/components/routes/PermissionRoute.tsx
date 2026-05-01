import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface PermissionRouteProps {
  // 👇 AQUÍ AGREGAMOS "cash" PARA QUE TYPESCRIPT LO ACEPTE
  module: "sales" | "inventory" | "purchases" | "users" | "cash";
}

const PermissionRoute = ({ module }: PermissionRouteProps) => {
  const { user } = useAuth();

  // 1. REGLA DE ORO: Si es Admin o Superuser, tiene pase VIP a todo.
  if (user?.role === "ADMIN" || user?.is_superuser) {
    return <Outlet />;
  }

  // 2. PERMISO GRANULAR: Verificamos si tiene el permiso específico activado.
  // IMPORTANTE: Asegúrate de que tu usuario tenga el permiso 'cash' en la base de datos
  // o que la interfaz User en AuthContext también tenga 'cash?: boolean'.
  if (user?.permissions?.[module]) {
    return <Outlet />;
  }

  // 3. BLOQUEO: Si no cumple nada, lo mandamos al Dashboard.
  return <Navigate to="/dashboard" replace />;
};

export default PermissionRoute;
