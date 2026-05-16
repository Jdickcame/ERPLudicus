import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Edit,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

// Hook simple para "Debounce" (espera a que el usuario deje de escribir para buscar)
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const Suppliers = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  // --- ESTADOS DE DATOS ---
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // --- ESTADOS DE FILTROS Y ORDENAMIENTO ---
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [ordering, setOrdering] = useState("-id");

  // Estados Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Estado Formulario Proveedor
  const [formData, setFormData] = useState({
    id: null,
    name: "",
    tax_id: "",
    email: "",
    phone: "",
    address: "",
  });

  // Estados Modal Saldo
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [transactionNumber, setTransactionNumber] = useState("");

  // --- FUNCIÓN DE CARGA DINÁMICA ---
  const loadSuppliers = useCallback(async () => {
    // Si no hay branch, no cargamos nada para evitar errores
    // (A menos que los proveedores sean globales, en cuyo caso quita esto)
    if (!currentBranch) return;

    setLoading(true);

    try {
      const params: any = {
        // branch_id: currentBranch.id, // OJO: Si los proveedores son globales para toda la empresa, puedes quitar esto.
        page: page,
        page_size: pageSize, // Enviamos el límite
        ordering: ordering,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch; // Esto activa el filters.SearchFilter de Django
      }

      const response = await api.get("/purchases/suppliers/", { params });

      // Verificamos si Django devolvió un objeto paginado (con results) o la lista plana
      if (response.data && response.data.results) {
        setSuppliers(response.data.results);
        setTotalCount(response.data.count);
      } else {
        // Si Django devuelve la lista plana ignorando la paginación, la forzamos visualmente aquí
        const allData = Array.isArray(response.data) ? response.data : [];
        setTotalCount(allData.length);

        // Paginación manual en el frontend
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        setSuppliers(allData.slice(startIndex, endIndex));
      }
    } catch (error) {
      console.error("Error cargando proveedores:", error);
    } finally {
      setLoading(false);
    }
  }, [currentBranch, page, debouncedSearch, ordering]);

  // Ejecutar carga principal
  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // Resetear página a 1 si el usuario busca algo nuevo
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, currentBranch]);

  // --- MANEJADORES DE ORDENAMIENTO ---
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

  // --- LÓGICA ABM ---
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
      alert("No se puede eliminar (tiene historial)");
    }
  };

  // --- LÓGICA SALDOS ---
  const openBalanceModal = (supplier: any) => {
    setSelectedSupplier(supplier);
    setBalanceAmount("");
    setTransactionNumber("");
    setIsBalanceModalOpen(true);
  };

  const handleAddBalance = async () => {
    if (!balanceAmount || !transactionNumber)
      return alert("Debes ingresar monto y N° de operación");
    if (!currentBranch) return;

    try {
      await api.post(
        `/purchases/suppliers/${selectedSupplier.id}/add_balance/`,
        {
          amount: balanceAmount,
          transaction_number: transactionNumber,
          branch_id: currentBranch.id,
        },
      );
      alert("Saldo actualizado correctamente");
      setIsBalanceModalOpen(false);
      loadSuppliers();
    } catch (error) {
      console.error(error);
      alert("Error al actualizar saldo");
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6 animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">Proveedores</h1>
            <BranchSelector />
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de contactos y saldos ({totalCount} registros)
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 transition shadow-sm font-medium"
        >
          <Plus size={18} /> Nuevo Proveedor
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 relative">
        <Search className="absolute left-6 top-6 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre o RUC..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto mb-4">
        {loading ? (
          <div className="py-20 flex justify-center items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" /> Cargando datos...
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 uppercase text-[10px] tracking-wider text-slate-600 font-bold border-b select-none">
              <tr>
                <th
                  className="p-4 cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center">
                    Razón Social {getSortIcon("name")}
                  </div>
                </th>
                <th
                  className="p-4 cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("tax_id")}
                >
                  <div className="flex items-center">
                    RUC / ID {getSortIcon("tax_id")}
                  </div>
                </th>
                <th className="p-4">Contacto</th>
                <th
                  className="p-4 text-right cursor-pointer hover:bg-slate-100"
                  onClick={() => handleSort("balance")}
                >
                  <div className="flex justify-end items-center">
                    Saldo Actual {getSortIcon("balance")}
                  </div>
                </th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {suppliers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-10 text-slate-400 text-sm"
                  >
                    No se encontraron proveedores.
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => {
                  const balance = parseFloat(s.balance || "0");
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50 group transition"
                    >
                      <td className="p-4 font-medium text-slate-800">
                        {s.name}
                      </td>
                      <td className="p-4 text-slate-600 font-mono">
                        {s.tax_id}
                      </td>
                      <td className="p-4 text-slate-500">
                        <div className="font-medium text-slate-700">
                          {s.phone || "-"}
                        </div>
                        <div className="text-[11px]">{s.email}</div>
                      </td>
                      <td className="p-4 text-right">
                        {balance > 0 ? (
                          <span
                            className="text-red-700 font-bold bg-red-50 border border-red-200 px-2.5 py-1 rounded-md text-[11px]"
                            title="Deuda por pagar"
                          >
                            S/ {balance.toFixed(2)}
                          </span>
                        ) : balance < 0 ? (
                          <span
                            className="text-green-700 font-bold bg-green-50 border border-green-200 px-2.5 py-1 rounded-md text-[11px]"
                            title="Saldo a tu favor"
                          >
                            + S/ {Math.abs(balance).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium bg-slate-50 px-2.5 py-1 rounded-md text-[11px]">
                            S/ 0.00
                          </span>
                        )}
                      </td>
                      <td className="p-4 flex justify-center gap-1.5">
                        <button
                          onClick={() =>
                            navigate(`/purchases/suppliers/${s.id}/statement`)
                          }
                          className="bg-slate-100 text-slate-600 p-1.5 rounded-full hover:bg-slate-200 transition-colors"
                          title="Ver Estado de Cuenta"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          onClick={() => openBalanceModal(s)}
                          className="bg-green-50 text-green-600 p-1.5 rounded-full hover:bg-green-100 transition-colors"
                          title="Cargar Saldo"
                        >
                          <Wallet size={16} />
                        </button>
                        <button
                          onClick={() => openModal(s)}
                          className="bg-blue-50 text-blue-600 p-1.5 rounded-full hover:bg-blue-100 transition-colors"
                          title="Editar Proveedor"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                          title="Eliminar Proveedor"
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

      {/* PAGINACIÓN */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="text-sm text-slate-500">
          Página <b>{page}</b> de <b>{totalPages || 1}</b>
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

      {/* MODAL PROVEEDOR */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">
                {isEditing ? "Editar" : "Nuevo"} Proveedor
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="hover:bg-slate-100 p-1 rounded-full transition"
              >
                <X size={24} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                  Razón Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                  RUC / DNI <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                  value={formData.tax_id}
                  onChange={(e) =>
                    setFormData({ ...formData, tax_id: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                  Dirección
                </label>
                <textarea
                  className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 h-24 resize-none"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                ></textarea>
              </div>
              <button
                onClick={handleSaveSupplier}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 gap-2 flex justify-center items-center shadow-md transition-colors mt-2"
              >
                <Save size={18} /> Guardar Proveedor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SALDO */}
      {isBalanceModalOpen && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-96">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-green-700">
                  <Wallet /> Cargar Saldo a Favor
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {selectedSupplier.name}
                </p>
              </div>
              <button
                onClick={() => setIsBalanceModalOpen(false)}
                className="hover:bg-slate-100 p-1 rounded-full transition"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase mb-1 text-slate-500 block">
                  Monto a Cargar (S/)
                </label>
                <input
                  type="number"
                  className="w-full border-2 border-green-500 p-3 rounded-xl text-2xl font-bold text-center text-green-700 outline-none focus:ring-4 focus:ring-green-100"
                  placeholder="0.00"
                  autoFocus
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase mb-1 text-slate-500 block">
                  N° Operación / Referencia
                </label>
                <input
                  type="text"
                  className="w-full border p-3 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                  placeholder="Ej: OP-123456"
                  value={transactionNumber}
                  onChange={(e) => setTransactionNumber(e.target.value)}
                />
              </div>

              <button
                onClick={handleAddBalance}
                className="w-full bg-green-600 text-white p-3.5 rounded-xl hover:bg-green-700 font-bold shadow-md transition-colors flex justify-center mt-2"
              >
                CONFIRMAR CARGA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
