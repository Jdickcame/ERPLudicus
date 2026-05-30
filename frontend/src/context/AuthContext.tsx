import { jwtDecode } from "jwt-decode";
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // 1. IMPORTAMOS NAVIGATE

interface UserPayload {
  user_id: number;
  email: string;
  role: string;
  branch_id?: number;
  is_superuser?: boolean;
  exp: number;
  permissions: any; // Acortado por espacio, deja el tuyo
}

interface AuthContextType {
  user: UserPayload | null;
  login: (tokens: { access: string; refresh: string }) => void;
  logout: (targetRoute?: string) => Promise<void>; // Le agregamos Promise<void>
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // 3. INICIALIZAMOS NAVIGATE

  const safeDecode = (token: string): UserPayload | null => {
    try {
      return jwtDecode<UserPayload>(token);
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      const decoded = safeDecode(token);
      if (decoded && decoded.exp * 1000 > Date.now()) {
        setUser(decoded);
      } else {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setUser(null);
      }
    }
    setLoading(false);

    // 1. EL ESCUCHADOR DE AXIOS
    const handleForceLogout = () => {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");

      // Viajamos primero
      if (window.location.hash.includes("/pos")) {
        navigate("/pos-login", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }

      // Borramos al usuario un instante DESPUÉS para ganar la carrera
      setTimeout(() => {
        setUser(null);
      }, 50);
    };

    window.addEventListener("force_logout", handleForceLogout);
    return () => window.removeEventListener("force_logout", handleForceLogout);
  }, [navigate]);

  const login = (tokens: { access: string; refresh: string }) => {
    localStorage.setItem("access_token", tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    setUser(safeDecode(tokens.access));
  };

  // 2. EL LOGOUT
  const logout = async (targetRoute?: string) => {
    // 2. Limpieza de LocalStorage
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    // 🌟 3. DETECCIÓN AUTOMÁTICA DE ENTORNO 🌟
    // Si no me envían una ruta, reviso dónde estoy parado.
    let finalRoute = targetRoute;
    if (!finalRoute) {
      const currentUrl = window.location.href; // Lee todo, sea web normal o hash router
      if (currentUrl.includes("/pos")) {
        finalRoute = "/pos-login"; // Si estoy en la caja, me quedo en la caja
      } else {
        finalRoute = "/login"; // Si estoy en el ERP administrativo, voy al ERP
      }
    }

    // 4. Navegación Nativa
    const isDesktopOrHash =
      window.location.href.includes("file://") ||
      window.location.hash.length > 0;

    if (isDesktopOrHash) {
      window.location.hash = finalRoute;
    } else {
      window.location.pathname = finalRoute;
    }

    // 5. Recarga forzada
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, loading, isAuthenticated: !!user }}
    >
      {loading ? (
        <div className="h-screen flex items-center justify-center bg-slate-100">
          <div className="text-slate-500 animate-pulse">Cargando sesión...</div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth...");
  return context;
};
