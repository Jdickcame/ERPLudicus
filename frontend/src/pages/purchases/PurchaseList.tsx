import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react"; // Agregamos useCallback
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import PurchaseDetailModal from "../../components/purchases/PurchaseDetailModal";
import { useBranch } from "../../context/BranchContext";

// Hook simple para "Debounce" (esperar a que termines de escribir para buscar)
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
  const [totalCount, setTotalCount] = useState(0); // Total de registros en BD

  // --- ESTADOS DE FILTROS ---
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 500); // Espera 500ms
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [costTypeFilter, setCostTypeFilter] = useState("ALL"); // Nuevo filtro CV/CF

  // --- ESTADOS DE PAGINACIÓN Y ORDEN ---
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [ordering, setOrdering] = useState("-issue_date"); // Por defecto fecha desc

  // Modal
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(
    null,
  );

  // --- FUNCIÓN DE CARGA (SERVER SIDE) ---
  const fetchPurchases = useCallback(async () => {
    if (!currentBranch) return;
    setLoading(true);

    try {
      // Construimos los parámetros URL dinámicamente
      const params: any = {
        branch_id: currentBranch.id,
        page: page,
        page_size: pageSize,
        ordering: ordering,
      };

      // Agregamos filtros solo si tienen valor
      if (debouncedSearch) params.search = debouncedSearch;
      if (currencyFilter !== "ALL") params.currency = currencyFilter;
      if (costTypeFilter !== "ALL") params.cost_type = costTypeFilter;

      const response = await api.get("/purchases/purchases/", { params });

      // DRF devuelve { count: 100, next: "...", results: [...] }
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

  // Recargar cuando cambie cualquier filtro
  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  // Resetear página a 1 si cambian los filtros (pero no el orden)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, currencyFilter, costTypeFilter, currentBranch]);

  // --- MANEJADORES ---
  const handleSort = (field: string) => {
    // Si ya estamos ordenando por ese campo, invertimos el signo
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
      fetchPurchases(); // Recargar datos frescos
    } catch (error) {
      alert("Error al eliminar");
    }
  };

  // Cálculos de paginación visual
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
        <Link
          to="/purchases/new"
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 transition shadow-md"
        >
          <Plus size={20} /> Nueva Compra
        </Link>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 1. Buscador Texto */}
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

        {/* 2. Filtro Moneda */}
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

        {/* 3. Filtro Costo (NUEVO) */}
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
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-4">
        {loading ? (
          <div className="py-20 flex justify-center items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" /> Cargando datos...
          </div>
        ) : (
          <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b select-none">
              <tr>
                <th
                  className="px-6 py-3 cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("issue_date")}
                >
                  <div className="flex items-center">
                    Fecha {getSortIcon("issue_date")}
                  </div>
                </th>
                <th className="px-6 py-3">Documento</th>
                <th
                  className="px-6 py-3 cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("supplier__name")}
                >
                  <div className="flex items-center">
                    Proveedor {getSortIcon("supplier__name")}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-center cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("cost_type")}
                >
                  <div className="flex justify-center items-center">
                    Costo {getSortIcon("cost_type")}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("total_net_pay")}
                >
                  <div className="flex justify-end items-center">
                    Total {getSortIcon("total_net_pay")}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-center cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("payment_status")}
                >
                  <div className="flex justify-center items-center">
                    Estado {getSortIcon("payment_status")}
                  </div>
                </th>
                <th className="px-6 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    No se encontraron registros.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className="bg-white border-b hover:bg-slate-50 transition"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {purchase.issue_date}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {purchase.document_type} <br />
                      <span className="text-xs text-slate-500 font-normal">
                        {purchase.series}-{purchase.number}
                      </span>
                    </td>
                    <td
                      className="px-6 py-4 truncate max-w-[200px]"
                      title={purchase.supplier_name}
                    >
                      {purchase.supplier_name}
                    </td>

                    {/* COSTO */}
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold border ${
                          purchase.cost_type === "CV"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-orange-50 text-orange-700 border-orange-200"
                        }`}
                      >
                        {purchase.cost_type === "CV" ? "VARIABLE" : "FIJO"}
                      </span>
                    </td>

                    {/* TOTAL */}
                    <td
                      className={`px-6 py-4 text-right font-bold ${purchase.currency === "USD" ? "text-green-600" : "text-slate-900"}`}
                    >
                      {purchase.currency === "USD" ? "$ " : "S/ "}
                      {Number(purchase.total).toFixed(2)}
                    </td>

                    {/* ESTADO */}
                    <td className="px-6 py-4 text-center">
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

                    {/* ACCIONES */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedPurchaseId(purchase.id)}
                          className="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() =>
                            navigate(`/purchases/edit/${purchase.id}`)
                          }
                          className="text-slate-500 hover:text-orange-500 p-2 rounded-full transition"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(purchase.id)}
                          className="text-slate-500 hover:text-red-500 p-2 rounded-full transition"
                        >
                          <Trash2 size={18} />
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

      {/* 👇 PAGINACIÓN REAL (SERVER SIDE) */}
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
