import {
  Banknote,
  Clock,
  CreditCard,
  Gift,
  Lock,
  RefreshCw,
  Tag,
  TrendingUp,
  Unlock,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";
import PosHeader from "./components/PosHeader";

interface DailyTotals {
  global_bruto: number;
  global_neto: number;
  cash: number;
  card: number;
  transfer: number;
  courtesies_value: number;
  courtesies_count: number;
  // 👇 Añadimos el campo que nos enviará Django
  discounts_value?: number;
}

interface Shift {
  id: number;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
  initial_balance: string;
  final_balance_real: string | null;
  expected_cash: number;
  expected_card: number;
  expected_transfer: number;
  user_name: string;
  register_name: string;
}

interface MonitorData {
  date: string;
  totals: DailyTotals;
  shifts: Shift[];
}

const AdminMonitor = () => {
  const { currentBranch } = useBranch();
  const { user } = useAuth();
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const isManager =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  const fetchMonitorData = async () => {
    if (!currentBranch || !isManager) return;
    setLoading(true);
    try {
      const res = await api.get(
        `/cash/shifts/daily_monitor/?branch_id=${currentBranch.id}`,
      );
      setData(res.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error cargando el monitor", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitorData();
  }, [currentBranch, isManager]);

  if (!isManager) {
    return (
      <div className="h-screen flex flex-col bg-slate-100">
        <PosHeader />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <Lock size={64} className="mb-4 text-slate-300" />
          <h2 className="text-2xl font-black text-slate-700">
            Acceso Denegado
          </h2>
          <p>Solo los administradores pueden ver el monitor de tienda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden font-sans">
      <PosHeader />

      <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6 custom-scrollbar">
        {/* ENCABEZADO Y BOTÓN DE ACTUALIZAR */}
        <div className="flex justify-between items-end mb-2">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <TrendingUp className="text-blue-600" /> Monitor de Operaciones
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Resumen en tiempo real del día {data?.date || "..."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-bold">
              Última act: {lastUpdate.toLocaleTimeString()}
            </span>
            <button
              onClick={fetchMonitorData}
              disabled={loading}
              className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-blue-600 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="text-center py-20 text-slate-400 animate-pulse font-medium">
            Recopilando datos de las cajas...
          </div>
        ) : data ? (
          <>
            {/* 1. TARJETAS RESUMEN GLOBAL (Ahora son 5) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-lg border border-slate-700 text-white relative overflow-hidden col-span-2 md:col-span-1 lg:col-span-1">
                <div className="absolute -right-4 -top-4 opacity-10">
                  <TrendingUp size={100} />
                </div>
                <div className="flex items-center gap-2 text-slate-300 font-bold text-[11px] uppercase tracking-wider mb-2 relative z-10">
                  Ventas del Día (Bruto)
                </div>
                <div className="text-3xl font-black truncate relative z-10">
                  S/ {data.totals.global_bruto.toFixed(2)}
                </div>
                <div className="text-xs text-emerald-400 mt-1 font-bold relative z-10 flex items-center gap-1">
                  <Banknote size={14} /> Neto: S/{" "}
                  {data.totals.global_neto.toFixed(2)}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Banknote size={16} className="text-green-600" /> Efectivo
                </div>
                <div className="text-2xl font-black text-slate-800 truncate">
                  S/ {data.totals.cash.toFixed(2)}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <CreditCard size={16} className="text-blue-600" /> Tarjetas /
                  Transf
                </div>
                <div className="text-2xl font-black text-slate-800 truncate">
                  S/ {(data.totals.card + data.totals.transfer).toFixed(2)}
                </div>
              </div>

              {/* 👇 NUEVA TARJETA: DESCUENTOS GLOBALES 👇 */}
              <div className="bg-pink-50 p-5 rounded-2xl shadow-sm border border-pink-200">
                <div className="flex items-center gap-2 text-pink-700 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Tag size={16} className="text-pink-600" /> Dsctos Dados
                </div>
                <div className="text-2xl font-black text-pink-800 truncate">
                  S/ {(data.totals.discounts_value || 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-pink-600/70 mt-1 font-bold">
                  Dinero descontado
                </div>
              </div>

              <div className="bg-purple-50 p-5 rounded-2xl shadow-sm border border-purple-200">
                <div className="flex items-center gap-2 text-purple-700 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Gift size={16} className="text-purple-600" /> Cortesías
                </div>
                <div className="text-2xl font-black text-purple-800 truncate">
                  S/ {data.totals.courtesies_value.toFixed(2)}
                </div>
                <div className="text-[10px] text-purple-600/70 mt-1 font-bold">
                  {data.totals.courtesies_count} tickets emitidos
                </div>
              </div>
            </div>

            {/* 2. DETALLE DE CAJAS (GRILLA) */}
            <h2 className="text-lg font-bold text-slate-700 mt-8 mb-4 flex items-center gap-2">
              <Wallet size={20} className="text-slate-400" /> Estado de Cajas
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {data.shifts.length === 0 ? (
                <div className="col-span-full text-center py-10 bg-white rounded-2xl border border-slate-200 border-dashed text-slate-400">
                  No hay cajas registradas el día de hoy.
                </div>
              ) : (
                data.shifts.map((shift) => {
                  const totalCaja =
                    shift.expected_cash +
                    shift.expected_card +
                    shift.expected_transfer;
                  const isOpen = shift.status === "OPEN";

                  return (
                    <div
                      key={shift.id}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                        isOpen
                          ? "border-blue-200 ring-1 ring-blue-50"
                          : "border-slate-200 opacity-80"
                      }`}
                    >
                      {/* Cabecera de la Tarjeta */}
                      <div
                        className={`p-4 flex justify-between items-center border-b ${
                          isOpen
                            ? "bg-blue-50/50 border-blue-100"
                            : "bg-slate-50 border-slate-100"
                        }`}
                      >
                        <div>
                          <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            {shift.register_name || "Caja General"}
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                              #{shift.id}
                            </span>
                          </h3>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Cajero: {shift.user_name}
                          </p>
                        </div>
                        <div
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isOpen
                              ? "bg-green-100 text-green-700 border border-green-200"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {isOpen ? <Unlock size={12} /> : <Lock size={12} />}
                          {isOpen ? "Abierta" : "Cerrada"}
                        </div>
                      </div>

                      {/* Cuerpo de la Tarjeta */}
                      <div className="p-4 space-y-4">
                        <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-3">
                          <span className="text-slate-500 font-medium">
                            Total Registrado
                          </span>
                          <span className="font-black text-lg text-slate-800">
                            S/ {totalCaja.toFixed(2)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                              <Banknote size={12} /> Efectivo
                            </p>
                            <p className="font-bold text-slate-700">
                              S/ {shift.expected_cash.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                              <CreditCard size={12} /> Otros
                            </p>
                            <p className="font-bold text-slate-700">
                              S/{" "}
                              {(
                                shift.expected_card + shift.expected_transfer
                              ).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-50 text-[10px] text-slate-400 font-medium flex items-center gap-1">
                          <Clock size={12} />
                          Apertura:{" "}
                          {new Date(shift.opened_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {!isOpen && shift.closed_at && (
                            <>
                              {" "}
                              • Cierre:{" "}
                              {new Date(shift.closed_at).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </>
                          )}
                        </div>

                        {!isOpen && shift.final_balance_real !== null && (
                          <div className="pt-2 text-[10px] font-bold text-slate-500 flex justify-between">
                            <span>
                              Declarado: S/{" "}
                              {parseFloat(shift.final_balance_real).toFixed(2)}
                            </span>
                            {(() => {
                              const diff =
                                parseFloat(shift.final_balance_real) -
                                (shift.expected_cash +
                                  shift.expected_card +
                                  shift.expected_transfer);
                              if (Math.abs(diff) < 0.1)
                                return (
                                  <span className="text-green-600">
                                    Cuadre Exacto
                                  </span>
                                );
                              return (
                                <span
                                  className={
                                    diff > 0 ? "text-blue-600" : "text-red-600"
                                  }
                                >
                                  {diff > 0 ? "+" : ""}S/ {diff.toFixed(2)}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default AdminMonitor;
