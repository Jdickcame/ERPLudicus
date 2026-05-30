import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import PinPad from "../../components/common/PinPad";
import { useAuth } from "../../context/AuthContext";

const PosLogin = () => {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const from = location.state?.from?.pathname || "/pos";

  const handlePinSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post("/users/pos-login/", { pin });

      login({
        access: response.data.access,
        refresh: response.data.refresh,
      });

      localStorage.setItem("current_user_id", response.data.user.id.toString());
      navigate(from, { replace: true });
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
    // h-screen y overflow-hidden bloquean cualquier scroll no deseado
    <div className="h-screen w-full bg-slate-900 flex flex-col md:flex-row overflow-hidden selection:bg-transparent font-sans">
      {/* PANÉL IZQUIERDO: Branding (Vertical en móvil, Lateral en tablet) */}
      <div className="w-full md:w-5/12 lg:w-1/3 flex flex-col items-center md:items-start justify-center p-6 md:p-12 relative shrink-0">
        {/* Luces decorativas de fondo sutiles */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-600 rounded-full mix-blend-screen filter blur-[80px] opacity-30"></div>
          <div className="absolute bottom-10 -right-10 w-48 h-48 bg-cyan-500 rounded-full mix-blend-screen filter blur-[60px] opacity-20"></div>
        </div>

        <div className="z-10 text-center md:text-left w-full">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none mb-2">
            LÚDICUS <br className="hidden md:block" />
            <span className="text-blue-500">POS</span>
          </h1>
          <p className="text-slate-400 font-medium text-sm md:text-base mb-4 md:mb-0">
            Terminal de Ventas Rápidas
          </p>
        </div>

        {/* Pie de página movido a la esquina inferior izquierda en tablets */}
        <div className="hidden md:flex absolute bottom-8 left-12 text-slate-500 text-xs font-bold gap-4 uppercase tracking-widest">
          <span>Terminal 01</span>
          <span>•</span>
          <span>v1.0.0</span>
        </div>
      </div>

      {/* PANÉL DERECHO: Tarjeta de Login (Fondo claro curvo) */}
      <div className="flex-1 bg-slate-100 rounded-t-[40px] md:rounded-none md:rounded-l-[40px] flex flex-col items-center justify-center p-4 md:p-6 shadow-[-10px_0_30px_rgba(0,0,0,0.3)] relative z-10">
        {/* Contenedor estricto del Teclado para evitar que crezca de más */}
        <div className="w-full max-w-[340px] bg-white rounded-3xl shadow-xl p-6 md:p-8 relative overflow-hidden border border-slate-200">
          {/* Barra superior decorativa */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 to-cyan-400"></div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-xl font-bold text-center animate-in zoom-in duration-200">
              {error}
            </div>
          )}

          {/* Efecto de "hundimiento" al cargar en lugar de un simple blur */}
          <div
            className={`transition-all duration-300 origin-center ${
              loading
                ? "opacity-40 pointer-events-none scale-[0.97]"
                : "scale-100"
            }`}
          >
            <PinPad
              pin={pin}
              setPin={(newPin) => {
                setError(null);
                setPin(newPin);
              }}
              onSubmit={handlePinSubmit}
              maxLength={6}
              title="Bienvenido"
              subtitle="Ingresa tu PIN de acceso"
            />
          </div>

          {/* Nuevo Spinner flotante más profesional */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10">
              <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-100 flex flex-col items-center gap-3 animate-in zoom-in-95">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600"></div>
                <span className="text-slate-700 font-black text-xs tracking-widest uppercase">
                  Conectando...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Pie de página visible solo en móviles (vertical) */}
        <div className="md:hidden mt-auto pt-6 text-slate-400 text-[10px] font-bold flex gap-4 uppercase tracking-widest">
          <span>Terminal 01</span>
        </div>
      </div>
    </div>
  );
};

export default PosLogin;
