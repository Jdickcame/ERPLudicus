import { jwtDecode } from "jwt-decode";
import { createContext, useContext, useEffect, useState } from "react";

// Definición de tipos
interface UserPayload {
  user_id: number;
  email: string;
  role: string;
  branch_id?: number;
  is_superuser?: boolean;
  exp: number;

  // 👇 ASÍ DEBE LUCIR AHORA PARA COINCIDIR CON TU BACKEND
  permissions: {
    users: boolean;
    cash: boolean;
    sales: {
      pos: boolean;
      list: boolean;
    };
    inventory: {
      list: boolean;
      create: boolean;
    };
    purchases: {
      create: boolean;
      list: boolean;
      payable: boolean;
      balances: boolean;
      suppliers: boolean;
      budgets: boolean;
    };
  };
}

interface AuthContextType {
  user: UserPayload | null;
  login: (tokens: { access: string; refresh: string }) => void;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Función auxiliar para decodificar con seguridad
  const safeDecode = (token: string): UserPayload | null => {
    try {
      return jwtDecode<UserPayload>(token);
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    // 1. Al cargar la app, buscamos el token
    const token = localStorage.getItem("access_token");

    if (token) {
      const decoded = safeDecode(token);

      // Validamos si existe y si no ha expirado
      if (decoded && decoded.exp * 1000 > Date.now()) {
        console.log("✅ Sesión restaurada:", decoded.email);
        setUser(decoded);
      } else {
        console.warn("⚠️ Token expirado o inválido al inicio. Limpiando.");
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setUser(null);
      }
    }

    setLoading(false);
  }, []);

  const login = (tokens: { access: string; refresh: string }) => {
    localStorage.setItem("access_token", tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);

    const decoded = safeDecode(tokens.access);
    setUser(decoded);
  };

  const logout = () => {
    console.log("👋 Cerrando sesión...");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    // Redirigir fuera
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        isAuthenticated: !!user,
      }}
    >
      {/* Bloqueamos la renderización de la App hasta saber si hay usuario o no.
         Esto evita que el Dashboard intente cargar datos antes de tiempo.
      */}
      {loading ? (
        <div className="h-screen w-full flex items-center justify-center bg-slate-100">
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
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
};
