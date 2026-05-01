import {
  Edit,
  FileText,
  Plus,
  Save,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

const Suppliers = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

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

  // 👇 NUEVOS ESTADOS PARA EL MODAL DE SALDO
  const [balanceAmount, setBalanceAmount] = useState("");
  const [transactionNumber, setTransactionNumber] = useState(""); // <--- NUEVO

  // --- CARGAR DATOS ---
  useEffect(() => {
    const loadSuppliers = async () => {
      if (!currentBranch) return;
      try {
        const res = await api.get(
          `/purchases/suppliers/?branch_id=${currentBranch.id}`,
        );
        setSuppliers(Array.isArray(res.data) ? res.data : res.data.results);
      } catch (error) {
        console.error("Error cargando proveedores", error);
      }
    };
    loadSuppliers();
  }, [currentBranch]);

  // Función auxiliar para recargar
  const reloadData = async () => {
    if (!currentBranch) return;
    try {
      const res = await api.get(
        `/purchases/suppliers/?branch_id=${currentBranch.id}`,
      );
      setSuppliers(Array.isArray(res.data) ? res.data : res.data.results);
    } catch (error) {
      console.error("Error recargando", error);
    }
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
      reloadData();
    } catch (error) {
      console.error(error);
      alert("Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Eliminar proveedor?")) return;
    try {
      await api.delete(`/purchases/suppliers/${id}/`);
      reloadData();
    } catch (error) {
      console.error(error);
      alert("No se puede eliminar (tiene historial)");
    }
  };

  // --- LÓGICA SALDOS ---
  const openBalanceModal = (supplier: any) => {
    setSelectedSupplier(supplier);
    setBalanceAmount("");
    setTransactionNumber(""); // <--- RESETEAR AL ABRIR
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
          transaction_number: transactionNumber, // <--- ENVIAMOS LO QUE ESCRIBISTE
          branch_id: currentBranch.id,
        },
      );
      alert("Saldo actualizado correctamente");
      setIsBalanceModalOpen(false);
      reloadData();
    } catch (error) {
      console.error(error);
      alert("Error al actualizar saldo");
    }
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.tax_id.includes(searchTerm),
  );

  return (
    <div className="p-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">Proveedores</h1>
            <BranchSelector />
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Gestión de contactos y saldos
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 transition"
        >
          <Plus size={20} /> Nuevo Proveedor
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border mb-4 relative">
        <Search className="absolute left-6 top-6 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar..."
          className="w-full pl-10 pr-4 py-2 border rounded outline-none focus:border-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 uppercase text-slate-600 font-bold">
            <tr>
              <th className="p-4">Razón Social</th>
              <th className="p-4">RUC / ID</th>
              <th className="p-4">Contacto</th>
              <th className="p-4 text-right">Saldo Actual</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSuppliers.map((s) => {
              const balance = parseFloat(s.balance || "0");
              return (
                <tr key={s.id} className="hover:bg-slate-50 group transition">
                  <td className="p-4 font-medium">{s.name}</td>
                  <td className="p-4 text-slate-500">{s.tax_id}</td>
                  <td className="p-4 text-slate-500">
                    <div className="text-xs">{s.phone}</div>
                    <div className="text-xs">{s.email}</div>
                  </td>
                  <td className="p-4 text-right">
                    {balance > 0 ? (
                      <span className="text-green-700 font-bold bg-green-100 px-2 py-1 rounded text-xs">
                        + S/ {balance.toFixed(2)}
                      </span>
                    ) : balance < 0 ? (
                      <span className="text-red-700 font-bold bg-red-100 px-2 py-1 rounded text-xs">
                        S/ {balance.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">
                        S/ 0.00
                      </span>
                    )}
                  </td>
                  <td className="p-4 flex justify-center gap-2">
                    <button
                      onClick={() =>
                        navigate(`/purchases/suppliers/${s.id}/statement`)
                      }
                      className="bg-slate-100 text-slate-600 p-2 rounded hover:bg-slate-200 border border-slate-200"
                      title="Ver Estado de Cuenta"
                    >
                      <FileText size={18} />
                    </button>
                    <button
                      onClick={() => openBalanceModal(s)}
                      className="bg-green-50 text-green-600 p-2 rounded hover:bg-green-100 border border-green-100"
                      title="Cargar Saldo"
                    >
                      <Wallet size={18} />
                    </button>
                    <button
                      onClick={() => openModal(s)}
                      className="bg-blue-50 text-blue-600 p-2 rounded hover:bg-blue-100 border border-blue-100"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="bg-red-50 text-red-600 p-2 rounded hover:bg-red-100 border border-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL PROVEEDOR */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {isEditing ? "Editar" : "Nuevo"} Proveedor
              </h2>
              <button onClick={() => setIsModalOpen(false)}>
                <X size={24} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nombre / Razón Social"
                className="w-full border p-2 rounded"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="RUC / DNI"
                className="w-full border p-2 rounded"
                value={formData.tax_id}
                onChange={(e) =>
                  setFormData({ ...formData, tax_id: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Teléfono"
                  className="w-full border p-2 rounded"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="w-full border p-2 rounded"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
              <textarea
                placeholder="Dirección"
                className="w-full border p-2 rounded h-20"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
              ></textarea>
              <button
                onClick={handleSaveSupplier}
                className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 gap-2 flex justify-center items-center"
              >
                <Save size={18} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SALDO (ACTUALIZADO CON N° OPERACIÓN) */}
      {isBalanceModalOpen && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-green-700">
                  <Wallet /> Cargar Saldo
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedSupplier.name}
                </p>
              </div>
              <button onClick={() => setIsBalanceModalOpen(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <label className="text-xs font-bold uppercase mb-1 text-slate-500 block">
              Monto a Cargar (S/)
            </label>
            <input
              type="number"
              className="w-full border-2 border-green-500 p-2 rounded mb-4 text-2xl font-bold text-center text-green-700 outline-none focus:ring-4 focus:ring-green-100"
              placeholder="0.00"
              autoFocus
              value={balanceAmount}
              onChange={(e) => setBalanceAmount(e.target.value)}
            />

            {/* 👇 NUEVO CAMPO DE N° OPERACIÓN 👇 */}
            <label className="text-xs font-bold uppercase mb-1 text-slate-500 block">
              N° Operación / Referencia
            </label>
            <input
              type="text"
              className="w-full border p-2 rounded mb-4 text-sm font-medium outline-none focus:border-blue-500"
              placeholder="Ej: OP-123456"
              value={transactionNumber}
              onChange={(e) => setTransactionNumber(e.target.value)}
            />

            <button
              onClick={handleAddBalance}
              className="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 font-bold mt-2"
            >
              CONFIRMAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
