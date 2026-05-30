import {
  ArrowDown,
  ArrowUp,
  Edit,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import Pagination from "../../components/common/Pagination";

// Hook simple para "Debounce"
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const Suppliers = () => {
  // --- ESTADOS DE DATOS ---
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // --- ESTADOS DE FILTROS Y ORDENAMIENTO ---
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ordering, setOrdering] = useState("-id");

  // Estados Modal Proveedor
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    name: "",
    tax_id: "",
    email: "",
    phone: "",
    address: "",
  });

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: page,
        page_size: pageSize,
        ordering: ordering,
      };

      if (debouncedSearch) params.search = debouncedSearch;

      const response = await api.get("/purchases/suppliers/", { params });

      if (response.data && response.data.results) {
        setSuppliers(response.data.results);
        setTotalCount(response.data.count);
      } else {
        const allData = Array.isArray(response.data) ? response.data : [];
        setTotalCount(allData.length);
        const startIndex = (page - 1) * pageSize;
        setSuppliers(allData.slice(startIndex, startIndex + pageSize));
      }
    } catch (error) {
      console.error("Error cargando proveedores:", error);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, ordering]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

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

  const openModal = (supplier: any = null) => {
    if (supplier) {
      setIsEditing(true);
      setFormData(supplier);
    } else {
      setIsEditing(false);
      setFormData({
        id: null,
        name: "",
        tax_id: "",
        email: "",
        phone: "",
        address: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (!formData.name || !formData.tax_id)
      return alert("Nombre y RUC obligatorios");
    try {
      if (isEditing && formData.id) {
        await api.put(`/purchases/suppliers/${formData.id}/`, formData);
      } else {
        await api.post("/purchases/suppliers/", formData);
      }
      setIsModalOpen(false);
      loadSuppliers();
    } catch (error) {
      console.error(error);
      alert("Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Eliminar proveedor?")) return;
    try {
      await api.delete(`/purchases/suppliers/${id}/`);
      loadSuppliers();
    } catch (error) {
      console.error(error);
      alert("No se puede eliminar (tiene historial de compras)");
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Directorio de Proveedores
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de contactos ({totalCount} registros)
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-blue-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition shadow-sm font-bold"
        >
          <Plus size={18} /> Nuevo Contacto
        </button>
      </div>

      {/* BÚSQUEDA */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 relative">
        <Search className="absolute left-6 top-6 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre o RUC..."
          className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLA PURA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        {loading ? (
          <div className="py-20 flex justify-center items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 uppercase text-[10px] tracking-wider text-slate-500 font-bold border-b">
              <tr>
                <th
                  className="p-4 cursor-pointer hover:bg-slate-100 transition"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center">
                    Razón Social {getSortIcon("name")}
                  </div>
                </th>
                <th
                  className="p-4 cursor-pointer hover:bg-slate-100 transition"
                  onClick={() => handleSort("tax_id")}
                >
                  <div className="flex items-center">
                    RUC / ID {getSortIcon("tax_id")}
                  </div>
                </th>
                <th className="p-4">Información de Contacto</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-slate-400">
                    No se encontraron contactos.
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 group transition">
                    <td className="p-4 font-bold text-slate-700">{s.name}</td>
                    <td className="p-4 text-slate-500 font-mono">{s.tax_id}</td>
                    <td className="p-4">
                      <div className="font-medium text-slate-700">
                        {s.phone || "-"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {s.email || "Sin email"}
                      </div>
                    </td>
                    <td className="p-4 flex justify-center gap-2">
                      <button
                        onClick={() => openModal(s)}
                        className="text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                        title="Editar Proveedor"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-slate-400 hover:text-red-600 bg-slate-100 hover:bg-red-50 p-2 rounded-lg transition-colors"
                        title="Eliminar Proveedor"
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

      {/* MODAL EDICIÓN PROVEEDOR */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">
                {isEditing ? "Editar Contacto" : "Nuevo Contacto"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="hover:bg-slate-100 p-2 rounded-full transition"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Razón Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border p-3 rounded-xl mt-1 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  RUC / DNI <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border p-3 rounded-xl mt-1 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  value={formData.tax_id}
                  onChange={(e) =>
                    setFormData({ ...formData, tax_id: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    className="w-full border p-3 rounded-xl mt-1 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full border p-3 rounded-xl mt-1 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Dirección
                </label>
                <textarea
                  className="w-full border p-3 rounded-xl mt-1 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 h-20 resize-none"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                ></textarea>
              </div>
              <button
                onClick={handleSaveSupplier}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 gap-2 flex justify-center items-center shadow-lg shadow-blue-200 transition-all mt-4"
              >
                <Save size={18} /> Guardar Registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
