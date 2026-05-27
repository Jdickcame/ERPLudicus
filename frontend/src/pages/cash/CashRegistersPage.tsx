import {
  CheckCircle2,
  Edit,
  Loader2,
  Monitor,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

// --- INTERFACES ---
interface Category {
  id: number;
  name: string;
}

interface CashRegister {
  id: number;
  name: string;
  boleta_series: string;
  factura_series: string;
  is_active: boolean;
  allowed_categories: number[];
  branch: number;
}

const CashRegistersPage = () => {
  const { currentBranch } = useBranch();
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados del Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<CashRegister>>({
    name: "",
    boleta_series: "B001",
    factura_series: "F001",
    is_active: true,
    allowed_categories: [],
  });

  // --- CARGA DE DATOS ---
  useEffect(() => {
    if (!currentBranch) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [regRes, catRes] = await Promise.all([
          // 👇 AQUÍ ESTÁ EL CAMBIO: &all_status=true 👇
          api.get(
            `/cash/registers/?branch_id=${currentBranch.id}&all_status=true`,
          ),
          api.get(`/inventory/categories/`),
        ]);

        setRegisters(regRes.data.results || regRes.data);
        setCategories(catRes.data.results || catRes.data);
      } catch (error) {
        toast.error("Error al cargar la información del servidor.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [currentBranch]);

  // --- FUNCIONES DEL FORMULARIO ---
  const handleOpenModal = (register?: CashRegister) => {
    if (register) {
      setFormData(register);
    } else {
      setFormData({
        name: "",
        boleta_series: "B001",
        factura_series: "F001",
        is_active: true,
        allowed_categories: [],
        branch: currentBranch?.id,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData({});
  };

  const toggleCategory = (categoryId: number) => {
    setFormData((prev) => {
      const current = prev.allowed_categories || [];
      if (current.includes(categoryId)) {
        return {
          ...prev,
          allowed_categories: current.filter((id) => id !== categoryId),
        };
      } else {
        return { ...prev, allowed_categories: [...current, categoryId] };
      }
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.boleta_series || !formData.factura_series) {
      return toast.error("El nombre y las series son obligatorios.");
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        branch: currentBranch?.id,
      };

      if (formData.id) {
        await api.put(
          `/cash/registers/${formData.id}/?all_status=true`,
          payload,
        );
        toast.success("Caja actualizada con éxito.");
      } else {
        await api.post(`/cash/registers/`, payload);
        toast.success("Caja creada con éxito.");
      }

      // Recargar lista
      // 👇 AQUÍ TAMBIÉN ESTÁ EL CAMBIO: &all_status=true 👇
      const regRes = await api.get(
        `/cash/registers/?branch_id=${currentBranch?.id}&all_status=true`,
      );
      setRegisters(regRes.data.results || regRes.data);
      handleCloseModal();
    } catch (error: any) {
      const errMsg =
        error.response?.data?.error || "Error al guardar los datos.";
      toast.error(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la caja "${name}"?`)) return;

    try {
      await api.delete(`/cash/registers/${id}/?all_status=true`);
      toast.success("Caja eliminada correctamente.");
      setRegisters(registers.filter((r) => r.id !== id));
    } catch (error: any) {
      toast.error(
        error.response?.data?.error ||
          "No se puede eliminar esta caja porque tiene historial.",
      );
    }
  };

  if (!currentBranch) {
    return (
      <div className="p-10 flex flex-col items-center justify-center text-slate-400 h-[60vh]">
        <Monitor size={48} className="mb-4 opacity-20" />
        <h2 className="text-xl font-bold">Selecciona una sede</h2>
        <p className="text-sm">
          Debes elegir una sede en el menú superior para configurar sus cajas.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Monitor size={24} />
            </div>
            Gestión de Cajas
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Configura los puntos de venta autorizados para{" "}
            <strong>{currentBranch.name}</strong>.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 text-sm"
        >
          <Plus size={18} /> Crear Caja
        </button>
      </div>

      {/* TABLA DE CAJAS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 uppercase text-[10px] font-black tracking-wider">
              <tr>
                <th className="p-4">Caja</th>
                <th className="p-4">Series (Bol/Fac)</th>
                <th className="p-4">Permisos de Venta</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2
                        className="animate-spin text-blue-500"
                        size={24}
                      />
                      Cargando terminales...
                    </div>
                  </td>
                </tr>
              ) : registers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <Monitor size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="text-base font-bold text-slate-500">
                      No hay cajas configuradas
                    </p>
                    <p className="text-xs mt-1">
                      Crea la primera caja para empezar a operar en esta sede.
                    </p>
                  </td>
                </tr>
              ) : (
                registers.map((reg) => (
                  <tr
                    key={reg.id}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    <td className="p-4">
                      <div className="font-bold text-slate-800 text-base">
                        {reg.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        ID: {reg.id}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold border border-slate-200 text-xs">
                          {reg.boleta_series}
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold border border-slate-200 text-xs">
                          {reg.factura_series}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      {reg.allowed_categories?.length === 0 ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                          <CheckCircle2 size={12} /> Catálogo Completo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                          {reg.allowed_categories.length} Categorías Autorizadas
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase border ${
                          reg.is_active
                            ? "bg-green-50 text-green-600 border-green-200"
                            : "bg-slate-50 text-slate-500 border-slate-200"
                        }`}
                      >
                        {reg.is_active ? "Operativa" : "Desactivada"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenModal(reg)}
                          className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 rounded-lg transition-colors"
                          title="Editar Caja"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(reg.id, reg.name)}
                          className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 rounded-lg transition-colors"
                          title="Eliminar Caja"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Cabecera del Modal */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-800">
                  {formData.id
                    ? "Editar Configuración"
                    : "Nueva Caja Registradora"}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Establece los datos y restricciones para el punto de venta.
                </p>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Cuerpo del Formulario */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
              <form
                id="register-form"
                onSubmit={handleSave}
                className="space-y-6"
              >
                {/* Datos Básicos */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    1. Identificación
                  </h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nombre Comercial <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Ej. Caja Principal, Boletería 1, Cafetería..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all text-sm font-bold text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Serie para Boletas{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        value={formData.boleta_series || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            boleta_series: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="B001"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all text-sm font-mono font-bold text-slate-800 uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Serie para Facturas{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        value={formData.factura_series || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            factura_series: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="F001"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all text-sm font-mono font-bold text-slate-800 uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Filtro de Categorías */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">
                        2. Catálogo Autorizado
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Selecciona qué categorías aparecen en esta terminal.
                      </p>
                    </div>
                    {/* Botón rápido para limpiar */}
                    {(formData.allowed_categories?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, allowed_categories: [] })
                        }
                        className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider"
                      >
                        Limpiar Todo (Vender Todo)
                      </button>
                    )}
                  </div>

                  {(formData.allowed_categories?.length ?? 0) === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center mb-4">
                      <p className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={16} /> Ninguna categoría
                        seleccionada. La caja mostrará TODO el catálogo.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center mb-4">
                      <p className="text-xs font-bold text-blue-700 flex items-center justify-center gap-1.5">
                        <Monitor size={16} /> Mostrando solo{" "}
                        {formData.allowed_categories?.length} categoría(s).
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {categories.map((cat) => {
                      const isChecked = (
                        formData.allowed_categories || []
                      ).includes(cat.id);
                      return (
                        <div
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all active:scale-95 select-none ${
                            isChecked
                              ? "border-blue-500 bg-blue-50/50"
                              : "border-slate-100 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                              isChecked
                                ? "bg-blue-600 border-blue-600"
                                : "bg-white border-slate-300"
                            }`}
                          >
                            {isChecked && (
                              <CheckCircle2 size={14} className="text-white" />
                            )}
                          </div>
                          <span
                            className={`text-xs font-bold ${
                              isChecked ? "text-blue-900" : "text-slate-600"
                            }`}
                          >
                            {cat.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Estado */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                      formData.is_active ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        is_active: !formData.is_active,
                      })
                    }
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.is_active ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Terminal Activa
                    </p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Permite que los cajeros abran turno en esta máquina.
                    </p>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer / Acciones */}
            <div className="p-6 border-t border-slate-100 bg-white shrink-0 flex gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
              >
                Descartar
              </button>
              <button
                form="register-form"
                type="submit"
                disabled={isSaving}
                className="flex-1 py-3.5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 text-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <Save size={18} /> Guardar Configuración
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashRegistersPage;
