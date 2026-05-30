import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ClipboardList,
  Download,
  Eye,
  Loader2,
  Plus,
  Save,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

interface InventoryDetail {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  product_uom: string;
  initial_stock: string;
  total_inputs: string;
  total_outputs: string;
  system_stock: string;
  unit_cost: string;
  physical_stock: string;
  difference: string;
  action_taken: "PENDING" | "ADJUST" | "IGNORE";
  action_notes: string;
}

interface InventoryDoc {
  id: number;
  reference: string;
  branch_name: string;
  start_date: string | null;
  end_date: string | null;
  status: "DRAFT" | "CLOSED";
  status_display: string;
  created_by_name: string;
  created_at: string;
  closed_at: string;
  notes: string;
  details: InventoryDetail[];
}

const PhysicalInventory = () => {
  const { currentBranch } = useBranch();
  const [view, setView] = useState<"LIST" | "DETAIL">("LIST");

  const [inventories, setInventories] = useState<InventoryDoc[]>([]);
  const [currentDoc, setCurrentDoc] = useState<InventoryDoc | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // --- ESTADOS DEL MODAL DE NUEVA AUDITORÍA ---
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // --- 1. CARGAR HISTORIAL ---
  const fetchInventories = async () => {
    if (!currentBranch) return;
    setLoading(true);
    try {
      const res = await api.get(
        `/inventory/physical-inventory/?branch_id=${currentBranch.id}`,
      );
      setInventories(res.data.results || res.data);
    } catch (error) {
      console.error("Error cargando inventarios", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === "LIST") {
      fetchInventories();
    }
  }, [currentBranch, view]);

  // --- 2. CREAR NUEVO CONTEO (CON MÁQUINA DEL TIEMPO) ---
  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch) return alert("Selecciona una sede primero.");
    if (!startDate || !endDate)
      return alert("Por favor selecciona las fechas del periodo a evaluar.");
    if (new Date(startDate) > new Date(endDate))
      return alert("La fecha de inicio no puede ser mayor a la final.");

    setLoading(true);
    try {
      const res = await api.post("/inventory/physical-inventory/", {
        branch: currentBranch.id,
        start_date: startDate,
        end_date: endDate,
        notes: `Auditoría del ${startDate} al ${endDate}`,
      });
      setIsNewModalOpen(false);
      setStartDate("");
      setEndDate("");
      loadDocument(res.data.id);
    } catch (error) {
      console.error(error);
      alert("Error al generar el formato de auditoría.");
    } finally {
      setLoading(false);
    }
  };

  // --- 3. CARGAR UN DOCUMENTO ESPECÍFICO ---
  const loadDocument = async (id: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/inventory/physical-inventory/${id}/`);
      setCurrentDoc(res.data);
      setView("DETAIL");
    } catch (error) {
      console.error(error);
      alert("Error al cargar el documento.");
    } finally {
      setLoading(false);
    }
  };

  // --- 4. LÓGICA DEL "EXCEL EN VIVO" ---
  const handleDetailChange = (
    detailId: number,
    field: keyof InventoryDetail,
    value: string,
  ) => {
    if (!currentDoc) return;

    const newDetails = currentDoc.details.map((item) => {
      if (item.id === detailId) {
        const updatedItem = { ...item, [field]: value };

        // Si cambiaron el stock físico, recalculamos la diferencia en vivo
        if (field === "physical_stock") {
          const sys = parseFloat(updatedItem.system_stock || "0");
          const phys = parseFloat(value || "0");
          updatedItem.difference = (phys - sys).toFixed(4);

          // Auto-asignar acción por defecto
          if (phys - sys !== 0 && updatedItem.action_taken === "PENDING") {
            updatedItem.action_taken = "ADJUST";
          } else if (phys - sys === 0) {
            updatedItem.action_taken = "PENDING";
          }
        }
        return updatedItem;
      }
      return item;
    });

    setCurrentDoc({ ...currentDoc, details: newDetails });
  };

  // --- 5. GUARDAR Y CERRAR ---
  const handleSaveDraft = async () => {
    if (!currentDoc) return;
    setSaving(true);
    try {
      await api.post(
        `/inventory/physical-inventory/${currentDoc.id}/save_draft/`,
        {
          details: currentDoc.details,
        },
      );
      alert("Borrador guardado. Puedes continuar luego.");
    } catch (error) {
      console.error(error);
      alert("Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseAudit = async () => {
    if (!currentDoc) return;

    // Validar que no haya pendientes si hay diferencias
    const hasPending = currentDoc.details.some(
      (d) => parseFloat(d.difference) !== 0 && d.action_taken === "PENDING",
    );
    if (hasPending) {
      return alert(
        "Aún tienes diferencias en estado 'Pendiente'. Decide si Ajustar o Ignorar antes de cerrar.",
      );
    }

    if (
      !confirm(
        "⚠️ ADVERTENCIA: Esta acción es irreversible. Se aplicarán los ajustes seleccionados al Kardex y se bloqueará el documento. ¿Continuar?",
      )
    )
      return;

    setSaving(true);
    try {
      await api.post(
        `/inventory/physical-inventory/${currentDoc.id}/close_inventory/`,
        {
          details: currentDoc.details,
        },
      );
      alert("✅ Inventario cerrado y auditado con éxito.");
      loadDocument(currentDoc.id); // Recargamos para que se ponga en solo lectura
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.error || "Error al cerrar la auditoría.");
    } finally {
      setSaving(false);
    }
  };

  // --- 6. EXPORTAR A EXCEL (.XLSX REAL) ---
  const exportToExcel = () => {
    if (!currentDoc) return;

    // 1. Mapear los datos exactamente como queremos que se vean en las columnas
    const excelData = currentDoc.details.map((d) => {
      const moneyDiff = parseFloat(d.difference) * parseFloat(d.unit_cost);
      return {
        SKU: d.product_sku,
        Producto: d.product_name,
        UOM: d.product_uom,
        "Stock Inicial": parseFloat(d.initial_stock),
        "Entradas (+)": parseFloat(d.total_inputs),
        "Salidas (-)": parseFloat(d.total_outputs),
        "Stock Sistema": parseFloat(d.system_stock),
        "Costo Unit (S/)": parseFloat(d.unit_cost),
        "Conteo Físico": parseFloat(d.physical_stock),
        "Dif. Cantidad": parseFloat(d.difference),
        "Valor Dif. (S/)": parseFloat(moneyDiff.toFixed(2)),
        Decisión:
          d.action_taken === "ADJUST"
            ? "Asumido (Ajuste Kardex)"
            : d.action_taken === "IGNORE"
              ? "Ignorado (Reposición)"
              : "OK",
      };
    });

    // 2. Crear la hoja de cálculo a partir de nuestro JSON
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 3. Ajustar el ancho de las columnas para que se vea bonito al abrirlo
    const columnWidths = [
      { wch: 15 }, // SKU
      { wch: 40 }, // Producto (Más ancho)
      { wch: 8 }, // UOM
      { wch: 12 }, // Inicial
      { wch: 12 }, // Entradas
      { wch: 12 }, // Salidas
      { wch: 15 }, // Sistema
      { wch: 15 }, // Costo
      { wch: 15 }, // Fisico
      { wch: 12 }, // Dif. Cantidad
      { wch: 15 }, // Valor Dif.
      { wch: 25 }, // Decision
    ];
    worksheet["!cols"] = columnWidths;

    // 4. Crear el "Libro" de Excel y agregarle nuestra hoja
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoría");

    // 5. Descargar el archivo nativo .xlsx
    XLSX.writeFile(workbook, `Auditoria_${currentDoc.reference}.xlsx`);
  };

  // --- VISTA 1: LISTA HISTÓRICA ---
  if (view === "LIST") {
    return (
      <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500 relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="text-blue-600" /> Auditorías Físicas
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Historial de conteos y cuadres de almacén
            </p>
          </div>
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <BranchSelector />
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition shadow-sm"
            >
              <Plus size={18} /> Nueva Auditoría
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4 whitespace-nowrap">Referencia</th>
                <th className="p-4 whitespace-nowrap">Periodo Evaluado</th>
                <th className="p-4 whitespace-nowrap">Auditor</th>
                <th className="p-4 text-center whitespace-nowrap">Estado</th>
                <th className="p-4 text-center whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto" />
                  </td>
                </tr>
              ) : inventories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No hay auditorías registradas en esta sede.
                  </td>
                </tr>
              ) : (
                inventories.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => loadDocument(inv.id)}
                  >
                    <td className="p-4 font-bold text-blue-600">
                      {inv.reference}
                    </td>
                    <td className="p-4 text-slate-600">
                      {inv.start_date && inv.end_date ? (
                        `${inv.start_date} al ${inv.end_date}`
                      ) : (
                        <span className="italic text-slate-400">
                          Auditoría Simple
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600">
                      {inv.created_by_name}
                    </td>
                    <td className="p-4 text-center">
                      {inv.status === "CLOSED" ? (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center justify-center gap-1 w-fit mx-auto">
                          <CheckCircle size={12} /> {inv.status_display}
                        </span>
                      ) : (
                        <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center justify-center gap-1 w-fit mx-auto">
                          <AlertTriangle size={12} /> {inv.status_display}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button className="text-slate-400 hover:text-blue-600 transition p-1 rounded-full hover:bg-blue-50">
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MODAL NUEVA AUDITORÍA */}
        {isNewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
              <div className="flex justify-between items-center p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="text-blue-600" /> Periodo de Auditoría
                </h2>
                <button
                  onClick={() => setIsNewModalOpen(false)}
                  className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-full transition"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateNew} className="p-6 space-y-5">
                <p className="text-sm text-slate-500">
                  Selecciona el rango de fechas que deseas evaluar. El sistema
                  calculará el stock inicial y los movimientos del Kardex en
                  este periodo.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                      Fecha Inicio
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                      Fecha Fin
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      "Generar Formato de Conteo"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- VISTA 2: EL EXCEL DE CONTEO ---
  const isReadOnly = currentDoc?.status === "CLOSED";
  const filteredDetails =
    currentDoc?.details.filter(
      (d) =>
        d.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.product_sku.toLowerCase().includes(searchTerm.toLowerCase()),
    ) || [];

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-in slide-in-from-right-4 duration-300 relative">
      {/* CABECERA EXCEL */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView("LIST")}
            className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-200 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {currentDoc?.reference}
              {isReadOnly && (
                <span className="bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded uppercase tracking-widest">
                  Solo Lectura
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Sede: {currentDoc?.branch_name} | Periodo:{" "}
              {currentDoc?.start_date} al {currentDoc?.end_date}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto mt-4 md:mt-0">
          <button
            onClick={exportToExcel}
            className="flex-1 md:flex-none justify-center bg-green-50 text-green-700 border border-green-200 px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-green-100 transition text-sm"
          >
            <Download size={16} /> Exportar Excel
          </button>
          {!isReadOnly && (
            <>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex-1 md:flex-none justify-center bg-slate-100 text-slate-700 border border-slate-300 px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-200 transition text-sm"
              >
                <Save size={16} /> {saving ? "Guardando..." : "Guardar Avance"}
              </button>
              <button
                onClick={handleCloseAudit}
                disabled={saving}
                className="w-full md:w-auto justify-center bg-blue-600 text-white px-4 py-2.5 rounded-lg font-black flex items-center gap-2 hover:bg-blue-700 transition shadow-md text-sm"
              >
                <CheckCircle size={16} /> CERRAR Y AUDITAR
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Buscar producto en la lista..."
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500 shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* LA TABLA DE EXCEL (AHORA CON MÁQUINA DEL TIEMPO) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto pb-6">
        <table className="w-full min-w-[1200px] text-sm text-left">
          <thead className="bg-slate-800 text-white uppercase text-[10px] tracking-wider font-bold">
            <tr>
              <th className="p-3 whitespace-nowrap">Producto / SKU</th>
              <th className="p-3 text-center border-l border-slate-600 bg-slate-700/50 whitespace-nowrap">
                Inicial
              </th>
              <th className="p-3 text-center bg-slate-700/50 text-green-400 whitespace-nowrap">
                Ingresos (+)
              </th>
              <th className="p-3 text-center bg-slate-700/50 text-orange-400 whitespace-nowrap">
                Consumos (-)
              </th>
              <th className="p-3 text-center border-r border-slate-600 bg-slate-700 whitespace-nowrap">
                Final (Sist.)
              </th>
              <th className="p-3 text-right whitespace-nowrap">Costo S/</th>
              <th className="p-3 text-center bg-blue-600 whitespace-nowrap">
                Conteo Físico
              </th>
              <th className="p-3 text-center border-l border-slate-600 whitespace-nowrap">
                Dif. Cant.
              </th>
              <th className="p-3 text-right whitespace-nowrap">
                Valor Dif. (S/)
              </th>
              <th className="p-3 border-l border-slate-600 min-w-[150px] whitespace-nowrap">
                Decisión
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredDetails.map((item) => {
              const diff = parseFloat(item.difference);
              const isDiff = diff !== 0;
              const moneyDiff = diff * parseFloat(item.unit_cost || "0");

              return (
                <tr key={item.id} className="hover:bg-blue-50/30 transition">
                  <td className="p-2">
                    <div className="font-bold text-slate-700 text-xs">
                      {item.product_name}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {item.product_sku} | {item.product_uom}
                    </div>
                  </td>

                  {/* LA MÁQUINA DEL TIEMPO */}
                  <td className="p-2 text-center text-xs font-medium text-slate-500 bg-slate-50 border-l border-slate-100">
                    {parseFloat(item.initial_stock)}
                  </td>
                  <td className="p-2 text-center text-xs font-bold text-green-600 bg-green-50/20">
                    +{parseFloat(item.total_inputs)}
                  </td>
                  <td className="p-2 text-center text-xs font-bold text-orange-600 bg-orange-50/20">
                    -{parseFloat(item.total_outputs)}
                  </td>
                  <td className="p-2 text-center font-black text-slate-800 bg-slate-100 border-r border-slate-200">
                    {parseFloat(item.system_stock)}
                  </td>

                  {/* COSTO UNITARIO */}
                  <td className="p-2 text-right text-xs font-medium text-slate-500">
                    {parseFloat(item.unit_cost).toFixed(2)}
                  </td>

                  {/* CONTEO FÍSICO */}
                  <td className="p-1 border-x-2 border-blue-100 bg-blue-50/10">
                    <input
                      type="number"
                      disabled={isReadOnly}
                      className={`w-full text-center font-black py-1.5 px-1 border rounded outline-none transition-colors ${
                        isReadOnly
                          ? "bg-transparent border-transparent"
                          : "bg-white border-blue-300 focus:ring-2 focus:ring-blue-500 shadow-inner"
                      }`}
                      value={item.physical_stock}
                      onChange={(e) =>
                        handleDetailChange(
                          item.id,
                          "physical_stock",
                          e.target.value,
                        )
                      }
                    />
                  </td>

                  {/* DIFERENCIA CANTIDAD */}
                  <td className="p-2 text-center font-black">
                    {isDiff ? (
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${diff > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      >
                        {diff > 0 ? "+" : ""}
                        {diff}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-medium text-xs">
                        OK
                      </span>
                    )}
                  </td>

                  {/* VALOR DE LA DIFERENCIA (S/) */}
                  <td className="p-2 text-right font-black">
                    {isDiff ? (
                      <span
                        className={
                          moneyDiff > 0 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {moneyDiff > 0 ? "+" : "-"}S/{" "}
                        {Math.abs(moneyDiff).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>

                  {/* DECISIÓN GERENCIAL */}
                  <td className="p-2 border-l border-slate-100">
                    {isDiff ? (
                      <select
                        disabled={isReadOnly}
                        className={`w-full text-xs font-bold p-1.5 border rounded outline-none ${
                          item.action_taken === "PENDING"
                            ? "bg-yellow-50 border-yellow-300 text-yellow-700"
                            : item.action_taken === "ADJUST"
                              ? "bg-blue-50 border-blue-300 text-blue-700"
                              : "bg-slate-50 border-slate-300 text-slate-600"
                        } ${isReadOnly ? "appearance-none bg-transparent border-transparent" : ""}`}
                        value={item.action_taken}
                        onChange={(e) =>
                          handleDetailChange(
                            item.id,
                            "action_taken",
                            e.target.value,
                          )
                        }
                      >
                        <option value="PENDING">⏳ PENDIENTE</option>
                        <option value="ADJUST">✅ AJUSTAR</option>
                        <option value="IGNORE">🚫 IGNORAR</option>
                      </select>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic px-2">
                        No requiere acción
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PhysicalInventory;
