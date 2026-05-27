import {
  ArrowDownToLine,
  ArrowRightLeft,
  CheckCircle,
  Clock,
  Package,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

// --- INTERFACES ---
interface TransferDetail {
  id?: number;
  product: number;
  product_name: string;
  product_sku: string;
  quantity: string | number;
}

interface Transfer {
  id: number;
  origin_branch: number;
  origin_branch_name: string;
  destination_branch: number;
  destination_branch_name: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  status_display: string;
  observation: string;
  created_by_name: string;
  created_at: string;
  details: TransferDetail[];
}

interface StockItem {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  product_uom: string;
  quantity: number;
}

const TransfersPage = () => {
  const { currentBranch, branches } = useBranch();

  // Estados de la lista
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"OUT" | "IN">("OUT"); // OUT = Enviados, IN = Recibidos

  // Estados del Formulario (Nuevo Traslado)
  const [showNewForm, setShowNewForm] = useState(false);
  const [localStock, setLocalStock] = useState<StockItem[]>([]);

  const [destBranch, setDestBranch] = useState("");
  const [observation, setObservation] = useState("");
  const [cart, setCart] = useState<TransferDetail[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);

  // --- CARGA INICIAL DE DATOS ---
  const loadData = async () => {
    if (!currentBranch) return;
    setLoading(true);
    try {
      // 1. Cargamos todos los traslados
      const resTransfers = await api.get(`/inventory/transfers/`);
      setTransfers(resTransfers.data.results || resTransfers.data);

      // 3. Cargamos el stock de la sede actual (para saber qué podemos enviar)
      const resStock = await api.get(
        `/inventory/stocks/?branch_id=${currentBranch.id}`,
      );
      // Filtramos solo los que tienen stock > 0
      const availableStock = (resStock.data.results || resStock.data).filter(
        (s: StockItem) => s.quantity > 0,
      );
      setLocalStock(availableStock);
    } catch (error) {
      console.error("Error cargando datos de traslados", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setShowNewForm(false);
    setCart([]);
  }, [currentBranch]);

  // --- FILTROS DE PESTAÑAS ---
  const filteredTransfers = transfers.filter((t) => {
    if (activeTab === "OUT") return t.origin_branch === currentBranch?.id;
    if (activeTab === "IN") return t.destination_branch === currentBranch?.id;
    return true;
  });

  // --- LÓGICA DEL CARRITO DE ENVÍO ---
  const handleAddLine = () => {
    if (!selectedProductId || !qtyInput || parseFloat(qtyInput) <= 0) return;

    const stockItem = localStock.find(
      (s) => s.product === parseInt(selectedProductId),
    );
    if (!stockItem) return;

    if (parseFloat(qtyInput) > stockItem.quantity) {
      return alert(
        `No puedes enviar más de lo que tienes. Stock actual: ${stockItem.quantity}`,
      );
    }

    if (cart.some((item) => item.product === stockItem.product)) {
      return alert("El producto ya está en la lista de envío.");
    }

    setCart([
      ...cart,
      {
        product: stockItem.product,
        product_name: stockItem.product_name,
        product_sku: stockItem.product_sku,
        quantity: parseFloat(qtyInput),
      },
    ]);
    setSelectedProductId("");
    setQtyInput("");
  };

  const removeLine = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  // --- ENVIAR NUEVO TRASLADO ---
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch || !destBranch)
      return alert("Selecciona la sede destino.");
    if (cart.length === 0) return alert("Agrega productos al traslado.");

    setSubmitLoading(true);
    try {
      const payload = {
        origin_branch: currentBranch.id,
        destination_branch: parseInt(destBranch),
        observation: observation || "Traslado interno",
        details: cart.map((item) => ({
          product: item.product,
          quantity: item.quantity,
        })),
      };

      await api.post("/inventory/transfers/", payload);
      alert("Traslado enviado correctamente. El stock ha sido reservado.");
      setShowNewForm(false);
      setCart([]);
      setObservation("");
      setDestBranch("");
      loadData();
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.error || "Error al registrar el traslado.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // --- RECIBIR TRASLADO (La magia de tu backend) ---
  const handleReceive = async (transferId: number) => {
    const confirmReceive = window.confirm(
      "¿Confirmas que la mercadería llegó completa y en buen estado a tu sede?",
    );
    if (!confirmReceive) return;

    try {
      await api.post(`/inventory/transfers/${transferId}/receive/`);
      alert("¡Mercadería recibida! Tu stock y Kardex han sido actualizados.");
      loadData();
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.error || "Error al recibir la mercadería.");
    }
  };

  // =========================================================================
  // VISTA 1: FORMULARIO DE NUEVO TRASLADO
  // =========================================================================
  if (showNewForm) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Send className="text-blue-600" /> Registrar Nuevo Envío
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Enviando desde <strong>{currentBranch?.name}</strong>
            </p>
          </div>
          <button
            onClick={() => setShowNewForm(false)}
            className="text-slate-500 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-full transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <form onSubmit={handleSubmitTransfer} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Sede Destino
                </label>
                <select
                  required
                  value={destBranch}
                  onChange={(e) => setDestBranch(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Selecciona destino --</option>
                  {branches
                    .filter((b) => b.id !== currentBranch?.id)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Observación (Opcional)
                </label>
                <input
                  type="text"
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Ej: Reposición urgente fin de semana..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Agregar Productos */}
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-col md:flex-row gap-4 items-end mt-6">
              <div className="flex-1">
                <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                  Producto a enviar
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full p-2.5 border rounded-lg outline-none"
                >
                  <option value="">-- Buscar en tu stock actual --</option>
                  {localStock.map((s) => (
                    <option key={s.product} value={s.product}>
                      {s.product_name} (Disp: {s.quantity} {s.product_uom})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
                  Cantidad
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  className="w-full p-2.5 border rounded-lg outline-none text-center font-bold"
                />
              </div>
              <button
                type="button"
                onClick={handleAddLine}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg transition h-[46px]"
              >
                Añadir
              </button>
            </div>

            {/* Tabla del Carrito */}
            <div className="border border-slate-200 rounded-lg overflow-hidden mt-4">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-center">Cantidad a Enviar</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cart.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="p-8 text-center text-slate-400"
                      >
                        No hay productos en la lista.
                      </td>
                    </tr>
                  ) : (
                    cart.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-800">
                          {item.product_name}{" "}
                          <span className="text-xs text-slate-400 font-mono ml-2">
                            [{item.product_sku}]
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-blue-600">
                          {item.quantity}{" "}
                          {/* Buscamos la unidad de medida en el stock local */}
                          <span className="text-xs text-slate-500 font-normal">
                            {localStock.find((s) => s.product === item.product)
                              ?.product_uom || "UND"}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t mt-6">
              <button
                type="submit"
                disabled={submitLoading || cart.length === 0}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 transition disabled:opacity-50"
              >
                <Send size={18} />{" "}
                {submitLoading ? "Procesando..." : "Confirmar Envío"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISTA 2: LISTADO DE TRASLADOS (BANDEJAS)
  // =========================================================================
  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="text-blue-600" /> Traslados de Mercadería
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestiona envíos y recepciones para{" "}
            <strong>{currentBranch?.name}</strong>
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm transition"
        >
          <Plus size={18} /> Nuevo Envío
        </button>
      </div>

      {/* PESTAÑAS */}
      <div className="flex gap-4 border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab("OUT")}
          className={`pb-3 px-2 font-bold text-sm transition-colors border-b-2 ${
            activeTab === "OUT"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Mis Envíos (Salidas)
        </button>
        <button
          onClick={() => setActiveTab("IN")}
          className={`pb-3 px-2 font-bold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "IN"
              ? "border-green-600 text-green-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Por Recibir (Entradas)
          {/* Globito de notificación si hay pendientes */}
          {transfers.filter(
            (t) =>
              t.destination_branch === currentBranch?.id &&
              t.status === "PENDING",
          ).length > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {
                transfers.filter(
                  (t) =>
                    t.destination_branch === currentBranch?.id &&
                    t.status === "PENDING",
                ).length
              }
            </span>
          )}
        </button>
      </div>

      {/* TABLA DE TRASLADOS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            Cargando traslados...
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Package size={48} className="mx-auto mb-3 opacity-30" />
            <p>No hay registros en esta bandeja.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-600 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-4">Fecha / Documento</th>
                <th className="p-4">
                  {activeTab === "OUT" ? "Sede Destino" : "Enviado Desde"}
                </th>
                <th className="p-4">Items</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-bold text-slate-800">
                      TR-{t.id.toString().padStart(6, "0")}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="p-4 font-bold text-slate-700">
                    {activeTab === "OUT"
                      ? t.destination_branch_name
                      : t.origin_branch_name}
                  </td>
                  <td className="p-4 text-slate-600">
                    <div className="text-xs font-medium bg-slate-100 px-2 py-1 rounded inline-block border">
                      {t.details.length} productos
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 w-max mx-auto ${
                        t.status === "PENDING"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {t.status === "PENDING" ? (
                        <Clock size={12} />
                      ) : (
                        <CheckCircle size={12} />
                      )}
                      {t.status_display}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    {/* Botón Mágico de Recepción */}
                    {activeTab === "IN" && t.status === "PENDING" ? (
                      <button
                        onClick={() => handleReceive(t.id)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-xs font-bold shadow-sm transition flex items-center gap-1 mx-auto"
                      >
                        <ArrowDownToLine size={14} /> Recibir
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">
                        Sin acciones
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TransfersPage;
