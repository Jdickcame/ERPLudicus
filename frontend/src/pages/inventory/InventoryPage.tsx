import {
    AlertTriangle,
    ArrowRightLeft,
    Box,
    DollarSign,
    History,
    Package,
    Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // O tu router de preferencia
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

interface StockItem {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  category_name: string;
  quantity: number;
  average_cost: string; // Viene como string del DecimalField
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
      // Llamamos al endpoint que creamos: /api/inventory/stocks/?branch_id=X
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

  // 1. Filtrado en cliente (para rapidez en listas medianas)
  const filteredStocks = stocks.filter(
    (item) =>
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product_sku.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // 2. Cálculo de Valor Total del Almacén
  const totalInventoryValue = filteredStocks.reduce((acc, item) => {
    return acc + item.quantity * parseFloat(item.average_cost || "0");
  }, 0);

  // 3. Conteo de productos críticos
  const lowStockCount = filteredStocks.filter(
    (i) => i.quantity > 0 && i.quantity <= 5,
  ).length;
  const outOfStockCount = filteredStocks.filter((i) => i.quantity === 0).length;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Inventario Físico
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de stock y valorización en{" "}
            <strong>{currentBranch?.name}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BranchSelector />
          <button
            onClick={() => navigate("/inventory/transfers")} // Ruta futura
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 transition shadow-sm"
          >
            <ArrowRightLeft size={18} /> Transferencias
          </button>
        </div>
      </div>

      {/* TARJETAS DE RESUMEN (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* KPI 1: Valor Total */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
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

        {/* KPI 2: Alertas de Stock (MEJORADO) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
              Alertas de Stock
            </p>
            <div className="flex gap-4">
              {/* Columna Stock Bajo */}
              <div>
                <p className="text-xl font-black text-orange-500">
                  {lowStockCount}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  Bajos
                </p>
              </div>
              {/* Columna Agotados (Aquí usamos la variable que faltaba) */}
              <div className="border-l pl-4 border-slate-100">
                <p className="text-xl font-black text-red-600">
                  {outOfStockCount}
                </p>{" "}
                {/* 👈 AQUÍ SE USA */}
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  Agotados
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3: Total Items */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Box size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Total SKUs
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-slate-800">
                {filteredStocks.length}
              </p>
              <span className="text-xs text-slate-400">items</span>
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
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* TABLA DE INVENTARIO */}
      <div className="bg-white rounded-b-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-xs">
            <tr>
              <th className="p-4">Producto</th>
              <th className="p-4">Categoría</th>
              <th className="p-4 text-center">Stock</th>
              <th className="p-4 text-right">Costo Prom.</th>
              <th className="p-4 text-right text-blue-700">Valor Total</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  Cargando inventario...
                </td>
              </tr>
            ) : filteredStocks.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  No se encontraron productos en esta sede.
                </td>
              </tr>
            ) : (
              filteredStocks.map((item) => {
                const totalVal = item.quantity * parseFloat(item.average_cost);

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-bold text-slate-800">
                        {item.product_name}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {item.product_sku}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium">
                        {item.category_name}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full font-bold text-xs ${
                          item.quantity === 0
                            ? "bg-red-100 text-red-700"
                            : item.quantity <= 5
                              ? "bg-orange-100 text-orange-700"
                              : "bg-green-100 text-green-700"
                        }`}
                      >
                        {item.quantity}
                      </span>
                    </td>
                    <td className="p-4 text-right text-slate-600 font-mono">
                      S/ {parseFloat(item.average_cost).toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-bold text-blue-700 font-mono bg-blue-50/30">
                      S/ {totalVal.toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() =>
                          navigate(`/inventory/kardex/${item.product}`)
                        }
                        className="text-slate-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-full"
                        title="Ver Kardex (Historial)"
                      >
                        <History size={18} />
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
