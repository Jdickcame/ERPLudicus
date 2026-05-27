import { Download, Filter, PackageMinus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

// --- INTERFAZ DEL KARDEX ---
interface KardexItem {
  id: number;
  date: string;
  product_name: string;
  product_sku: string;
  type_display: string;
  quantity: string;
  unit_cost: string;
  total_cost: string;
  user_name: string;
  description: string;
  reference_document: string;
}

const MermasReport = () => {
  const { currentBranch } = useBranch();
  const [loading, setLoading] = useState(false);
  const [mermas, setMermas] = useState<KardexItem[]>([]);
  const [totalPerdida, setTotalPerdida] = useState(0);

  const today = new Date();
  const [filters, setFilters] = useState({
    startDate: today.toISOString().split("T")[0],
    endDate: today.toISOString().split("T")[0],
    search: "",
  });

  const [showFilters, setShowFilters] = useState(false);

  const fetchUnifiedMermas = async () => {
    if (!currentBranch) return;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.append("branch_id", currentBranch.id.toString());
      params.append("type", "OUT_MERMA,OUT_COURTESY");
      params.append("start_date", filters.startDate);
      params.append("end_date", filters.endDate);
      params.append("page_size", "2000"); // Aumentamos por si hay mucho flujo

      const response = await api.get(`/inventory/kardex/?${params.toString()}`);
      const data = response.data.results || response.data;

      setMermas(data);

      const perdida = data.reduce(
        (acc: number, item: KardexItem) =>
          acc +
          Math.abs(parseFloat(item.quantity)) * parseFloat(item.unit_cost),
        0,
      );
      setTotalPerdida(perdida);
    } catch (error) {
      console.error("Error cargando mermas unificadas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnifiedMermas();
  }, [currentBranch]);

  const filteredMermas = mermas.filter(
    (m) =>
      (m.product_name || "")
        .toLowerCase()
        .includes(filters.search.toLowerCase()) ||
      (m.description || "")
        .toLowerCase()
        .includes(filters.search.toLowerCase()) ||
      (m.product_sku || "")
        .toLowerCase()
        .includes(filters.search.toLowerCase()),
  );

  // 👇 FUNCIÓN DE EXPORTACIÓN A EXCEL 👇
  const exportToExcel = () => {
    if (filteredMermas.length === 0) {
      alert("No hay mermas para exportar en este periodo.");
      return;
    }

    const dataForExcel = filteredMermas.map((m) => {
      const cant = Math.abs(parseFloat(m.quantity));
      const cost = parseFloat(m.unit_cost);
      const isPos = m.reference_document.includes("Cortesia");

      return {
        "Fecha y Hora": new Date(m.date).toLocaleString("es-PE"),
        Producto: m.product_name,
        SKU: m.product_sku,
        Tipo: isPos ? "CORTESÍA (POS)" : "MERMA INVENTARIO",
        "Motivo / Descripción": m.description || "Sin motivo",
        Cantidad: cant,
        "Costo Unitario (S/)": Number(cost.toFixed(2)),
        "Total Perdido (S/)": Number((cant * cost).toFixed(2)),
        Usuario: m.user_name || "Sistema",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mermas Totales");

    // Ajuste de anchos de columna
    worksheet["!cols"] = [
      { wch: 20 },
      { wch: 35 },
      { wch: 15 },
      { wch: 20 },
      { wch: 40 },
      { wch: 10 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
    ];

    const fileName = `Mermas_Ludicus_${filters.startDate}_al_${filters.endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <PackageMinus className="text-red-500" /> Control de Mermas Total
          </h1>
          <p className="text-sm text-slate-500">
            Historial unificado de pérdidas (Inventario + Caja)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BranchSelector />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 border rounded-xl transition-all ${
              showFilters
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Filter size={20} />
          </button>
          <button
            onClick={exportToExcel}
            className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-sm font-bold text-sm"
          >
            <Download size={18} /> Descargar Excel
          </button>
        </div>
      </div>

      {/* FILTROS */}
      {showFilters && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end animate-in slide-in-from-top-2 duration-300">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Desde
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters({ ...filters, startDate: e.target.value })
              }
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters({ ...filters, endDate: e.target.value })
              }
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            onClick={fetchUnifiedMermas}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-all h-[40px]"
          >
            Actualizar Reporte
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Dinero Perdido
          </p>
          <h3 className="text-3xl font-black text-red-600 mt-1">
            S/ {totalPerdida.toFixed(2)}
          </h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Items Totales
          </p>
          <h3 className="text-3xl font-black text-slate-800 mt-1">
            {mermas.reduce(
              (acc, item) => acc + Math.abs(parseFloat(item.quantity)),
              0,
            )}
          </h3>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-end">
          <div className="relative w-full sm:w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Buscar por producto..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b">
              <tr>
                <th className="p-4">Fecha</th>
                <th className="p-4">Producto</th>
                <th className="p-4">Origen / Motivo</th>
                <th className="p-4 text-center">Cant.</th>
                <th className="p-4 text-right">Costo Perdido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-10 text-center text-slate-400 animate-pulse"
                  >
                    Cargando datos...
                  </td>
                </tr>
              ) : filteredMermas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400">
                    No se encontraron mermas en este periodo.
                  </td>
                </tr>
              ) : (
                filteredMermas.map((m) => {
                  const isPos = m.reference_document.includes("Cortesia");
                  const cant = Math.abs(parseFloat(m.quantity));
                  const total = cant * parseFloat(m.unit_cost);

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-4 text-slate-600 font-medium">
                        {new Date(m.date).toLocaleString("es-PE")}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-700">
                          {m.product_name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {m.product_sku}
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            isPos
                              ? "bg-purple-100 text-purple-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {isPos ? "🛒 CORTESÍA (POS)" : "📦 MERMA INV."}
                        </span>
                        <div className="text-xs mt-1 text-slate-500 italic">
                          "{m.description || "Sin motivo"}"
                        </div>
                      </td>
                      <td className="p-4 text-center font-black text-slate-700">
                        {cant}
                      </td>
                      <td className="p-4 text-right font-black text-red-600">
                        S/ {total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MermasReport;
