import { Capacitor } from "@capacitor/core";
import {
  Banknote,
  BarChart3,
  Clock,
  FileText,
  Lock,
  LogOut,
  Menu,
  Printer,
  Settings,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { BluetoothPrinter } from "../../../utils/BluetoothPrinter";
import PrinterConfig from "./PrinterConfig";
import SyncWorker from "./SyncWorker";

// 🌟 MINI-COMPONENTE AISLADO PARA RENDIMIENTO EN IMIN (VERSIÓN DEFINITIVA Y ANTI-BUGS) 🌟
const ClockWidget = ({ isAndroid }: { isAndroid: boolean }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. LÓGICA MANUAL A PRUEBA DE BALAS (Ignoramos el bug de Android con el "00")
  let hours = time.getHours();
  const isPM = hours >= 12;
  const ampm = isPM ? "P. M." : "A. M.";

  // Convertimos formato 24h a 12h
  hours = hours % 12;
  hours = hours ? hours : 12; // La magia: Si hours es 0, lo convierte obligatoriamente en 12

  // Agregamos el cero a la izquierda si es un solo dígito (Ej: "09")
  const hh = hours.toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");
  const ss = time.getSeconds().toString().padStart(2, "0");

  // 2. Colores condicionales
  const iconColor = isAndroid ? "text-pink-500" : "text-cyan-500";
  const mainColor = isAndroid ? "text-pink-400" : "text-cyan-400";
  const subColor = isAndroid ? "text-pink-600" : "text-cyan-600";

  return (
    <div className="flex items-center gap-2.5 bg-black/40 px-4 py-1.5 rounded-xl border border-slate-700/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] shrink-0">
      <Clock size={20} className={`${iconColor} shrink-0`} />

      <div
        className="flex items-baseline justify-center whitespace-nowrap select-none"
        style={{ fontFamily: "'RelojDigital', monospace" }}
      >
        <div
          className={`flex items-center justify-center text-[22px] tracking-wider leading-none ${mainColor}`}
        >
          {/* Horas */}
          <span className="w-[40px] text-center inline-block shrink-0">
            {hh}
          </span>

          {/* Primer separador */}
          <span className="w-[14px] text-center inline-block shrink-0 opacity-80 pb-0.5">
            :
          </span>

          {/* Minutos */}
          <span className="w-[40px] text-center inline-block shrink-0">
            {mm}
          </span>

          {/* Segundo separador (Empujado con ml-1 para que no se pegue) */}
          <span className="w-[14px] text-center inline-block shrink-0 opacity-80 pb-0.5 ml-1">
            :
          </span>

          {/* Segundos */}
          <span className="w-[40px] text-center inline-block shrink-0">
            {ss}
          </span>
        </div>
        <span
          className={`text-[12px] font-black ml-2 mb-0.5 leading-none ${subColor}`}
        >
          {ampm}
        </span>
      </div>
    </div>
  );
};

const PosHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [isPrinterConfigOpen, setIsPrinterConfigOpen] = useState(false);

  // 📱 DETECTOR DE HARDWARE
  const isAndroid = Capacitor.getPlatform() === "android";

  useEffect(() => {
    let isMounted = true;

    const autoConnectPrinter = async () => {
      // 1. Solo intentamos conectar si estamos en la tablet iMin
      if (!isAndroid) return;

      // 2. Buscamos si el cajero ya había guardado una impresora antes
      const savedMac = localStorage.getItem("impresora_mac");
      if (!savedMac) return; // Si es nueva la tablet, no hace nada.

      try {
        // 3. Verificamos si mágicamente ya está conectada
        const isConnected = await BluetoothPrinter.isDeviceConnected();

        if (!isConnected && isMounted) {
          // 4. Intentamos forzar la reconexión en silencio
          await BluetoothPrinter.connect(savedMac);
          toast.success("🖨️ Impresora conectada y lista.");
        }
      } catch (error) {
        console.error("Error auto-conectando impresora:", error);
        if (isMounted) {
          toast.error("⚠️ No se pudo reconectar la impresora.");
        }
      }
    };

    // Le damos 2 segundos de respiro a la app antes de intentar conectar
    const timeoutId = setTimeout(() => {
      autoConnectPrinter();
    }, 2000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isAndroid]);

  const isManager =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  const handleLock = () => {
    logout("/pos-login");
  };

  // 🎨 CLASES DINÁMICAS (Solo aplica hover si no es Android/iMin)
  const hoverNavBtn = !isAndroid ? "hover:bg-slate-800" : "";
  const hoverRedBtn = !isAndroid ? "hover:bg-red-700" : "";

  return (
    <>
      <header className="bg-slate-900 text-white p-2.5 flex justify-between items-center shadow-md select-none relative z-40">
        {/* 🌟 LADO IZQUIERDO: Branding + Menú + RELOJ 🌟 */}
        <div
          className="flex items-center gap-3.5 cursor-pointer"
          onClick={() => navigate("/pos")}
        >
          <SyncWorker />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(true);
            }}
            className={`bg-transparent p-2 rounded-lg transition-all active:bg-slate-800 active:scale-95 ${hoverNavBtn}`}
          >
            <Menu size={28} />
          </button>

          <div>
            <h1 className="text-lg font-black tracking-wider text-blue-400 leading-none">
              LÚDICUS POS
            </h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1 leading-none">
              Terminal 01
            </p>
          </div>

          {/* 👇 EL RELOJ AHORA ESTÁ AQUÍ, SIEMPRE VISIBLE Y NO BAILA 👇 */}
          <ClockWidget isAndroid={isAndroid} />
        </div>

        {/* 🌟 LADO DERECHO: Usuario y Bloqueo 🌟 */}
        <div className="flex items-center gap-5">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold leading-tight">
              {user?.email?.split("@")[0] || "Cajero"}
            </p>
            <p className="text-[10px] text-slate-400 uppercase leading-none mt-1">
              {user?.role}
            </p>
          </div>

          <button
            onClick={handleLock}
            className={`flex items-center gap-2 bg-red-600 active:bg-red-800 active:scale-95 px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-sm ml-1 ${hoverRedBtn}`}
            title="Bloquear Caja (Cerrar Sesión)"
          >
            <Lock size={18} />
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
                className={`bg-transparent p-2 rounded-lg transition-all active:bg-slate-800 active:scale-95 ${hoverNavBtn}`}
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 p-4 flex flex-col space-y-3 overflow-y-auto custom-scrollbar">
              {/* AJUSTES DE IMPRESIÓN */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsPrinterConfigOpen(true);
                }}
                className={`flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl active:border-cyan-500 active:shadow-md transition-all text-left group ${
                  !isAndroid ? "hover:border-cyan-500 hover:shadow-md" : ""
                }`}
              >
                <div
                  className={`bg-cyan-100 text-cyan-600 p-3 rounded-lg group-active:bg-cyan-600 group-active:text-white transition-all relative ${
                    !isAndroid
                      ? "group-hover:bg-cyan-600 group-hover:text-white"
                      : ""
                  }`}
                >
                  <Printer size={24} />
                  <Settings
                    size={12}
                    className="absolute bottom-1 right-1 bg-white rounded-full text-cyan-600 p-[1px]"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    Ajustes de Impresión
                  </h3>
                  <p className="text-xs text-slate-500">
                    Vincular impresora Bluetooth
                  </p>
                </div>
              </button>

              {/* HISTORIAL */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/pos/history");
                }}
                className={`flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl active:border-blue-500 active:shadow-md transition-all text-left group ${
                  !isAndroid ? "hover:border-blue-500 hover:shadow-md" : ""
                }`}
              >
                <div
                  className={`bg-blue-100 text-blue-600 p-3 rounded-lg group-active:bg-blue-600 group-active:text-white transition-all ${
                    !isAndroid
                      ? "group-hover:bg-blue-600 group-hover:text-white"
                      : ""
                  }`}
                >
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

              {/* CAJA */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/pos/cash");
                }}
                className={`flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl active:border-emerald-500 active:shadow-md transition-all text-left group ${
                  !isAndroid ? "hover:border-emerald-500 hover:shadow-md" : ""
                }`}
              >
                <div
                  className={`bg-emerald-100 text-emerald-600 p-3 rounded-lg group-active:bg-emerald-600 group-active:text-white transition-all ${
                    !isAndroid
                      ? "group-hover:bg-emerald-600 group-hover:text-white"
                      : ""
                  }`}
                >
                  <Banknote size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Gestión de Caja</h3>
                  <p className="text-xs text-slate-500">
                    Arqueos, ingresos y retiros
                  </p>
                </div>
              </button>

              {/* REPORTES */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate("/pos/reports");
                }}
                className={`flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl active:border-purple-500 active:shadow-md transition-all text-left group ${
                  !isAndroid ? "hover:border-purple-500 hover:shadow-md" : ""
                }`}
              >
                <div
                  className={`bg-purple-100 text-purple-600 p-3 rounded-lg group-active:bg-purple-600 group-active:text-white transition-all ${
                    !isAndroid
                      ? "group-hover:bg-purple-600 group-hover:text-white"
                      : ""
                  }`}
                >
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

              {isManager && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    navigate("/pos/monitor");
                  }}
                  className={`flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl active:border-orange-500 active:shadow-md transition-all text-left group ${
                    !isAndroid ? "hover:border-orange-500 hover:shadow-md" : ""
                  }`}
                >
                  <div
                    className={`bg-orange-100 text-orange-600 p-3 rounded-lg group-active:bg-orange-600 group-active:text-white transition-all ${
                      !isAndroid
                        ? "group-hover:bg-orange-600 group-hover:text-white"
                        : ""
                    }`}
                  >
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Monitor Global</h3>
                    <p className="text-xs text-slate-500">
                      Ventas de todas las cajas del día
                    </p>
                  </div>
                </button>
              )}

              <hr className="my-2 border-slate-200" />

              {/* BOTÓN DE CERRAR SESIÓN */}
              <button
                onClick={handleLock}
                className="flex items-center gap-4 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl active:bg-red-100 active:scale-[0.98] transition-all text-left mt-auto"
              >
                <div className="bg-red-100 text-red-600 p-2 rounded-lg">
                  <LogOut size={24} />
                </div>
                <div>
                  <h3 className="font-bold">Cerrar Sesión</h3>
                  <p className="text-xs text-red-400">
                    Bloquear caja y salir del usuario
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="flex-1" onClick={() => setIsMenuOpen(false)}></div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN IMPRESORA */}
      {isPrinterConfigOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-transparent p-0 rounded-2xl shadow-2xl w-full max-w-md relative animate-in zoom-in-95">
            <button
              onClick={() => setIsPrinterConfigOpen(false)}
              className="absolute top-2 right-2 text-slate-400 active:text-slate-700 bg-white active:bg-slate-100 p-1.5 rounded-full transition-colors z-10 shadow-sm"
            >
              <X size={20} />
            </button>
            <PrinterConfig />
          </div>
        </div>
      )}
    </>
  );
};

export default PosHeader;
