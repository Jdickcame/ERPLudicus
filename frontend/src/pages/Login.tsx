import { Loader2, Lock, Mail } from "lucide-react"; // 👈 1. Importamos Loader2
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false); // 2. Agregamos estado de carga

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const from = location.state?.from?.pathname || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); // Limpiamos errores anteriores
    setIsLoading(true); // 3. Activamos el modo "Cargando"

    try {
      const res = await api.post("/users/login/", { email, password });

      login({
        access: res.data.access,
        refresh: res.data.refresh,
      });

      // Si todo sale bien, navegamos. No necesitamos apagar el isLoading
      // porque el componente se va a desmontar al cambiar de página.
      navigate(from, { replace: true });
    } catch (err) {
      setError("Credenciales inválidas. Verifica tu correo y contraseña.");
      setIsLoading(false); // 4. Si hay error, apagamos el cargador para que intente de nuevo
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">KENSIS</h1>
          <p className="text-slate-500">Inicia sesión para continuar</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm text-center animate-in fade-in zoom-in duration-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail
                className={`absolute left-3 top-3 h-5 w-5 transition-colors ${isLoading ? "text-slate-300" : "text-slate-400"}`}
              />
              <input
                type="email"
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="admin@erp.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock
                className={`absolute left-3 top-3 h-5 w-5 transition-colors ${isLoading ? "text-slate-300" : "text-slate-400"}`}
              />
              <input
                type="password"
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {/* 5. EL BOTÓN INTELIGENTE */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg transition-all duration-200 ${
              isLoading
                ? "bg-blue-400 cursor-not-allowed shadow-inner"
                : "bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg active:scale-[0.98]"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Iniciando sesión...</span>
              </>
            ) : (
              <span>Ingresar</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
