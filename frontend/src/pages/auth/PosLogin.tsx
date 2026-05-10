import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios"; // 👈 Descomenta cuando conectemos el backend
import PinPad from "../../components/common/PinPad";
import { useAuth } from "../../context/AuthContext"; // 👈 Para guardar la sesión

const PosLogin = () => {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { login } = useAuth(); // 👈 2. Sacas la función login de tu contexto

  const handlePinSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post("/users/pos-login/", { pin });

      // 👇 3. EN LUGAR DEL LOCALSTORAGE, USAMOS TU FUNCIÓN DEL CONTEXTO
      login({
        access: response.data.access,
        refresh: response.data.refresh,
      });

      navigate("/pos");
    } catch (err: any) {
      setError(
        err.response?.data?.error || "PIN incorrecto. Intente nuevamente.",
      );
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex flex-col items-center justify-center p-4 selection:bg-transparent">
      {/* Logo o Nombre de la Empresa */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black text-white tracking-tight">
          LÚDICUS <span className="text-blue-500">POS</span>
        </h1>
        <p className="text-slate-400 mt-2 font-medium">
          Terminal de Ventas Rápidas
        </p>
      </div>

      {/* Tarjeta del Teclado */}
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm relative overflow-hidden">
        {/* Barra de estado decorativa */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-cyan-400"></div>

        {error && (
          <div className="mb-2 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg font-medium text-center animate-in shake">
            {error}
          </div>
        )}

        <div
          className={
            loading ? "opacity-50 pointer-events-none transition-opacity" : ""
          }
        >
          <PinPad
            pin={pin}
            setPin={(newPin) => {
              setError(null); // Borra el error al empezar a escribir
              setPin(newPin);
            }}
            onSubmit={handlePinSubmit}
            maxLength={6}
            title="Bienvenido"
            subtitle="Ingresa tu PIN de acceso"
          />
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        )}
      </div>

      {/* Pie de página (Versión, Sucursal, etc.) */}
      <div className="mt-8 text-slate-500 text-xs font-medium flex gap-4">
        <span>Terminal 01</span>
        <span>•</span>
        <span>v1.0.0</span>
      </div>
    </div>
  );
};

export default PosLogin;
