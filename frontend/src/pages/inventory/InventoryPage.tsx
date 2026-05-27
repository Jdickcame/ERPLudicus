import {
  AlertTriangle,
  ArrowRightLeft,
  Box,
  DollarSign,
  History,
  Package,
  PlusCircle,
  Save,
  Search,
  TrendingDown,
  X,
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
  product_uom: string;
  category_name: string;
  quantity: number;
  min_stock: number;
  average_cost: string;
  updated_at: string;
}

interface GlobalProduct {
  id: number;
  name: string;
  sku: string;
  manage_stock: boolean;
}

const InventoryPage = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // --- ESTADOS PARA EL PANEL LATERAL (DRAWER) ---
  const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [adjType, setAdjType] = useState("MERMA_OUT");
  const [adjReason, setAdjReason] = useState("");
  const [adjQty, setAdjQty] = useState("");
  const [adjLoading, setAdjLoading] = useState(false);

  // --- ESTADOS PARA EL MODAL DE "AÑADIR AL SURTIDO LOCAL" ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [globalProducts, setGlobalProducts] = useState<GlobalProduct[]>([]);
  const [productToAdd, setProductToAdd] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // --- CARGAR INVENTARIO DE ESTA SEDE ---
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
    setIsDrawerOpen(false);
  }, [currentBranch]);

  // --- TRAER PRODUCTOS DEL CATÁLOGO GLOBAL ---
  const openAddModal = async () => {
    try {
      const res = await api.get("/inventory/products/?page_size=1000");
      const allProducts = res.data.results || res.data;

      // Filtramos: Solo los que manejan stock Y que AÚN NO existan en la tabla de esta sede
      const currentProductIds = stocks.map((s) => s.product);
      const selectable = allProducts.filter(
        (p: GlobalProduct) =>
          p.manage_stock && !currentProductIds.includes(p.id),
      );

      setGlobalProducts(selectable);
      setIsAddModalOpen(true);
    } catch (error) {
      console.error("Error cargando catálogo global:", error);
      alert("No se pudo cargar el catálogo global.");
    }
  };

  // --- GUARDAR EL NUEVO PRODUCTO EN LA SEDE (INICIA EN CERO) ---
  const handleAddProductToBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productToAdd || !currentBranch) return;

    setAddLoading(true);
    try {
      // Creamos la fila en el Stock explícitamente
      await api.post("/inventory/stocks/", {
        branch: currentBranch.id,
        product: parseInt(productToAdd),
        quantity: 0,
        average_cost: 0,
      });

      alert("Producto añadido al surtido de esta sede exitosamente.");
      setIsAddModalOpen(false);
      setProductToAdd("");
      fetchInventory(); // Recargamos para que aparezca el nuevo producto en cero
    } catch (error: any) {
      console.error(error);
      alert("Error al inicializar el producto en esta sede.");
    } finally {
      setAddLoading(false);
    }
  };

  // --- ABRIR EL PANEL LATERAL DE AJUSTES ---
  const handleOpenDrawer = (item: StockItem) => {
    setSelectedProduct(item);
    setAdjType("MERMA_OUT");
    setAdjReason("");
    setAdjQty("");
    setIsDrawerOpen(true);
  };

  // --- ENVIAR EL AJUSTE RÁPIDO ---
  const handleQuickAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch || !selectedProduct) return;
    if (!adjQty || parseFloat(adjQty) <= 0)
      return alert("Ingresa una cantidad válida.");

    setAdjLoading(true);
    try {
      const payload = {
        branch_id: currentBranch.id,
        type: adjType,
        reason: adjReason || "Ajuste rápido desde inventario",
        details: [
          {
            product_id: selectedProduct.product,
            quantity: parseFloat(adjQty),
          },
        ],
      };

      await api.post("/inventory/adjustments/", payload);
      alert("Ajuste registrado correctamente.");
      setIsDrawerOpen(false);
      fetchInventory();
    } catch (error: any) {
      console.error(error);
      alert(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          "Error registrando ajuste.",
      );
    } finally {
      setAdjLoading(false);
    }
  };

  // --- CÁLCULOS & FILTROS ---
  const filteredStocks = stocks.filter(
    (item) =>
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.product_sku &&
        item.product_sku.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const totalInventoryValue = filteredStocks.reduce((acc, item) => {
    return acc + item.quantity * parseFloat(item.average_cost || "0");
  }, 0);

  const lowStockCount = filteredStocks.filter(
    (i) => i.quantity > 0 && i.quantity <= i.min_stock,
  ).length;

  const outOfStockCount = filteredStocks.filter((i) => i.quantity <= 0).length;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500 relative">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Inventario Físico
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Surtido local y valorización en{" "}
            <strong>{currentBranch?.name}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BranchSelector />

          <button
            onClick={() => navigate("/inventory/transfers")}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 transition shadow-sm"
          >
            <ArrowRightLeft size={18} /> Transferencias
          </button>

          {/* NUEVO BOTÓN: Añadir al surtido local */}
          <button
            onClick={openAddModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 transition shadow-sm"
          >
            <PlusCircle size={18} /> Habilitar Producto
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
              SKUs en esta sede
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
            placeholder="Buscar en el inventario local..."
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
              <th className="p-4 text-center">Acciones</th>
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
                    <p>El surtido de esta sede está vacío.</p>
                    <button
                      onClick={openAddModal}
                      className="mt-4 text-blue-600 font-medium hover:underline"
                    >
                      Habilitar el primer producto
                    </button>
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
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    onClick={() => handleOpenDrawer(item)}
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
                      <button className="text-blue-600 p-1.5 rounded bg-blue-50/0 group-hover:bg-blue-50 transition-colors inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider">
                        Operar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================= */}
      {/* MODAL PARA AÑADIR PRODUCTO AL SURTIDO LOCAL */}
      {/* ========================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-slate-800">
                Habilitar Producto en Sede
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddProductToBranch} className="p-6">
              <p className="text-sm text-slate-500 mb-4">
                Selecciona un producto del catálogo global para empezar a
                controlar su stock en <strong>{currentBranch?.name}</strong>.
              </p>

              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                Catálogo Global
              </label>
              <select
                required
                value={productToAdd}
                onChange={(e) => setProductToAdd(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 mb-6"
              >
                <option value="">-- Elige un producto --</option>
                {globalProducts.length === 0 ? (
                  <option value="" disabled>
                    Todos los productos ya están en esta sede
                  </option>
                ) : (
                  globalProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.sku || "S/N"}] {p.name}
                    </option>
                  ))
                )}
              </select>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!productToAdd || addLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition disabled:opacity-50 shadow-sm"
                >
                  {addLoading ? "Añadiendo..." : "Habilitar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* DRAWER (PANEL LATERAL PARA OPERACIONES) */}
      {/* ========================================= */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-2xl border-l border-slate-200 transform transition-transform duration-300 ease-in-out z-50 flex flex-col ${
          isDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-800 leading-tight">
              {selectedProduct?.product_name}
            </h2>
            <p className="text-sm text-slate-500 font-mono mt-1 flex items-center gap-2">
              <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">
                {selectedProduct?.product_sku || "S/N"}
              </span>
              Sede: {currentBranch?.name}
            </p>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 rounded-full transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Resumen Actual */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Estado Actual
            </h3>
            <div className="flex gap-4">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex-1 text-center">
                <p className="text-3xl font-black text-blue-600">
                  {selectedProduct?.quantity}
                </p>
                <p className="text-xs text-slate-500 font-medium uppercase mt-1">
                  {selectedProduct?.product_uom}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex-1 text-center">
                <p className="text-3xl font-black text-slate-700">
                  S/{" "}
                  {parseFloat(selectedProduct?.average_cost || "0").toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 font-medium uppercase mt-1">
                  Costo Promedio
                </p>
              </div>
            </div>
          </div>

          {/* Formulario de Ajuste Rápido */}
          <div className="bg-white border border-orange-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 flex items-center gap-2">
              <TrendingDown className="text-orange-600" size={18} />
              <h3 className="text-sm font-bold text-orange-800">
                Ajuste de Inventario Rápido
              </h3>
            </div>
            <form onSubmit={handleQuickAdjustment} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Tipo de Movimiento
                </label>
                <select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  {/* 👇 NUEVO GRUPO DE PRODUCCIÓN 👇 */}
                  <optgroup label="Cocina / Fabricación">
                    <option value="PRODUCTION">
                      👨‍🍳 Orden de Producción (Preparar Receta)
                    </option>
                  </optgroup>

                  <optgroup label="Salidas">
                    <option value="MERMA_OUT">Salida por Merma / Rotura</option>
                    <option value="INTERNAL">Consumo Interno</option>
                    <option value="ADJUST_OUT">
                      Ajuste de Salida (Faltante)
                    </option>
                  </optgroup>
                  <optgroup label="Entradas">
                    <option value="ADJUST_IN">
                      Ajuste de Entrada (Sobrante)
                    </option>
                    <option value="INITIAL">Inventario Inicial</option>
                  </optgroup>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Cantidad
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={adjQty}
                      onChange={(e) => setAdjQty(e.target.value)}
                      className="w-full p-2 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="0.00"
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                      {selectedProduct?.product_uom}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Observación
                  </label>
                  <input
                    type="text"
                    required
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    placeholder="Motivo..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={adjLoading}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg flex justify-center items-center gap-2 transition disabled:opacity-50 text-sm"
              >
                <Save size={16} />{" "}
                {adjLoading ? "Procesando..." : "Confirmar Ajuste"}
              </button>
            </form>
          </div>

          <div className="pt-4 border-t border-slate-100 text-center">
            <button
              onClick={() =>
                navigate(`/inventory/kardex/${selectedProduct?.product}`)
              }
              className="text-blue-600 font-bold text-sm hover:underline inline-flex items-center gap-1.5"
            >
              <History size={16} /> Ver historial completo en Kardex
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;
