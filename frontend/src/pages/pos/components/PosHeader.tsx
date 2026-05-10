import {
  ArrowLeft,
  Banknote,
  BarChart3,
  FileText,
  Lock,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const PosHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const handleLock = () => {
    logout();
    navigate("/pos-login");
  };

  const handleBackToERP = () => {
    navigate("/dashboard");
  };

  return (
    <>
      {/* BARRA SUPERIOR DEL POS */}
      <header className="bg-slate-900 text-white p-3 flex justify-between items-center shadow-md select-none">
        <div
          className="flex items-center gap-4 cursor-pointer"
          onClick={() => navigate("/pos")}
        >
          <button
            onClick={(e) => {
              e.stopPropagation(); // Evita que el click del logo se dispare
              setIsMenuOpen(true);
            }}
            className="p-2 hover:bg-slate-800 rounded-lg transition active:scale-95"
          >
            <Menu size={28} />
          </button>
          <div>
            <h1 className="text-lg font-black tracking-wider text-blue-400">
              LÚDICUS POS
            </h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">
              Terminal 01
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold">
              {user?.email?.split("@")[0] || "Cajero"}
            </p>
            <p className="text-[10px] text-slate-400 uppercase">{user?.role}</p>
          </div>

          <button
            onClick={handleLock}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 px-4 py-2 rounded-lg font-bold text-sm transition shadow-sm"
          >
            <Lock size={18} />
            <span className="hidden sm:inline">BLOQUEAR</span>
          </button>
        </div>
      </header>

      {/* MODAL DEL MENÚ TÁCTIL */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-slate-50 h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center shadow-md">
              <h2 className="text-xl font-bold">Menú de Caja</h2>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
              {/* Historial */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/pos/history");
                }}
                className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition text-left group"
              >
                <div className="bg-blue-100 text-blue-600 p-3 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    Historial de Ventas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ver y anular ventas de tu turno
                  </p>
                </div>
              </button>

              {/* Botón de Gestión de Caja */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/pos/cash");
                }}
                className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-500 hover:shadow-md transition text-left group"
              >
                <div className="bg-emerald-100 text-emerald-600 p-3 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Banknote size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Gestión de Caja</h3>
                  <p className="text-xs text-slate-500">
                    Arqueos, ingresos y retiros
                  </p>
                </div>
              </button>

              {/* Botón de Reportes X */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/pos/reports");
                }}
                className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-purple-500 hover:shadow-md transition text-left group"
              >
                <div className="bg-purple-100 text-purple-600 p-3 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    Reporte X (Turno)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ventas por hora, Bruto y Neto
                  </p>
                </div>
              </button>

              <hr className="my-2 border-slate-200" />

              {/* Volver al ERP */}
              {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
                <button
                  onClick={handleBackToERP}
                  className="flex items-center gap-4 p-4 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition shadow-md text-left"
                >
                  <ArrowLeft size={24} />
                  <div>
                    <h3 className="font-bold">Volver al ERP</h3>
                    <p className="text-xs text-slate-300">
                      Salir del modo Punto de Venta
                    </p>
                  </div>
                </button>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200">
              <button
                onClick={handleLock}
                className="w-full flex items-center justify-center gap-2 p-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition border border-red-200"
              >
                <LogOut size={20} />
                CERRAR SESIÓN
              </button>
            </div>
          </div>

          <div className="flex-1" onClick={() => setIsMenuOpen(false)}></div>
        </div>
      )}
    </>
  );
};

export default PosHeader;
