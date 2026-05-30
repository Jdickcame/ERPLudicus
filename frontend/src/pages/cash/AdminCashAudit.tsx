import {
  AlertCircle,
  Ban,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Loader2,
  PieChart,
  Printer,
  Search,
  ShoppingCart,
  Store,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import Pagination from "../../components/common/Pagination"; // 👈 Tu componente de Paginación
import { useBranch } from "../../context/BranchContext";

// Hook para "Debounce" (espera a que el usuario deje de escribir para buscar)
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// --- INTERFACES ---
interface CashShift {
  id: number;
  user_name: string;
  register_name: string;
  opened_at: string;
  closed_at: string | null;
  initial_balance: string;
  final_balance_real: string | null;
  current_balance: string;
  difference: string | null;
  status: "OPEN" | "CLOSED";
}

interface SaleDetail {
  id: number;
  series: string;
  number: string;
  client_name: string;
  total: string;
  date: string;
  status: string;
  credit_notes?: any[];
}

const AdminCashAudit = () => {
  const { currentBranch } = useBranch();
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // --- ESTADOS DE PAGINACIÓN (Igual que en Products) ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // --- ESTADOS DE FILTROS ---
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500); // Búsqueda en tiempo real
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    status: "",
  });

  // --- ESTADOS DEL MODAL DE DETALLE ---
  const [selectedShift, setSelectedShift] = useState<CashShift | null>(null);
  const [shiftSales, setShiftSales] = useState<SaleDetail[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // --- CARGA DINÁMICA DE TURNOS ---
  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      params.append("origin", "web");
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());

      if (currentBranch?.id) {
        params.append("branch_id", currentBranch.id.toString());
      }

      if (debouncedSearch) params.append("search", debouncedSearch);
      if (filters.startDate) params.append("start_date", filters.startDate);
      if (filters.endDate) params.append("end_date", filters.endDate);
      if (filters.status) params.append("status", filters.status);

      const response = await api.get(`/cash/shifts/?${params.toString()}`);

      if (response.data && response.data.results) {
        setShifts(response.data.results);
        setTotalCount(response.data.count);
      } else {
        const allData = Array.isArray(response.data) ? response.data : [];
        setTotalCount(allData.length);
        const startIndex = (page - 1) * pageSize;
        setShifts(allData.slice(startIndex, startIndex + pageSize));
      }
    } catch (error) {
      console.error("Error fetching shifts:", error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, filters, currentBranch]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Si cambia el término de búsqueda o la sede, regresamos a la página 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, currentBranch, filters.status]);

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPage(1); // Reset page on filter change
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilters({ startDate: "", endDate: "", status: "" });
    setPage(1);
  };

  const safeNumber = (val: any) => {
    if (val === null || val === undefined || val === "") return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };

  // --- DETALLE DE VENTAS ---
  const handleViewDetails = async (shift: CashShift) => {
    setSelectedShift(shift);
    setLoadingSales(true);
    setShiftSales([]);

    try {
      const params = new URLSearchParams();
      params.append("origin", "web");
      params.append("shift_id", shift.id.toString());

      const res = await api.get(
        `/sales/sales/?${params.toString()}&page_size=500`,
      );
      const data = Array.isArray(res.data) ? res.data : res.data.results;
      setShiftSales(data);
    } catch (error) {
      console.error("Error cargando detalle de ventas:", error);
      alert("❌ Error al cargar las ventas del turno.");
    } finally {
      setLoadingSales(false);
    }
  };

  // --- ESTADO Y FUNCIÓN PARA RE-IMPRIMIR ---
  const [printingShiftId, setPrintingShiftId] = useState<number | null>(null);

  const handlePrintShift = async (shift: CashShift) => {
    if (shift.status === "OPEN") {
      alert("No puedes imprimir el cierre de un turno que sigue abierto.");
      return;
    }

    setPrintingShiftId(shift.id);
    try {
      // 👇 AQUÍ ESTÁ EL CAMBIO CLAVE: Llamamos a tu endpoint /report_z/ 👇
      const response = await api.get(`/cash/shifts/${shift.id}/report_z/`, {
        responseType: "blob",
      });

      // Magia del iframe oculto para lanzar la impresión térmica
      const pdfUrl = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = pdfUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };
    } catch (error) {
      console.error("Error al re-imprimir el turno:", error);
      alert("❌ Error al generar el ticket de cierre.");
    } finally {
      setPrintingShiftId(null);
    }
  };

  // --- ESTADO Y FUNCIÓN PARA RE-IMPRIMIR PMIX ---
  const [printingPmixId, setPrintingPmixId] = useState<number | null>(null);

  const handlePrintPmix = async (shift: CashShift) => {
    if (shift.status === "OPEN") {
      alert(
        "Para asegurar la exactitud, cierra el turno antes de imprimir el PMIX final.",
      );
      return;
    }

    setPrintingPmixId(shift.id);
    try {
      // 👇 AQUÍ ESTÁ LA RUTA EXACTA SEGÚN TU urls.py 👇
      const response = await api.get(
        `/sales/reports/pmix/print/?shift_id=${shift.id}`,
        {
          responseType: "blob",
        },
      );

      // Magia del iframe oculto para lanzar la impresión térmica
      const pdfUrl = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = pdfUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };
    } catch (error) {
      console.error("Error al re-imprimir el PMIX:", error);
      alert("❌ Error al generar el ticket PMIX. Verifica tu conexión.");
    } finally {
      setPrintingPmixId(null);
    }
  };

  // --- RENDERIZADORES ---
  const renderStatus = (status: string) => {
    if (status === "OPEN") {
      return (
        <span className="flex items-center justify-center gap-1.5 w-fit px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 uppercase tracking-wider">
          <Clock size={12} /> Abierta
        </span>
      );
    }
    return (
      <span className="flex items-center justify-center gap-1.5 w-fit px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
        <CheckCircle2 size={12} /> Cerrada
      </span>
    );
  };

  const renderCuadre = (shift: CashShift) => {
    if (shift.status === "OPEN") {
      return <span className="text-xs text-slate-400 italic">En curso...</span>;
    }

    const diff = safeNumber(shift.difference);

    if (diff === 0) {
      return (
        <div className="flex flex-col">
          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={14} /> Cuadre Exacto
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            Real: S/ {safeNumber(shift.final_balance_real).toFixed(2)}
          </span>
        </div>
      );
    } else if (diff > 0) {
      return (
        <div className="flex flex-col">
          <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
            Sobrante: +S/ {diff.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            Esperaba: S/ {safeNumber(shift.current_balance).toFixed(2)}
          </span>
        </div>
      );
    } else {
      return (
        <div className="flex flex-col">
          <span className="text-xs font-bold text-red-600 flex items-center gap-1">
            <AlertCircle size={14} /> Faltante: S/ {Math.abs(diff).toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            Esperaba: S/ {safeNumber(shift.current_balance).toFixed(2)}
          </span>
        </div>
      );
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto p-4 md:p-6 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 text-white rounded-xl shadow-sm">
              <Banknote size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                Auditoría de Cajas
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Control de turnos, arqueos y cuadres por sede
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
          <Store size={18} className="text-slate-400 ml-2" />
          <BranchSelector />
          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm font-semibold ${
              showFilters
                ? "bg-slate-100 text-slate-700"
                : "hover:bg-slate-50 text-slate-600"
            }`}
          >
            <Filter size={16} /> Filtros
          </button>
        </div>
      </div>

      {/* PANEL DE BÚSQUEDA Y FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
        <Search className="absolute left-6 top-6 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre de cajero o usuario..."
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all text-sm font-medium"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {/* Filtros avanzados desplegables */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                Desde
              </label>
              <input
                type="date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                Hasta
              </label>
              <input
                type="date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                Estado de Caja
              </label>
              <select
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="">Todos los Estados</option>
                <option value="OPEN">En curso (Abiertas)</option>
                <option value="CLOSED">Cerradas (Arqueadas)</option>
              </select>
            </div>
            <div className="md:col-span-3 flex justify-end">
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={16} /> Limpiar Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-[10px] text-slate-500 tracking-wider">
              <tr>
                <th className="p-4">Turno / Cajero</th>
                <th className="p-4">Apertura</th>
                <th className="p-4">Cierre</th>
                <th className="p-4 text-right">Saldo Actual Sistema</th>
                <th className="p-4">Resultado del Arqueo</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Auditar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600"></div>
                      <span className="font-medium text-sm">
                        Cargando historial de turnos...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-400">
                    <FileText
                      size={48}
                      className="mx-auto text-slate-200 mb-3"
                    />
                    <p className="text-base font-bold text-slate-500">
                      No se encontraron turnos
                    </p>
                    <p className="text-xs mt-1">
                      Ajusta los filtros o asegúrate de tener una sede
                      seleccionada.
                    </p>
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => {
                  const base = safeNumber(shift.initial_balance);
                  const current = safeNumber(shift.current_balance);

                  return (
                    <tr
                      key={shift.id}
                      className="hover:bg-slate-50 transition group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                            <User size={14} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">
                              {shift.user_name}
                            </p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                              Turno #{shift.id} • {shift.register_name}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-700">
                              {new Date(shift.opened_at).toLocaleDateString()}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {new Date(shift.opened_at).toLocaleTimeString(
                                [],
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">
                          Base Inic: S/ {base.toFixed(2)}
                        </p>
                      </td>

                      <td className="p-4">
                        {shift.closed_at ? (
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-slate-400" />
                            <div>
                              <p className="font-medium text-slate-700">
                                {new Date(shift.closed_at).toLocaleDateString()}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {new Date(shift.closed_at).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic font-medium">
                            Sin cerrar
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        <p className="font-black text-slate-800 text-base">
                          S/ {current.toFixed(2)}
                        </p>
                      </td>

                      <td className="p-4 bg-slate-50/50">
                        {renderCuadre(shift)}
                      </td>

                      <td className="p-4 text-center">
                        {renderStatus(shift.status)}
                      </td>

                      <td className="p-4 text-center">
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewDetails(shift)}
                              className="p-2 inline-flex bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition shadow-sm"
                              title="Auditar Movimientos y Ventas"
                            >
                              <FileText size={16} />
                            </button>

                            {/* BOTÓN DE RE-IMPRESIÓN CIERRE Z */}
                            <button
                              onClick={() => handlePrintShift(shift)}
                              disabled={
                                printingShiftId === shift.id ||
                                shift.status === "OPEN"
                              }
                              className={`p-2 inline-flex border rounded-lg transition shadow-sm ${
                                shift.status === "OPEN"
                                  ? "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200"
                              }`}
                              title={
                                shift.status === "OPEN"
                                  ? "Cierra el turno primero"
                                  : "Re-imprimir Cierre de Caja"
                              }
                            >
                              {printingShiftId === shift.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Printer size={16} />
                              )}
                            </button>

                            {/* 👇 NUEVO BOTÓN DE RE-IMPRESIÓN PMIX 👇 */}
                            <button
                              onClick={() => handlePrintPmix(shift)}
                              disabled={
                                printingPmixId === shift.id ||
                                shift.status === "OPEN"
                              }
                              className={`p-2 inline-flex border rounded-lg transition shadow-sm ${
                                shift.status === "OPEN"
                                  ? "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200"
                              }`}
                              title={
                                shift.status === "OPEN"
                                  ? "Cierra el turno primero"
                                  : "Re-imprimir PMIX (Productos Vendidos)"
                              }
                            >
                              {printingPmixId === shift.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <PieChart size={16} />
                              )}
                            </button>
                          </div>
                        </td>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* COMPONENTE DE PAGINACIÓN GENÉRICO */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        loading={loading}
        onPageChange={(newPage) => setPage(newPage)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      {/* 👇 MODAL DE DETALLE DE VENTAS DEL TURNO 👇 */}
      {selectedShift && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-800">
                  Auditoría de Turno #{selectedShift.id}
                </h2>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
                  Cajero: {selectedShift.user_name} |{" "}
                  {selectedShift.register_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedShift(null)}
                className="text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2 rounded-xl transition"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Body (Lista de Ventas) */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                <thead className="bg-white sticky top-0 border-b border-slate-100 font-bold uppercase text-[10px] text-slate-400 tracking-wider z-10 shadow-sm">
                  <tr>
                    <th className="p-4">Hora</th>
                    <th className="p-4">Comprobante</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4 text-right">Monto (S/)</th>
                    <th className="p-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingSales ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-16 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600"></div>
                          Cargando detalle de ventas...
                        </div>
                      </td>
                    </tr>
                  ) : shiftSales.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-16 text-center text-slate-400 italic"
                      >
                        <ShoppingCart
                          size={40}
                          className="mx-auto mb-3 opacity-20"
                        />
                        No se registraron ventas en este turno.
                      </td>
                    </tr>
                  ) : (
                    shiftSales.map((sale) => {
                      const isAnulada =
                        sale.credit_notes && sale.credit_notes.length > 0;
                      return (
                        <tr
                          key={sale.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isAnulada ? "opacity-50 grayscale bg-red-50/30" : ""
                          }`}
                        >
                          <td className="p-4 font-medium text-slate-500">
                            {new Date(sale.date).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="p-4">
                            <span
                              className={`font-bold ${
                                isAnulada
                                  ? "line-through decoration-red-400 text-slate-400"
                                  : "text-slate-700"
                              }`}
                            >
                              {sale.series}-{sale.number}
                            </span>
                          </td>
                          <td className="p-4 truncate max-w-[250px] text-slate-600 font-medium">
                            {sale.client_name || "PÚBLICO GENERAL"}
                          </td>
                          <td className="p-4 text-right">
                            <span
                              className={`font-black ${
                                isAnulada ? "text-slate-400" : "text-green-600"
                              }`}
                            >
                              {parseFloat(sale.total).toFixed(2)}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            {isAnulada ? (
                              <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider border border-red-200 flex items-center justify-center gap-1 w-max mx-auto">
                                <Ban size={12} /> ANULADA
                              </span>
                            ) : (
                              <span className="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider border border-emerald-200">
                                PAGADO
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 bg-white rounded-b-2xl flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Transacciones:{" "}
                <strong className="text-slate-800 text-sm ml-1">
                  {shiftSales.length}
                </strong>
              </span>
              <button
                onClick={() => setSelectedShift(null)}
                className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-black transition-colors active:scale-95 shadow-md"
              >
                Cerrar Auditoría
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCashAudit;
