import {
    AlertCircle,
    Box,
    CheckCircle,
    Download,
    FileText,
    PackageCheck,
    Plus,
    Search,
    X
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

const INVOICE_UNIT_OPTIONS = [
  { value: "NIU", label: "Unidad (NIU)" },
  { value: "CAJ", label: "Caja (CAJ)" },
  { value: "FARD", label: "Fardo (FARD)" },
  { value: "PAA", label: "Paquete (PAA)" },
  { value: "KGM", label: "Kilogramo (KGM)" },
  { value: "LTR", label: "Litro (LTR)" },
];

const PurchaseOrderList = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);

  // Filtros
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  // Tablas del modal
  const [receiveItems, setReceiveItems] = useState<any[]>([]);
  const [bonusItems, setBonusItems] = useState<any[]>([]);

  // Buscador de productos para bonos
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    loadOrders();
    api
      .get("/inventory/products/?for_purchase=true&page_size=1000")
      .then((res) => setProducts(res.data.results || res.data));
  }, [currentBranch, startDate, endDate]);

  const loadOrders = async () => {
    if (!currentBranch) return;
    try {
      let url = `/purchases/purchase-orders/?branch_id=${currentBranch.id}`;
      if (startDate) url += `&issue_date__gte=${startDate}`;
      if (endDate) url += `&issue_date__lte=${endDate}`;
      if (searchTerm) url += `&search=${searchTerm}`;

      const res = await api.get(url);
      setOrders(res.data.results || res.data);
    } catch (error) {
      toast.error("Error al cargar OCs");
    }
  };

  const handleDownloadPDF = async (id: number, code: string) => {
    try {
      const res = await api.get(
        `/purchases/purchase-orders/${id}/download_pdf/`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `OC_${code}.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (error) {
      toast.error("Error al generar PDF");
    }
  };

  const openReceiveModal = (order: any) => {
    setSelectedOrder(order);
    setReceiveItems(
      order.details
        .filter((d: any) => !d.is_bonus)
        .map((d: any) => ({
          detail_id: d.id,
          name: d.product_name,
          ordered: parseFloat(d.quantity_ordered),
          received: parseFloat(d.quantity_received),
          pending: parseFloat(d.quantity_pending),
          received_now: 0,
        })),
    );
    setBonusItems([]);
    setShowReceiveModal(true);
  };

  const submitReceive = async () => {
    try {
      const payload = {
        items: receiveItems.filter((i) => i.received_now > 0),
        bonus_items: bonusItems.filter((i) => i.product_id && i.quantity > 0),
      };

      if (payload.items.length === 0 && payload.bonus_items.length === 0)
        return toast.error("Ingresa al menos 1 cantidad a recibir");

      await api.post(
        `/purchases/purchase-orders/${selectedOrder.id}/receive_items/`,
        payload,
      );
      toast.success("Inventario y bonificaciones actualizados correctamente");
      setShowReceiveModal(false);
      loadOrders();
    } catch (error) {
      toast.error("Error al registrar recepción");
    }
  };

  const renderStatus = (status: string) => {
    const colors: Record<string, string> = {
      OPEN: "bg-blue-100 text-blue-700",
      PARTIAL: "bg-orange-100 text-orange-700",
      CLOSED: "bg-green-100 text-green-700",
      CANCELED: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = {
      OPEN: "ABIERTA",
      PARTIAL: "RECEP. PARCIAL",
      CLOSED: "CERRADA",
      CANCELED: "ANULADA",
    };
    return (
      <span
        className={`px-2 py-1 rounded-md text-[10px] font-black tracking-wider ${colors[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="text-blue-600" /> Órdenes de Compra
        </h1>
        <button
          onClick={() => navigate("/purchases/orders/new")}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-md flex items-center gap-2"
        >
          <Plus size={18} /> Nueva OC
        </button>
      </div>

      {/* FILTROS (Punto 1) */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">
            Desde
          </label>
          <input
            type="date"
            className="w-full border p-2 rounded-lg outline-none text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">
            Hasta
          </label>
          <input
            type="date"
            className="w-full border p-2 rounded-lg outline-none text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-bold text-slate-500 uppercase">
            Buscar (N° OC o Proveedor)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="w-full border p-2 rounded-lg outline-none text-sm focus:border-blue-400"
              placeholder="Ej: OC-001 o Nestlé..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadOrders()}
            />
            <button
              onClick={loadOrders}
              className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200"
            >
              <Search size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="p-4">N° Orden</th>
              <th className="p-4">Proveedor</th>
              <th className="p-4">Emisión</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Monto Estimado</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-700">{o.code}</td>
                <td className="p-4 font-medium text-slate-600">
                  {o.supplier_name}
                </td>
                <td className="p-4">
                  {new Date(o.issue_date).toLocaleDateString()}
                </td>
                <td className="p-4">{renderStatus(o.status)}</td>
                <td className="p-4 text-right font-black text-slate-700">
                  S/ {o.total}
                </td>
                <td className="p-4 flex gap-2 justify-center">
                  <button
                    onClick={() => handleDownloadPDF(o.id, o.code)}
                    title="Descargar PDF"
                    className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Download size={16} />
                  </button>
                  {o.status !== "CLOSED" && o.status !== "CANCELED" && (
                    <>
                      <button
                        onClick={() => openReceiveModal(o)}
                        title="Recibir Mercadería"
                        className="p-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors"
                      >
                        <PackageCheck size={16} />
                      </button>
                      {o.status === "PARTIAL" && (
                        <button
                          onClick={() =>
                            navigate(`/purchases/new?oc_id=${o.id}`)
                          }
                          title="Registrar Factura y Cerrar"
                          className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1 font-bold px-3 transition-colors"
                        >
                          <CheckCircle size={14} /> Facturar
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showReceiveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-xl font-black mb-6 flex items-center gap-2 text-slate-800 border-b pb-4">
              <PackageCheck className="text-orange-500" size={28} /> Recepción
              de Mercadería - {selectedOrder?.code}
            </h2>

            <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">
              1. Productos Solicitados
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-center">Pedido</th>
                    <th className="p-3 text-center">Ya Llegó</th>
                    <th className="p-3 text-center text-red-500">Pendiente</th>
                    <th className="p-3 bg-orange-50 text-orange-700 text-center">
                      Cant. Ingresa Hoy
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receiveItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-medium text-slate-700">
                        {item.name}
                      </td>
                      <td className="p-3 text-center bg-slate-50">
                        {item.ordered}
                      </td>
                      <td className="p-3 text-center text-green-600 font-bold bg-green-50/30">
                        {item.received}
                      </td>
                      <td className="p-3 text-center text-red-500 font-bold bg-red-50/30">
                        {item.pending}
                      </td>
                      <td className="p-3 bg-orange-50/30">
                        <input
                          type="number"
                          className="border border-orange-200 bg-white p-2 w-full text-center rounded-lg outline-none focus:ring-2 focus:ring-orange-300 font-bold text-orange-700"
                          value={item.received_now || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const newItems = [...receiveItems];
                            newItems[idx].received_now =
                              val > item.pending ? item.pending : val;
                            setReceiveItems(newItems);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* SECCIÓN BONIFICACIONES (Punto 5) */}
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-green-600 uppercase flex items-center gap-2">
                <Box size={16} /> 2. Productos Adicionales / Bonificaciones
                (Costo Cero)
              </h3>
              <button
                onClick={() =>
                  setBonusItems([
                    ...bonusItems,
                    {
                      product_id: "",
                      invoice_unit: "UNIDAD",
                      units_per_package: 1,
                      quantity: 1,
                    },
                  ])
                }
                className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold hover:bg-green-200"
              >
                + Agregar Regalo
              </button>
            </div>

            {bonusItems.length > 0 ? (
              <div className="border border-green-200 rounded-xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-green-50 text-green-700 text-[10px] uppercase font-bold tracking-wider">
                    <tr>
                      <th className="p-3">Producto Regalo</th>
                      <th className="p-3 text-center">Unidad</th>
                      <th className="p-3 text-center">x Empaque</th>
                      <th className="p-3 text-center">Cant. Recibida</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100">
                    {bonusItems.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-2">
                          <select
                            className="w-full border border-green-200 p-2 rounded-lg outline-none"
                            value={row.product_id}
                            onChange={(e) => {
                              const n = [...bonusItems];
                              n[idx].product_id = e.target.value;
                              setBonusItems(n);
                            }}
                          >
                            <option value="">Seleccionar...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <select
                            className="w-full border border-green-200 p-2 rounded-lg outline-none"
                            value={row.invoice_unit}
                            onChange={(e) => {
                              const n = [...bonusItems];
                              n[idx].invoice_unit = e.target.value;
                              setBonusItems(n);
                            }}
                          >
                            {INVOICE_UNIT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            className="w-16 border border-green-200 p-2 rounded-lg text-center mx-auto block"
                            value={row.units_per_package}
                            onChange={(e) => {
                              const n = [...bonusItems];
                              n[idx].units_per_package = e.target.value;
                              setBonusItems(n);
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            className="w-20 border border-green-300 bg-green-50 p-2 rounded-lg text-center mx-auto block font-bold text-green-700"
                            value={row.quantity}
                            onChange={(e) => {
                              const n = [...bonusItems];
                              n[idx].quantity = e.target.value;
                              setBonusItems(n);
                            }}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() =>
                              setBonusItems(
                                bonusItems.filter((_, i) => i !== idx),
                              )
                            }
                            className="text-red-400 hover:text-red-600"
                          >
                            <X size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mb-6">
                No se han registrado productos adicionales fuera de la orden.
              </p>
            )}

            <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-600 mb-6 flex items-start gap-3 border border-slate-200">
              <AlertCircle size={20} className="shrink-0 text-blue-500" />
              <p>
                Al confirmar, estas cantidades sumarán físicamente al almacén de
                Trujillo. Las bonificaciones ingresarán a Costo Cero para no
                afectar contablemente la factura futura.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowReceiveModal(false)}
                className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={submitReceive}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg transition-all flex items-center gap-2"
              >
                <CheckCircle size={18} /> Confirmar Ingreso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderList;
