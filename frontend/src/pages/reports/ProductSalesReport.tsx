import {
  BarChart3,
  DollarSign,
  Download,
  Eye,
  Filter,
  Layers,
  Package,
  Search,
  Tags,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

// --- INTERFACES ---
interface ProductSaleItem {
  product_id: number;
  product_name: string;
  product_sku: string;
  category_name: string;
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
}

interface CategorySaleItem {
  category_name: string;
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
}

interface ReportSummary {
  total_items_sold: number;
  total_revenue: number;
  total_cost: number;
  total_gross_profit: number;
}

const ProductSalesReport = () => {
  const { currentBranch } = useBranch();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ProductSaleItem[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({
    total_items_sold: 0,
    total_revenue: 0,
    total_cost: 0,
    total_gross_profit: 0,
  });

  const [viewMode, setViewMode] = useState<"product" | "category">("product");

  // 👇 NUEVO ESTADO: Categoría seleccionada para el filtro 👇
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");

  // Filtros por defecto
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const [filters, setFilters] = useState({
    startDate: firstDay.toISOString().split("T")[0],
    endDate: today.toISOString().split("T")[0],
    search: "",
  });

  const [showFilters, setShowFilters] = useState(false);

  const fetchReport = async () => {
    if (!currentBranch) return;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.append("branch_id", currentBranch.id.toString());
      if (filters.startDate) params.append("start_date", filters.startDate);
      if (filters.endDate) params.append("end_date", filters.endDate);

      const response = await api.get(
        `/reports/product-sales/?${params.toString()}`,
      );

      setSummary(response.data.summary);
      setResults(response.data.results);
      setSelectedCategory("Todas"); // Reiniciamos el filtro al traer nuevos datos
    } catch (error) {
      console.error("Error cargando el reporte:", error);
      alert("❌ Error al cargar el reporte. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranch]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  // Extraer las categorías únicas para llenar el Select
  const availableCategories = useMemo(() => {
    const cats = new Set(results.map((r) => r.category_name || "General"));
    return ["Todas", ...Array.from(cats).sort()];
  }, [results]);

  // Agrupar los resultados por Categoría automáticamente
  const categoryResults = useMemo(() => {
    const grouped: Record<string, CategorySaleItem> = {};
    results.forEach((item) => {
      const cat = item.category_name || "General";
      if (!grouped[cat]) {
        grouped[cat] = {
          category_name: cat,
          total_quantity: 0,
          total_revenue: 0,
          total_cost: 0,
          gross_profit: 0,
        };
      }
      grouped[cat].total_quantity += item.total_quantity;
      grouped[cat].total_revenue += item.total_revenue;
      grouped[cat].total_cost += item.total_cost;
      grouped[cat].gross_profit += item.gross_profit;
    });
    return Object.values(grouped).sort(
      (a, b) => b.total_revenue - a.total_revenue,
    );
  }, [results]);

  // 👇 LÓGICA ACTUALIZADA: Filtra por búsqueda Y por categoría seleccionada 👇
  const filteredProducts = results.filter((item) => {
    const catName = item.category_name || "General";
    const matchesSearch =
      item.product_name.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.product_sku?.toLowerCase().includes(filters.search.toLowerCase());

    const matchesCategory =
      selectedCategory === "Todas" || catName === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const filteredCategories = categoryResults.filter((item) =>
    item.category_name.toLowerCase().includes(filters.search.toLowerCase()),
  );

  const exportToExcel = () => {
    if (results.length === 0) {
      alert("No hay datos para exportar en este periodo.");
      return;
    }

    let dataForExcel;
    let wscols;

    if (viewMode === "product") {
      dataForExcel = filteredProducts.map((item) => {
        const marginPercent =
          item.total_revenue > 0
            ? ((item.gross_profit / item.total_revenue) * 100).toFixed(1)
            : "0.0";
        return {
          Producto: item.product_name,
          SKU: item.product_sku || "SIN SKU",
          Categoría: item.category_name || "General",
          "Cant. Vendida": item.total_quantity,
          "Venta Total (S/)": Number(item.total_revenue.toFixed(2)),
          "Costo Total (S/)": Number(item.total_cost.toFixed(2)),
          "Utilidad Neta (S/)": Number(item.gross_profit.toFixed(2)),
          "Margen (%)": Number(marginPercent),
        };
      });
      wscols = [
        { wch: 35 },
        { wch: 15 },
        { wch: 20 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
      ];
    } else {
      dataForExcel = filteredCategories.map((item) => {
        const marginPercent =
          item.total_revenue > 0
            ? ((item.gross_profit / item.total_revenue) * 100).toFixed(1)
            : "0.0";
        return {
          Categoría: item.category_name,
          "Cant. Productos": item.total_quantity,
          "Venta Total (S/)": Number(item.total_revenue.toFixed(2)),
          "Costo Total (S/)": Number(item.total_cost.toFixed(2)),
          "Utilidad Neta (S/)": Number(item.gross_profit.toFixed(2)),
          "Margen (%)": Number(marginPercent),
        };
      });
      wscols = [
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
      ];
    }

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      viewMode === "product" ? "Por Producto" : "Por Categoría",
    );
    worksheet["!cols"] = wscols;

    const fileName = `Reporte_${
      viewMode === "product" ? "Productos" : "Categorias"
    }_${filters.startDate}_al_${filters.endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <BarChart3 className="text-blue-600" /> Reporte de Ventas
            </h1>
            <BranchSelector />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Análisis de ventas, costos y utilidades por ítem y clasificación.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition shadow-sm font-medium text-sm ${
              showFilters
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Filter size={16} /> Filtros
          </button>
          <button
            onClick={exportToExcel}
            className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-100 transition shadow-sm font-bold text-sm"
          >
            <Download size={16} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* PANEL DE FILTROS FECHAS */}
      {showFilters && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                Desde
              </label>
              <input
                type="date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                Hasta
              </label>
              <input
                type="date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button
                onClick={fetchReport}
                className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-sm flex items-center justify-center gap-2"
              >
                <Search size={16} /> Generar Reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TARJETAS RESUMEN (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ... Igual que antes ... */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Venta Bruta
              </p>
              <h3 className="text-2xl font-black text-slate-800 mt-1">
                S/ {summary.total_revenue.toFixed(2)}
              </h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <DollarSign size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Costo Mercadería
              </p>
              <h3 className="text-2xl font-black text-red-600 mt-1">
                S/ {summary.total_cost.toFixed(2)}
              </h3>
            </div>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <TrendingUp size={20} className="rotate-180" />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-200 bg-emerald-50/30 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                Utilidad Bruta
              </p>
              <h3 className="text-2xl font-black text-emerald-700 mt-1">
                S/ {summary.total_gross_profit.toFixed(2)}
              </h3>
            </div>
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Unidades Vendidas
              </p>
              <h3 className="text-2xl font-black text-slate-800 mt-1">
                {summary.total_items_sold}
              </h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Package size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* TABLA DE RESULTADOS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="flex bg-slate-200/60 p-1 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode("product")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                viewMode === "product"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Package size={16} /> Por Producto
            </button>
            <button
              onClick={() => setViewMode("category")}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                viewMode === "category"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Layers size={16} /> Por Categoría
            </button>
          </div>

          {/* 👇 CONTROLES DE BÚSQUEDA Y FILTRO CATEGORÍA 👇 */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
            {viewMode === "product" && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full sm:w-auto px-4 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === "Todas" ? "Todas las categorías" : cat}
                  </option>
                ))}
              </select>
            )}

            <div className="relative w-full sm:w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                placeholder={
                  viewMode === "product"
                    ? "Buscar producto..."
                    : "Buscar categoría..."
                }
                className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-white border-b font-bold uppercase text-[10px] tracking-wider text-slate-400">
              <tr>
                {viewMode === "product" ? (
                  <>
                    <th className="p-4">Producto</th>
                    <th className="p-4">Categoría</th>
                  </>
                ) : (
                  <th className="p-4">Categoría</th>
                )}
                <th className="p-4 text-center">Cant. Vendida</th>
                <th className="p-4 text-right">Venta (S/)</th>
                <th className="p-4 text-right">Costo (S/)</th>
                <th className="p-4 text-right">Utilidad (S/)</th>
                <th className="p-4 text-center">Margen %</th>
                {/* 👇 COLUMNA ACCIONES PARA CATEGORÍAS 👇 */}
                {viewMode === "category" && (
                  <th className="p-4 text-center">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-12 text-center text-slate-400 animate-pulse font-medium"
                  >
                    Calculando utilidades...
                  </td>
                </tr>
              ) : (viewMode === "product" && filteredProducts.length === 0) ||
                (viewMode === "category" && filteredCategories.length === 0) ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    No se encontraron ventas para este filtro o periodo.
                  </td>
                </tr>
              ) : viewMode === "product" ? (
                // --- RENDERIZAR PRODUCTOS ---
                filteredProducts.map((item, index) => {
                  const marginPercent =
                    item.total_revenue > 0
                      ? (
                          (item.gross_profit / item.total_revenue) *
                          100
                        ).toFixed(1)
                      : "0.0";

                  return (
                    <tr
                      key={index}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="p-4">
                        <div className="font-bold text-slate-700">
                          {item.product_name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {item.product_sku || "SIN SKU"}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 w-max">
                          <Tags size={12} /> {item.category_name || "General"}
                        </span>
                      </td>
                      <td className="p-4 text-center font-black text-slate-700">
                        {item.total_quantity}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-700">
                        {item.total_revenue.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-medium text-red-500">
                        {item.total_cost.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-black text-emerald-600">
                        {item.gross_profit.toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                            Number(marginPercent) > 50
                              ? "bg-emerald-100 text-emerald-700"
                              : Number(marginPercent) > 20
                              ? "bg-blue-100 text-blue-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {marginPercent}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                // --- RENDERIZAR CATEGORÍAS ---
                filteredCategories.map((item, index) => {
                  const marginPercent =
                    item.total_revenue > 0
                      ? (
                          (item.gross_profit / item.total_revenue) *
                          100
                        ).toFixed(1)
                      : "0.0";

                  return (
                    <tr
                      key={index}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="p-4">
                        <div className="font-bold text-slate-700 flex items-center gap-2">
                          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                            <Layers size={16} />
                          </div>
                          {item.category_name}
                        </div>
                      </td>
                      <td className="p-4 text-center font-black text-slate-700">
                        {item.total_quantity}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-700">
                        {item.total_revenue.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-medium text-red-500">
                        {item.total_cost.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-black text-emerald-600">
                        {item.gross_profit.toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                            Number(marginPercent) > 50
                              ? "bg-emerald-100 text-emerald-700"
                              : Number(marginPercent) > 20
                              ? "bg-blue-100 text-blue-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {marginPercent}%
                        </span>
                      </td>
                      {/* 👇 BOTÓN DE DESGLOSE (DRILL-DOWN) 👇 */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedCategory(item.category_name);
                            setViewMode("product");
                          }}
                          className="flex items-center justify-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-all mx-auto active:scale-95"
                        >
                          <Eye size={14} /> Ver productos
                        </button>
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

export default ProductSalesReport;
