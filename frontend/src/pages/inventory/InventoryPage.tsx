import {
  AlertTriangle,
  ArrowRightLeft,
  Box,
  DollarSign,
  History,
  Package,
  Search,
  TrendingDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

interface StockItem {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  product_uom: string; // Ej: NIU, KG, LTR (Nuevo backend)
  category_name: string;
  quantity: number;
  min_stock: number; // Viene del nuevo backend
  average_cost: string;
  updated_at: string;
}

const InventoryPage = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // --- CARGAR INVENTARIO ---
  const fetchInventory = async () => {
    if (!currentBranch) return;
    setLoading(true);
    try {
      const res = await api.get(
        `/inventory/stocks/?branch_id=${currentBranch.id}`,
      );
      setStocks(res.data.results || res.data);
    } catch (error) {
      console.error("Error cargando inventario:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [currentBranch]);

  // --- CÁLCULOS & FILTROS ---
  const filteredStocks = stocks.filter(
    (item) =>
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.product_sku &&
        item.product_sku.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  // Cálculo de Valor Total del Almacén
  const totalInventoryValue = filteredStocks.reduce((acc, item) => {
    return acc + item.quantity * parseFloat(item.average_cost || "0");
  }, 0);

  // Conteo inteligente de productos críticos (usando min_stock en vez de 5)
  const lowStockCount = filteredStocks.filter(
    (i) => i.quantity > 0 && i.quantity <= i.min_stock,
  ).length;

  const outOfStockCount = filteredStocks.filter((i) => i.quantity <= 0).length;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Inventario Físico
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de stock y valorización en{" "}
            <strong>{currentBranch?.name}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BranchSelector />
          <button
            onClick={() => alert("Módulo de Ajustes próximamente")}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 transition shadow-sm"
          >
            <TrendingDown size={18} /> Ajuste / Merma
          </button>
          <button
            onClick={() => navigate("/inventory/transfers")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 transition shadow-sm"
          >
            <ArrowRightLeft size={18} /> Transferencias
          </button>
        </div>
      </div>

      {/* TARJETAS DE RESUMEN (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-green-50 text-green-600 rounded-lg">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Valorizado Total
            </p>
            <p className="text-2xl font-black text-slate-800">
              S/{" "}
              {totalInventoryValue.toLocaleString("es-PE", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
              Alertas de Stock
            </p>
            <div className="flex gap-4">
              <div>
                <p className="text-xl font-black text-orange-500">
                  {lowStockCount}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  Bajos
                </p>
              </div>
              <div className="border-l pl-4 border-slate-100">
                <p className="text-xl font-black text-red-600">
                  {outOfStockCount}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  Agotados
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Box size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Total SKUs Activos
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-800">
                {filteredStocks.length}
              </p>
              <span className="text-xs text-slate-400">ítems</span>
            </div>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-t-xl border border-slate-200 border-b-0 flex justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre, SKU..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* TABLA DE INVENTARIO */}
      <div className="bg-white rounded-b-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="p-4">Producto</th>
              <th className="p-4">Categoría</th>
              <th className="p-4 text-center">Stock Físico</th>
              <th className="p-4 text-right">Costo Prom.</th>
              <th className="p-4 text-right text-slate-700">Valor Total</th>
              <th className="p-4 text-center">Auditoría</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-500">
                  Cargando inventario...
                </td>
              </tr>
            ) : filteredStocks.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <Package size={48} className="mb-3 opacity-30" />
                    <p>No se encontraron productos en esta sede.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredStocks.map((item) => {
                const totalVal =
                  item.quantity * parseFloat(item.average_cost || "0");
                const isCritical = item.quantity <= item.min_stock;
                const isOutOfStock = item.quantity <= 0;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-bold text-slate-800">
                        {item.product_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400 font-mono">
                          {item.product_sku || "S/N"}
                        </span>
                        <span className="text-[10px] text-slate-300">|</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {item.product_uom || "UND"}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">
                      <span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                        {item.category_name || "General"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full font-bold text-xs inline-flex items-center gap-1.5 ${
                          isOutOfStock
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : isCritical
                              ? "bg-orange-50 text-orange-700 border border-orange-200"
                              : "bg-green-50 text-green-700 border border-green-200"
                        }`}
                      >
                        {isCritical && !isOutOfStock && (
                          <AlertTriangle size={12} />
                        )}
                        {item.quantity}
                      </span>
                    </td>
                    <td className="p-4 text-right text-slate-600 font-medium">
                      S/ {parseFloat(item.average_cost || "0").toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-bold text-slate-800">
                      S/ {totalVal.toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() =>
                          navigate(`/inventory/kardex/${item.product}`)
                        }
                        className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 hover:bg-blue-50 rounded bg-blue-50/50 inline-flex items-center gap-1.5 text-xs font-medium"
                      >
                        <History size={14} /> Kardex
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
  );
};

export default InventoryPage;
