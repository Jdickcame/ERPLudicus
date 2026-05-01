import {
  CreditCard,
  DollarSign,
  FileText,
  Loader2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";

// Interfaces
interface PendingInvoice {
  id: number;
  issue_date: string;
  document_type: string;
  series: string;
  number: string;
  total_net_pay: string;
}

interface PaymentMethodOption {
  value: string;
  label: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: number | null;
  supplierName: string;
  onSuccess: () => void;
}

const PaymentModal = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  onSuccess,
}: PaymentModalProps) => {
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Nuevo Estado: Saldo del Proveedor
  const [supplierBalance, setSupplierBalance] = useState(0);
  const [useBalance, setUseBalance] = useState(true);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [methodOptions, setMethodOptions] = useState<PaymentMethodOption[]>([]);

  const [formData, setFormData] = useState({
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "TRANSFER",
    transaction_number: "",
    observation: "",
  });

  // 👇 FUNCIONES PARA RESTRINGIR FECHAS (AGREGAR ESTO)
  const getMinDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 3); // Resta 3 días
    return d.toISOString().split("T")[0];
  };

  const getMaxDate = () => {
    return new Date().toISOString().split("T")[0]; // Hoy
  };

  // Cargar datos
  useEffect(() => {
    if (isOpen && supplierId) {
      const loadData = async () => {
        setLoading(true);
        try {
          const [invRes, choiceRes, supplierRes] = await Promise.all([
            api.get(`/purchases/suppliers/${supplierId}/pending_invoices/`),
            api.get("/purchases/purchases/choices/"),
            api.get(`/purchases/suppliers/${supplierId}/`),
          ]);

          setInvoices(invRes.data);
          setMethodOptions(choiceRes.data.payment_methods || []);

          const bal = parseFloat(supplierRes.data.balance || "0");
          setSupplierBalance(bal);
          setUseBalance(bal > 0);

          setSelectedIds([]);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [isOpen, supplierId]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // --- CÁLCULOS MATEMÁTICOS ---
  const totalInvoices = invoices
    .filter((inv) => selectedIds.includes(inv.id))
    .reduce((sum, inv) => sum + parseFloat(inv.total_net_pay), 0);

  const balanceToUse =
    useBalance && supplierBalance > 0
      ? Math.min(supplierBalance, totalInvoices)
      : 0;

  const netToPay = Math.max(0, totalInvoices - balanceToUse);

  const handlePay = async () => {
    if (selectedIds.length === 0)
      return alert("Selecciona al menos un documento");

    if (netToPay > 0 && !formData.transaction_number) {
      return alert("Ingresa el N° de Operación para el monto a transferir");
    }

    setProcessing(true);
    try {
      const finalObservation =
        balanceToUse > 0
          ? `Pagado con Saldo a favor (S/ ${balanceToUse.toFixed(2)}) y Transferencia (S/ ${netToPay.toFixed(2)}). ${formData.observation}`
          : formData.observation;

      await api.post("/purchases/purchases/bulk_pay/", {
        purchase_ids: selectedIds,
        ...formData,
        transaction_number:
          netToPay === 0 ? "CRUCE-SALDO" : formData.transaction_number,
        observation: finalObservation,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al procesar el pago");
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* HEADER */}
        <div className="p-6 border-b flex justify-between items-center bg-slate-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Liquidar Deuda</h2>
            <p className="text-slate-500 text-sm">
              Proveedor:{" "}
              <span className="font-bold text-blue-600">{supplierName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* COLUMNA IZQUIERDA: FACTURAS */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <FileText size={18} /> Selecciona Documentos
            </h3>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-blue-500" />
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-slate-400 italic">
                No hay documentos pendientes.
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs sticky top-0">
                    <tr>
                      <th className="p-3 text-center w-10 bg-slate-100">
                        <input
                          type="checkbox"
                          onChange={(e) =>
                            setSelectedIds(
                              e.target.checked ? invoices.map((i) => i.id) : [],
                            )
                          }
                          checked={
                            selectedIds.length === invoices.length &&
                            invoices.length > 0
                          }
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="p-3 bg-slate-100">Documento</th>
                      <th className="p-3 bg-slate-100 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className={`hover:bg-blue-50 cursor-pointer transition ${selectedIds.includes(inv.id) ? "bg-blue-50" : ""}`}
                        onClick={() => toggleSelect(inv.id)}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(inv.id)}
                            readOnly
                            className="rounded text-blue-600"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-slate-700">
                            {inv.document_type}
                          </div>
                          <div className="text-xs text-slate-400">
                            {inv.series}-{inv.number} ({inv.issue_date})
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-800">
                          S/ {parseFloat(inv.total_net_pay).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA: PAGO */}
          <div className="flex flex-col gap-4">
            {/* TARJETA DE SALDO A FAVOR */}
            {supplierBalance > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 animate-in zoom-in">
                <div className="flex items-center gap-2 mb-2 text-green-800 font-bold text-sm">
                  <Wallet size={16} /> Saldo a Favor Disponible
                </div>
                <div className="text-2xl font-black text-green-700 mb-2">
                  S/ {supplierBalance.toFixed(2)}
                </div>
                <label className="flex items-center gap-2 text-sm text-green-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useBalance}
                    onChange={(e) => setUseBalance(e.target.checked)}
                    className="rounded text-green-600 focus:ring-green-500"
                  />
                  <span>Usar para descontar deuda</span>
                </label>
              </div>
            )}

            {/* FORMULARIO */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex-1">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <CreditCard size={18} /> Datos del Pago
              </h3>

              <div className="space-y-3">
                {/* RESUMEN MATEMÁTICO */}
                <div className="bg-white p-3 rounded border border-slate-200 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Total Facturas:</span>
                    <span>S/ {totalInvoices.toFixed(2)}</span>
                  </div>
                  {useBalance && supplierBalance > 0 && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>(-) Saldo a usar:</span>
                      <span>- S/ {balanceToUse.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-slate-800 text-lg border-t pt-2 mt-2">
                    <span>A Transferir:</span>
                    <span>S/ {netToPay.toFixed(2)}</span>
                  </div>
                </div>

                {netToPay > 0 && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">
                        Fecha
                      </label>
                      <input
                        type="date"
                        className="w-full border p-2 rounded bg-white text-sm outline-none focus:border-blue-500"
                        value={formData.payment_date}
                        // 👇 AQUI ESTAN LAS RESTRICCIONES
                        min={getMinDate()}
                        max={getMaxDate()}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            payment_date: e.target.value,
                          })
                        }
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Máx. 3 días atrás.
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">
                        Método
                      </label>
                      <select
                        className="w-full border p-2 rounded bg-white text-sm"
                        value={formData.payment_method}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            payment_method: e.target.value,
                          })
                        }
                      >
                        {methodOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">
                        N° Operación
                      </label>
                      <input
                        type="text"
                        className="w-full border p-2 rounded bg-white text-sm"
                        placeholder="Ej: 123456"
                        value={formData.transaction_number}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            transaction_number: e.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                )}

                <div>
                  <textarea
                    className="w-full border p-2 rounded bg-white text-sm h-16 resize-none"
                    placeholder="Observación..."
                    value={formData.observation}
                    onChange={(e) =>
                      setFormData({ ...formData, observation: e.target.value })
                    }
                  />
                </div>

                <button
                  onClick={handlePay}
                  disabled={processing || selectedIds.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-200 disabled:opacity-50 flex justify-center items-center gap-2 mt-2"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <DollarSign size={20} />
                  )}
                  {processing
                    ? "Procesando..."
                    : netToPay === 0
                      ? "Cruzar Saldo"
                      : "Pagar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
