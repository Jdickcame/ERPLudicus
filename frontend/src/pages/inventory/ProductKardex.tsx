import {
    ArrowLeft,
    Box,
    Calendar,
    ChevronLeft,
    ChevronRight,
    FileText,
    Filter,
    History,
    X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

// ... (Interface KardexEntry se mantiene igual) ...
interface KardexEntry {
  id: number;
  date: string;
  type: string;
  type_display: string;
  quantity: string;
  unit_cost: string;
  total_cost: string;
  balance_quantity: string;
  balance_unit_cost: string;
  balance_total_cost: string;
  user_name: string;
  reference_document: string;
  description: string;
  product_name: string;
  uom_display: string;
}

const ProductKardex = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentBranch } = useBranch();

  const [entries, setEntries] = useState<KardexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [productName, setProductName] = useState("Cargando producto...");
  const [uom, setUom] = useState("");

  // 👇 ESTADOS DE PAGINACIÓN ACTUALIZADOS 👇
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // Nuevo estado para los registros por página
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filtros de Fecha
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const fetchKardex = async () => {
      if (!currentBranch || !id) return;
      setLoading(true);
      try {
        // 👇 Inyectamos el page_size dinámico en la URL 👇
        let url = `/inventory/kardex/?branch_id=${currentBranch.id}&product=${id}&page=${page}&page_size=${pageSize}`;

        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;

        const res = await api.get(url);

        let dataList = [];
        let total = 0;

        if (res.data && Array.isArray(res.data.results)) {
          dataList = res.data.results;
          total = res.data.count;
        } else if (Array.isArray(res.data)) {
          dataList = res.data;
          total = dataList.length;
        }

        setEntries(dataList);
        setTotalCount(total);
        // 👇 El cálculo de páginas totales ahora usa nuestro pageSize dinámico 👇
        setTotalPages(total > 0 ? Math.ceil(total / pageSize) : 1);

        if (dataList.length > 0 && productName === "Cargando producto...") {
          setProductName(dataList[0].product_name);
          setUom(dataList[0].uom_display);
        }
      } catch (error) {
        console.error("Error cargando Kardex:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchKardex();
  }, [currentBranch, id, page, pageSize, startDate, endDate]); // 👈 Reacciona cuando cambia el pageSize

  // ... (formatDate y clearDates se mantienen igual) ...
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const clearDates = () => {
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* ... (CABECERA Y FILTROS SE MANTIENEN IGUAL) ... */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/inventory")}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <History className="text-blue-600" /> Kardex de Movimientos
            </h1>
            <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
              <Box size={14} /> <strong>{productName}</strong> en{" "}
              {currentBranch?.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
          <Filter size={16} className="text-slate-400 ml-2" />
          <div className="flex items-center gap-2 border-r border-slate-200 pr-3 ml-1">
            <span className="text-xs font-bold text-slate-500 uppercase">
              Desde:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="text-sm outline-none bg-slate-50 p-1.5 rounded border border-slate-200 focus:border-blue-500 cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2 pl-1">
            <span className="text-xs font-bold text-slate-500 uppercase">
              Hasta:
            </span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="text-sm outline-none bg-slate-50 p-1.5 rounded border border-slate-200 focus:border-blue-500 cursor-pointer"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={clearDates}
              className="p-1.5 hover:bg-red-50 text-red-500 rounded ml-1 transition"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* TABLA DEL KARDEX */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            Cargando historial inmutable...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <History size={48} className="mx-auto mb-3 opacity-30" />
            <p>No se encontraron movimientos para este periodo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-800 text-white font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th rowSpan={2} className="p-3 border-r border-slate-700">
                    Fecha y Hora
                  </th>
                  <th rowSpan={2} className="p-3 border-r border-slate-700">
                    Detalle del Movimiento
                  </th>
                  <th
                    colSpan={3}
                    className="p-2 border-r border-slate-700 text-center bg-blue-900/50"
                  >
                    MOVIMIENTO FÍSICO
                  </th>
                  <th colSpan={3} className="p-2 text-center bg-green-900/50">
                    SALDO VALORIZADO
                  </th>
                </tr>
                <tr className="bg-slate-700">
                  <th className="p-2 border-r border-slate-600 text-center">
                    Cant.
                  </th>
                  <th className="p-2 border-r border-slate-600 text-center">
                    C. Unit
                  </th>
                  <th className="p-2 border-r border-slate-800 text-center">
                    Total
                  </th>
                  <th className="p-2 border-r border-slate-600 text-center">
                    Stock Final
                  </th>
                  <th className="p-2 border-r border-slate-600 text-center">
                    CPP
                  </th>
                  <th className="p-2 text-center">Valor Total</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {entries.map((entry) => {
                  const isInput = parseFloat(entry.quantity) > 0;
                  const qtyColor = isInput
                    ? "text-green-600 bg-green-50"
                    : "text-red-600 bg-red-50";
                  const sign = isInput ? "+" : "";

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3 border-r border-slate-100 text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} />
                          {formatDate(entry.date)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Por: {entry.user_name}
                        </div>
                      </td>
                      <td className="p-3 border-r border-slate-100">
                        <div className="font-bold text-slate-700 flex items-center gap-1.5">
                          {entry.type_display}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <FileText size={10} /> {entry.reference_document}
                        </div>
                        <div
                          className="text-[10px] text-slate-400 italic truncate max-w-[200px]"
                          title={entry.description}
                        >
                          {entry.description}
                        </div>
                      </td>
                      <td className="p-3 border-r border-slate-100 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${qtyColor}`}
                        >
                          {sign}
                          {parseFloat(entry.quantity).toString()} {uom}
                        </span>
                      </td>
                      <td className="p-3 border-r border-slate-100 text-right text-slate-600">
                        S/ {parseFloat(entry.unit_cost).toFixed(2)}
                      </td>
                      <td className="p-3 border-r border-slate-200 text-right font-medium text-slate-700 bg-slate-50/50">
                        S/ {parseFloat(entry.total_cost).toFixed(2)}
                      </td>
                      <td className="p-3 border-r border-slate-100 text-center font-black text-slate-800">
                        {parseFloat(entry.balance_quantity).toString()}{" "}
                        <span className="text-[10px] font-normal text-slate-400">
                          {uom}
                        </span>
                      </td>
                      <td className="p-3 border-r border-slate-100 text-right text-slate-600">
                        S/ {parseFloat(entry.balance_unit_cost).toFixed(4)}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-700 bg-blue-50/30">
                        S/ {parseFloat(entry.balance_total_cost).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 👇 BARRA DE PAGINACIÓN ACTUALIZADA CON SELECTOR 👇 */}
            <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500">
                  Mostrando {(page - 1) * pageSize + (totalCount > 0 ? 1 : 0)} a{" "}
                  {Math.min(page * pageSize, totalCount)} de {totalCount}{" "}
                  registros
                </span>

                {/* SELECTOR DE REGISTROS POR PÁGINA */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">
                    Filas por página:
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1); // Regresamos a la página 1 al cambiar el tamaño
                    }}
                    className="text-xs border border-slate-300 rounded p-1 outline-none bg-white focus:border-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded border bg-white disabled:opacity-50 hover:bg-slate-100 transition"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 py-1 text-sm font-medium bg-white border rounded">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded border bg-white disabled:opacity-50 hover:bg-slate-100 transition"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductKardex;
