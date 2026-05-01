import { Edit, Package, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector"; // <--- 1. Importar Selector
import { useBranch } from "../../context/BranchContext";

interface StockItem {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  category_name: string;
  quantity: number;
  price: number;
}

const Products = () => {
  const { currentBranch } = useBranch();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchInventory = async () => {
      if (!currentBranch) return;

      setLoading(true);
      try {
        const res = await api.get(
          `/inventory/stocks/?branch_id=${currentBranch.id}`,
        );
        setItems(res.data);
      } catch (error) {
        console.error("Error fetching inventory", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, [currentBranch]);

  const filteredItems = items.filter(
    (item) =>
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product_sku?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          {/* 👇 2. AQUÍ AGREGAMOS EL SELECTOR */}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Package className="text-blue-600" /> Inventario
            </h1>
            <BranchSelector />
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de existencias en {currentBranch?.name}
          </p>
        </div>

        <button
          onClick={() => navigate("/inventory/new")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition shadow-sm"
        >
          <Plus size={20} />
          Nuevo Producto
        </button>
      </div>

      {/* Filtros y Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 text-slate-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
            <tr>
              <th className="px-6 py-4">SKU</th>
              <th className="px-6 py-4">Producto</th>
              <th className="px-6 py-4">Categoría</th>
              <th className="px-6 py-4 text-center">Stock Actual</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center p-8">
                  Cargando inventario de {currentBranch?.name}...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center p-8">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <Package size={48} className="mb-2 opacity-50" />
                    <p>No hay productos en esta sede.</p>
                    <span className="text-xs">
                      Registra una compra para aumentar el stock.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-mono text-slate-500">
                    {item.product_sku || "-"}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800">
                    {item.product_name}
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs border border-slate-200">
                      {item.category_name || "General"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        item.quantity < 10
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {item.quantity} un.
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Ver Kardex"
                      // Asegúrate de tener esta ruta o quita el onClick
                      onClick={() =>
                        navigate(`/inventory/kardex/${item.product}`)
                      }
                    >
                      <Edit size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Products;
