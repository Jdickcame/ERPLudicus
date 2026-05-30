import {
  ArrowDown,
  ArrowUp,
  Box,
  ChefHat,
  Download, // 👈 Importamos el ícono de descarga
  Edit,
  Link,
  Loader2,
  Package,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import Pagination from "../../components/common/Pagination";
import { useBranch } from "../../context/BranchContext";

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
  const navigate = useNavigate();
  const { currentBranch } = useBranch();

  // --- ESTADOS DE DATOS ---
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // --- ESTADOS DE FILTROS ---
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ordering, setOrdering] = useState("-id");

  // --- ESTADOS DE EDICIÓN RÁPIDA (Precios por sede) ---
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [tempPrice, setTempPrice] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false); // 👈 Estado para el botón de Excel

  // --- CARGA DINÁMICA ---
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: page,
        page_size: pageSize,
        ordering: ordering,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      if (currentBranch) {
        params.branch_id = currentBranch.id;
      }

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
  }, [page, debouncedSearch, ordering, currentBranch]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, currentBranch]);

  // --- ORDENAMIENTO ---
  const handleSort = (field: string) => {
    if (ordering === field) {
      setOrdering(`-${field}`);
    } else if (ordering === `-${field}`) {
      setOrdering("name");
    } else {
      setOrdering(field);
    }
  };

  const getSortIcon = (field: string) => {
    if (ordering === field)
      return <ArrowUp size={12} className="inline ml-1" />;
    if (ordering === `-${field}`)
      return <ArrowDown size={12} className="inline ml-1" />;
    return <ArrowUp size={12} className="inline ml-1 opacity-30" />;
  };

  // --- LÓGICA DE EXPORTACIÓN A EXCEL 👇 ---
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const params: any = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (ordering) params.ordering = ordering;
      if (currentBranch) params.branch_id = currentBranch.id;

      const response = await api.get("/inventory/products/export_excel/", {
        params,
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Catalogo_${currentBranch ? currentBranch.name : "Global"}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error("Error al exportar a Excel:", error);
      alert("Hubo un error al descargar el reporte de Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  // --- LÓGICA DE ELIMINACIÓN ---
  const handleDelete = async (id: number, name: string) => {
    if (
      !window.confirm(
        `¿Estás seguro de inhabilitar globalmente el producto "${name}"?`,
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

  // --- LÓGICA DE HABILITACIÓN POR SEDE ---
  const handleToggleBranchStatus = async (product: any) => {
    if (!currentBranch) return alert("Selecciona una sede primero.");

    setActionLoading(product.id);
    try {
      if (!product.stock?.is_enabled) {
        await api.post("/inventory/stocks/", {
          branch: currentBranch.id,
          product: product.id,
          quantity: 0,
          average_cost: 0,
          is_active: true,
        });
      } else {
        await api.patch(`/inventory/stocks/${product.stock.stock_id}/`, {
          is_active: false,
        });
      }
      await loadProducts();
    } catch (error) {
      console.error(error);
      alert("Error al cambiar el estado del producto en la sede.");
    } finally {
      setActionLoading(null);
    }
  };

  // --- LÓGICA DE CAMBIO DE PRECIO POR SEDE ---
  const handleSavePrice = async (product: any) => {
    if (!currentBranch || !product.stock?.stock_id) return;

    setActionLoading(product.id);
    try {
      const parsedPrice = parseFloat(tempPrice);
      await api.patch(`/inventory/stocks/${product.stock.stock_id}/`, {
        selling_price:
          isNaN(parsedPrice) || parsedPrice <= 0 ? null : parsedPrice,
      });
      setEditingPriceId(null);
      await loadProducts();
    } catch (error) {
      console.error(error);
      alert("Error al actualizar el precio.");
    } finally {
      setActionLoading(null);
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
      case "INTERMEDIATE":
        return (
          <span className="bg-cyan-50 text-cyan-600 border border-cyan-200 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
            <Link size={12} /> Subreceta
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
            {currentBranch
              ? `Configurando el menú y precios para la sede: ${currentBranch.name}`
              : `Gestión global de items, insumos y recetas (${totalCount} registros)`}
          </p>
        </div>

        {/* 👇 BOTONES DE ACCIÓN 👇 */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-700 transition shadow-sm font-medium w-full md:w-auto disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
            {isExporting ? "Generando..." : "Exportar Excel"}
          </button>

          <button
            onClick={() => navigate("/inventory/new")}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition shadow-sm font-medium w-full md:w-auto"
          >
            <Plus size={18} /> Nuevo Producto
          </button>
        </div>
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
                <th
                  className="p-4 cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("sku")}
                >
                  SKU / Código {getSortIcon("sku")}
                </th>
                <th
                  className="p-4 cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("name")}
                >
                  Producto {getSortIcon("name")}
                </th>
                <th className="p-4">Tipo</th>

                {currentBranch ? (
                  <>
                    <th className="p-4 text-center">Estado en Sede</th>
                    <th className="p-4 text-right">Precio de Venta (S/)</th>
                  </>
                ) : (
                  <th
                    className="p-4 text-right cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort("price")}
                  >
                    Precio Base {getSortIcon("price")}
                  </th>
                )}

                <th className="p-4 text-center">Acciones Globales</th>
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
                products.map((p) => {
                  const isEnabledInBranch = p.stock?.is_enabled;
                  const branchPrice = p.stock?.selling_price;
                  const finalPrice = branchPrice || p.price;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 group transition"
                    >
                      <td className="p-4 font-mono text-slate-500 font-medium">
                        {p.sku || "-"}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-sm">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                          {p.category_name || "Sin Categoría"} | {p.uom_display}
                        </div>
                      </td>
                      <td className="p-4">
                        {renderProductTypeBadge(p.product_type, p.type_display)}
                      </td>

                      {currentBranch ? (
                        <>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleToggleBranchStatus(p)}
                              disabled={actionLoading === p.id}
                              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs mx-auto transition-colors ${
                                isEnabledInBranch
                                  ? "bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200 border border-slate-200"
                              }`}
                            >
                              {actionLoading === p.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : isEnabledInBranch ? (
                                <ToggleRight size={16} />
                              ) : (
                                <ToggleLeft size={16} />
                              )}
                              {isEnabledInBranch ? "Habilitado" : "Oculto"}
                            </button>
                          </td>

                          <td className="p-4 text-right">
                            {!isEnabledInBranch ? (
                              <span className="text-slate-300 italic text-xs">
                                Inactivo
                              </span>
                            ) : editingPriceId === p.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-20 px-2 py-1 border border-slate-300 rounded outline-none focus:border-blue-500 text-right"
                                  value={tempPrice}
                                  onChange={(e) => setTempPrice(e.target.value)}
                                  placeholder="Base"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSavePrice(p)}
                                  disabled={actionLoading === p.id}
                                  className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"
                                >
                                  {actionLoading === p.id ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    "OK"
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div
                                className="flex items-center justify-end gap-2 group/price cursor-pointer"
                                onClick={() => {
                                  setEditingPriceId(p.id);
                                  setTempPrice(
                                    branchPrice ? String(branchPrice) : "",
                                  );
                                }}
                              >
                                <div className="flex flex-col items-end">
                                  <span
                                    className={`font-bold text-sm ${
                                      branchPrice
                                        ? "text-blue-600"
                                        : "text-slate-700"
                                    }`}
                                  >
                                    S/ {parseFloat(finalPrice).toFixed(2)}
                                  </span>
                                  {branchPrice && (
                                    <span className="text-[9px] text-blue-500 uppercase tracking-widest font-bold">
                                      Precio Sede
                                    </span>
                                  )}
                                </div>
                                <Edit
                                  size={12}
                                  className="text-slate-300 opacity-0 group-hover/price:opacity-100 group-hover/price:text-blue-500"
                                />
                              </div>
                            )}
                          </td>
                        </>
                      ) : (
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
                      )}

                      <td className="p-4 flex justify-center gap-1.5">
                        <button
                          onClick={() => navigate(`/inventory/edit/${p.id}`)}
                          className="bg-blue-50 text-blue-600 p-1.5 rounded-full hover:bg-blue-100 transition-colors"
                          title="Editar Producto Global"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                          title="Inhabilitar Globalmente"
                        >
                          <Trash2 size={16} />
                        </button>
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
    </div>
  );
};

export default Products;
