import {
  Box,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Edit,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";

// Hook para "Debounce" (espera a que el usuario deje de escribir para buscar)
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const Products = () => {
  // --- ESTADOS DE DATOS ---
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // --- ESTADOS DE FILTROS ---
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // --- CARGA DINÁMICA ---
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: page,
        page_size: pageSize,
        ordering: "-id",
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      // Consumimos el nuevo endpoint de productos
      const response = await api.get("/inventory/products/", { params });

      if (response.data && response.data.results) {
        setProducts(response.data.results);
        setTotalCount(response.data.count);
      } else {
        const allData = Array.isArray(response.data) ? response.data : [];
        setTotalCount(allData.length);
        const startIndex = (page - 1) * pageSize;
        setProducts(allData.slice(startIndex, startIndex + pageSize));
      }
    } catch (error) {
      console.error("Error cargando productos:", error);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // --- LÓGICA DE ELIMINACIÓN (Soft Delete) ---
  const handleDelete = async (id: number, name: string) => {
    if (
      !window.confirm(
        `¿Estás seguro de inhabilitar el producto "${name}"? No se borrará del historial.`,
      )
    )
      return;
    try {
      await api.delete(`/inventory/products/${id}/`);
      loadProducts();
    } catch (error) {
      console.error(error);
      alert("Error al eliminar el producto");
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // --- RENDERIZADORES VISUALES ---
  const renderProductTypeBadge = (type: string, display: string) => {
    switch (type) {
      case "STOCKED":
        return (
          <span className="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
            <Package size={12} /> Almacenable
          </span>
        );
      case "CONSUMABLE":
        return (
          <span className="bg-orange-50 text-orange-600 border border-orange-200 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
            <Box size={12} /> Insumo
          </span>
        );
      case "FINISHED":
        return (
          <span className="bg-purple-50 text-purple-600 border border-purple-200 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
            <ChefHat size={12} /> Preparado
          </span>
        );
      case "SERVICE":
        return (
          <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
            <Wrench size={12} /> Servicio
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold">
            {display}
          </span>
        );
    }
  };

  return (
    <div className="p-6 animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">
              Catálogo de Productos
            </h1>
            <BranchSelector />
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Gestión global de items, insumos y recetas ({totalCount} registros)
          </p>
        </div>
        <button
          onClick={() => alert("Pronto abriremos el Modal de Nuevo Producto")}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition shadow-sm font-medium"
        >
          <Plus size={18} /> Nuevo Producto
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 relative">
        <Search className="absolute left-6 top-6 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre, SKU o categoría..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto mb-4">
        {loading ? (
          <div className="py-20 flex justify-center items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" /> Cargando catálogo...
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 uppercase text-[10px] tracking-wider text-slate-500 font-bold border-b select-none">
              <tr>
                <th className="p-4">SKU / Código</th>
                <th className="p-4">Producto</th>
                <th className="p-4">Clasificación</th>
                <th className="p-4">Tipo</th>
                <th className="p-4 text-right">Precio Base</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-10 text-slate-400 text-sm"
                  >
                    No se encontraron productos en el catálogo.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 group transition">
                    <td className="p-4 font-mono text-slate-500 font-medium">
                      {p.sku || "-"}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800 text-sm">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                        Medida: {p.uom_display}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-slate-700">
                        {p.area_name || "Sin Área"}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        {p.category_name || "Sin Categoría"}
                      </div>
                    </td>
                    <td className="p-4">
                      {renderProductTypeBadge(p.product_type, p.type_display)}
                    </td>
                    <td className="p-4 text-right">
                      {p.price > 0 ? (
                        <span className="font-bold text-slate-700">
                          S/ {parseFloat(p.price).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">
                          No aplicable
                        </span>
                      )}
                    </td>
                    <td className="p-4 flex justify-center gap-1.5">
                      <button
                        onClick={() => alert("Editar " + p.name)}
                        className="bg-blue-50 text-blue-600 p-1.5 rounded-full hover:bg-blue-100 transition-colors"
                        title="Editar Producto"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                        title="Inhabilitar Producto"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* PAGINACIÓN */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="text-sm text-slate-500">
          Página <b className="text-slate-700">{page}</b> de{" "}
          <b className="text-slate-700">{totalPages || 1}</b>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1 || loading}
            className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50 transition text-slate-600"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages || totalPages === 0 || loading}
            className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50 transition text-slate-600"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Products;
