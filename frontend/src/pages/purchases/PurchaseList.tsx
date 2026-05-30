import {
  ArrowDown,
  ArrowUp,
  Calendar, // 👇 Importamos el icono
  Download,
  Edit,
  Eye,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import Pagination from "../../components/common/Pagination";
import PurchaseDetailModal from "../../components/purchases/PurchaseDetailModal";
import { useBranch } from "../../context/BranchContext";

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

  const [viewType, setViewType] = useState<"PURCHASES" | "NOTES">("PURCHASES");

  // --- ESTADOS DE DATOS ---
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // --- ESTADOS DE FILTROS ---
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 500);
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [costTypeFilter, setCostTypeFilter] = useState("ALL");

  // 👇 NUEVO: Estados para el Periodo Contable 👇
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const months = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  // --- ESTADOS DE PAGINACIÓN Y ORDEN ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [ordering, setOrdering] = useState("-issue_date");

  const [selectedItem, setSelectedItem] = useState<{
    id: number;
    type: "PURCHASES" | "NOTES";
  } | null>(null);

  // --- FUNCIÓN DE CARGA DINÁMICA ---
  const fetchPurchases = useCallback(async () => {
    if (!currentBranch) return;
    setLoading(true);

    try {
      const params: any = {
        branch_id: currentBranch.id,
        page: page,
        page_size: pageSize,
        ordering: ordering,
        year: selectedYear, // 👈 Agregamos el Año
        month: selectedMonth, // 👈 Agregamos el Mes
      };

      if (debouncedSearch) params.search = debouncedSearch;
      if (currencyFilter !== "ALL") params.currency = currencyFilter;

      if (viewType === "PURCHASES" && costTypeFilter !== "ALL") {
        params.cost_type = costTypeFilter;
      }

      const endpoint =
        viewType === "PURCHASES"
          ? "/purchases/purchases/"
          : "/purchases/notes/";

      const response = await api.get(endpoint, { params });

      const data = response.data.results || response.data;
      setPurchases(Array.isArray(data) ? data : []);
      setTotalCount(response.data.count || data.length || 0);
    } catch (error) {
      console.error("Error cargando registros:", error);
    } finally {
      setLoading(false);
    }
  }, [
    currentBranch,
    page,
    pageSize,
    debouncedSearch,
    currencyFilter,
    costTypeFilter,
    ordering,
    viewType,
    selectedYear, // 👈 Dependencia del año
    selectedMonth, // 👈 Dependencia del mes
  ]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  // Reiniciar a la página 1 si cambia CUALQUIER filtro (incluyendo mes y año)
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    currencyFilter,
    costTypeFilter,
    currentBranch,
    viewType,
    selectedYear, // 👈 Escucha cambios de año
    selectedMonth, // 👈 Escucha cambios de mes
  ]);

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
    if (
      !window.confirm(
        `¿Eliminar ${
          viewType === "NOTES" ? "Nota" : "Compra"
        }? Esto revertirá los movimientos de stock y saldos.`,
      )
    )
      return;
    try {
      const endpoint =
        viewType === "PURCHASES"
          ? `/purchases/purchases/${id}/`
          : `/purchases/notes/${id}/`;
      await api.delete(endpoint);
      fetchPurchases();
    } catch (error) {
      alert("Error al eliminar el documento.");
    }
  };

  const handleExportExcel = async () => {
    if (!currentBranch) return;
    try {
      const params: any = {
        branch_id: currentBranch.id,
        year: selectedYear, // 👈 El Excel también respetará el periodo
        month: selectedMonth, // 👈 El Excel también respetará el periodo
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (currencyFilter !== "ALL") params.currency = currencyFilter;
      if (costTypeFilter !== "ALL") params.cost_type = costTypeFilter;

      const response = await api.get("/purchases/purchases/export_excel/", {
        params,
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Historial_Compras_${selectedMonth}_${selectedYear}.xlsx`,
      );
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
      {/* CABECERA (Ahora incluye los selectores como en el Dashboard) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Gestión de Compras
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Total registros: <strong>{totalCount}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BranchSelector />
          <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

          {/* 👇 Selector de Periodo 👇 */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <Calendar size={16} className="text-slate-500" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value={currentDate.getFullYear()}>
                {currentDate.getFullYear()}
              </option>
              <option value={currentDate.getFullYear() - 1}>
                {currentDate.getFullYear() - 1}
              </option>
              <option value={currentDate.getFullYear() - 2}>
                {currentDate.getFullYear() - 2}
              </option>
            </select>
          </div>

          <div className="h-6 w-px bg-slate-200 hidden lg:block"></div>

          {/* Botones de acción */}
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
            <Plus size={18} /> Nuevo
          </Link>
        </div>
      </div>

      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        <button
          onClick={() => setViewType("PURCHASES")}
          className={`px-6 py-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            viewType === "PURCHASES"
              ? "border-blue-600 text-blue-600 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <FileText size={18} /> Facturas y Boletas
        </button>
        <button
          onClick={() => setViewType("NOTES")}
          className={`px-6 py-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            viewType === "NOTES"
              ? "border-orange-500 text-orange-600 bg-orange-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <RefreshCcw size={18} /> Notas de Crédito / Débito
        </button>
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
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-slate-700 appearance-none cursor-pointer disabled:opacity-50 disabled:bg-slate-100"
            value={costTypeFilter}
            onChange={(e) => setCostTypeFilter(e.target.value)}
            disabled={viewType === "NOTES"}
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
                    Proveedor {getSortIcon("supplier__name")}
                  </div>
                </th>

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
                    No se encontraron registros en este periodo.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => {
                  const docName =
                    viewType === "NOTES"
                      ? purchase.note_type === "07"
                        ? "NOTA DE CRÉDITO"
                        : "NOTA DE DÉBITO"
                      : purchase.document_type;

                  const totalColor =
                    viewType === "NOTES" && purchase.note_type === "07"
                      ? "text-orange-600"
                      : purchase.currency === "USD"
                        ? "text-emerald-600"
                        : "text-blue-600";

                  return (
                    <tr
                      key={purchase.id}
                      className="bg-white border-b hover:bg-slate-50 transition"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {purchase.issue_date}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {docName} <br />
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
                        {viewType === "PURCHASES" && (
                          <div className="text-slate-400">
                            RUC: {purchase.supplier_tax_id}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-slate-600">
                        {Number(purchase.subtotal || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {Number(purchase.gravado || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {Number(purchase.no_gravado || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {Number(purchase.tax_amount || 0).toFixed(2)}
                      </td>

                      <td
                        className={`px-4 py-3 text-right font-bold whitespace-nowrap ${totalColor}`}
                      >
                        {purchase.currency === "USD" ? "$ " : "S/ "}
                        {Number(
                          purchase.total || purchase.total_net_pay || 0,
                        ).toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {viewType === "NOTES" ? (
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            APLICADA
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded-full text-[10px] font-bold ${purchase.payment_status === "PAID" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          >
                            {purchase.payment_status === "PAID"
                              ? "PAGADO"
                              : "PENDIENTE"}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() =>
                              setSelectedItem({
                                id: purchase.id,
                                type: viewType,
                              })
                            }
                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-full transition"
                            title="Ver Detalle"
                          >
                            <Eye size={16} />
                          </button>

                          {viewType === "PURCHASES" && (
                            <button
                              onClick={() =>
                                navigate(`/purchases/edit/${purchase.id}`)
                              }
                              className="text-slate-500 hover:text-orange-500 p-1.5 rounded-full transition"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(purchase.id)}
                            className="text-slate-500 hover:text-red-500 p-1.5 rounded-full transition"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

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

      {/* MODAL */}
      {selectedItem && (
        <PurchaseDetailModal
          purchaseId={selectedItem.id}
          type={selectedItem.type}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};

export default PurchaseList;
