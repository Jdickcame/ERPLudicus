import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  Eye,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import PurchaseDetailModal from "../../components/purchases/PurchaseDetailModal";
import { useBranch } from "../../context/BranchContext";

// Hook simple para "Debounce"
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const PurchaseList = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  // --- ESTADOS DE DATOS ---
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // --- ESTADOS DE FILTROS ---
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 500);
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [costTypeFilter, setCostTypeFilter] = useState("ALL");

  // --- ESTADOS DE PAGINACIÓN Y ORDEN ---
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [ordering, setOrdering] = useState("-issue_date");

  // Modal
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(
    null,
  );

  // --- FUNCIÓN DE CARGA ---
  const fetchPurchases = useCallback(async () => {
    if (!currentBranch) return;
    setLoading(true);

    try {
      const params: any = {
        branch_id: currentBranch.id,
        page: page,
        page_size: pageSize,
        ordering: ordering,
      };

      if (debouncedSearch) params.search = debouncedSearch;
      if (currencyFilter !== "ALL") params.currency = currencyFilter;
      if (costTypeFilter !== "ALL") params.cost_type = costTypeFilter;

      const response = await api.get("/purchases/purchases/", { params });

      setPurchases(response.data.results || []);
      setTotalCount(response.data.count || 0);
    } catch (error) {
      console.error("Error cargando compras:", error);
    } finally {
      setLoading(false);
    }
  }, [
    currentBranch,
    page,
    debouncedSearch,
    currencyFilter,
    costTypeFilter,
    ordering,
  ]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, currencyFilter, costTypeFilter, currentBranch]);

  // --- MANEJADORES ---
  const handleSort = (field: string) => {
    if (ordering === field) setOrdering(`-${field}`);
    else if (ordering === `-${field}`) setOrdering(field);
    else setOrdering(field);
  };

  const getSortIcon = (field: string) => {
    if (ordering === field) return <ArrowUp size={14} className="ml-1" />;
    if (ordering === `-${field}`)
      return <ArrowDown size={14} className="ml-1" />;
    return null;
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Eliminar compra? Esto revertirá el stock.")) return;
    try {
      await api.delete(`/purchases/purchases/${id}/`);
      fetchPurchases();
    } catch (error) {
      alert("Error al eliminar");
    }
  };

  // 👇 NUEVA FUNCIÓN PARA EXPORTAR EXCEL
  const handleExportExcel = async () => {
    if (!currentBranch) return;
    try {
      const params: any = { branch_id: currentBranch.id };
      if (debouncedSearch) params.search = debouncedSearch;
      if (currencyFilter !== "ALL") params.currency = currencyFilter;
      if (costTypeFilter !== "ALL") params.cost_type = costTypeFilter;

      // Pedimos el archivo como Blob
      const response = await api.get("/purchases/purchases/export_excel/", {
        params,
        responseType: "blob",
      });

      // Forzamos la descarga en el navegador
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "Historial_Compras.xlsx");
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error("Error al exportar:", error);
      alert("Ocurrió un error al descargar el archivo Excel.");
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6 animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">
              Gestión de Compras
            </h1>
            <BranchSelector />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Total registros: <strong>{totalCount}</strong>
          </p>
        </div>

        {/* 👇 BOTONES DE ACCIÓN */}
        <div className="flex gap-3">
          <button
            onClick={handleExportExcel}
            className="bg-emerald-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-emerald-700 transition shadow-md font-medium"
          >
            <Download size={18} /> Excel
          </button>
          <Link
            to="/purchases/new"
            className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 transition shadow-md font-medium"
          >
            <Plus size={18} /> Nueva Compra
          </Link>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar proveedor, serie, número..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-3 text-slate-400" size={18} />
          <select
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-slate-700 appearance-none cursor-pointer"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
          >
            <option value="ALL">Todas las Monedas</option>
            <option value="PEN">🇵🇪 Soles (S/)</option>
            <option value="USD">🇺🇸 Dólares ($)</option>
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-3 text-slate-400" size={18} />
          <select
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-slate-700 appearance-none cursor-pointer"
            value={costTypeFilter}
            onChange={(e) => setCostTypeFilter(e.target.value)}
          >
            <option value="ALL">Todos los Costos</option>
            <option value="CV">Variable (CV)</option>
            <option value="CF">Fijo (CF)</option>
          </select>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto mb-4">
        {loading ? (
          <div className="py-20 flex justify-center items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" /> Cargando datos...
          </div>
        ) : (
          <table className="w-full text-xs text-left text-slate-500">
            <thead className="text-[10px] text-slate-700 uppercase bg-slate-50 border-b select-none tracking-wider">
              <tr>
                <th
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                  onClick={() => handleSort("issue_date")}
                >
                  <div className="flex items-center">
                    Fecha {getSortIcon("issue_date")}
                  </div>
                </th>
                <th className="px-4 py-3 whitespace-nowrap">Documento</th>
                <th
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("supplier__name")}
                >
                  <div className="flex items-center">
                    Proveedor / RUC {getSortIcon("supplier__name")}
                  </div>
                </th>

                {/* 👇 NUEVAS COLUMNAS FINANCIERAS */}
                <th className="px-3 py-3 text-right">V. Venta</th>
                <th className="px-3 py-3 text-right">Gravado</th>
                <th className="px-3 py-3 text-right">No Grav.</th>
                <th className="px-3 py-3 text-right">IGV</th>

                <th
                  className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("total_net_pay")}
                >
                  <div className="flex justify-end items-center">
                    Total {getSortIcon("total_net_pay")}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("payment_status")}
                >
                  <div className="flex justify-center items-center">
                    Estado {getSortIcon("payment_status")}
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {purchases.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="text-center py-10 text-slate-400 text-sm"
                  >
                    No se encontraron registros.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className="bg-white border-b hover:bg-slate-50 transition"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {purchase.issue_date}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {purchase.document_type} <br />
                      <span className="text-slate-500 font-normal">
                        {purchase.series}-{purchase.number}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 truncate max-w-[180px]"
                      title={purchase.supplier_name}
                    >
                      <div className="font-semibold text-slate-800 truncate">
                        {purchase.supplier_name}
                      </div>
                      <div className="text-slate-400">
                        RUC: {purchase.supplier_tax_id}
                      </div>
                    </td>

                    {/* 👇 DATOS FINANCIEROS */}
                    <td className="px-3 py-3 text-right text-slate-600">
                      {/* Usamos 'subtotal' que es como viene del backend */}
                      {Number(purchase.subtotal || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {Number(purchase.gravado || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {Number(purchase.no_gravado || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {/* Usamos 'tax_amount' que es el nombre real del IGV en tu BD */}
                      {Number(purchase.tax_amount || 0).toFixed(2)}
                    </td>

                    <td
                      className={`px-4 py-3 text-right font-bold whitespace-nowrap ${purchase.currency === "USD" ? "text-emerald-600" : "text-blue-600"}`}
                    >
                      {purchase.currency === "USD" ? "$ " : "S/ "}
                      {Number(purchase.total).toFixed(2)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          purchase.payment_status === "PAID"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {purchase.payment_status === "PAID"
                          ? "PAGADO"
                          : "PENDIENTE"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedPurchaseId(purchase.id)}
                          className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-full transition"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() =>
                            navigate(`/purchases/edit/${purchase.id}`)
                          }
                          className="text-slate-500 hover:text-orange-500 p-1.5 rounded-full transition"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(purchase.id)}
                          className="text-slate-500 hover:text-red-500 p-1.5 rounded-full transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* PAGINACIÓN */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="text-sm text-slate-500">
          Página <b>{page}</b> de <b>{totalPages || 1}</b> ({totalCount}{" "}
          registros)
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1 || loading}
            className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages || totalPages === 0 || loading}
            className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {selectedPurchaseId && (
        <PurchaseDetailModal
          purchaseId={selectedPurchaseId}
          onClose={() => setSelectedPurchaseId(null)}
        />
      )}
    </div>
  );
};

export default PurchaseList;
