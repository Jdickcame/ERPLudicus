import {
  ArrowDownCircle,
  CheckCircle2,
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

interface TreasuryPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: number | null;
  supplierName: string;
  onSuccess: () => void;
}

const TreasuryPaymentModal = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  onSuccess,
}: TreasuryPaymentModalProps) => {
  const [activeTab, setActiveTab] = useState<"PAY_INVOICES" | "ADVANCE">(
    "PAY_INVOICES",
  );

  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Estado del Proveedor
  const [supplierBalance, setSupplierBalance] = useState(0);
  const [useBalance, setUseBalance] = useState(true);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [methodOptions, setMethodOptions] = useState<PaymentMethodOption[]>([]);

  // Formularios
  const [payForm, setPayForm] = useState({
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "TRANSFER",
    transaction_number: "",
    observation: "",
  });

  const [advanceForm, setAdvanceForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "TRANSFER",
    transaction_number: "",
    observation: "Adelanto / Saldo a Favor",
  });

  // Cargar datos al abrir
  useEffect(() => {
    if (isOpen && supplierId) {
      const loadData = async () => {
        setLoading(true);
        try {
          const [invRes, supplierRes, choiceRes] = await Promise.all([
            api.get(`/purchases/suppliers/${supplierId}/pending_invoices/`),
            api.get(`/purchases/suppliers/${supplierId}/`),
            api.get("/treasury/operations/choices/"),
          ]);

          setInvoices(invRes.data);
          setMethodOptions(choiceRes.data.payment_methods || []);

          // Lógica de Saldo a Favor (Negativo = A favor)
          const totalAllPending = invRes.data.reduce(
            (sum: number, inv: any) => sum + parseFloat(inv.total_net_pay),
            0,
          );
          const rawBal = parseFloat(supplierRes.data.balance || "0");
          const favorBalance = Math.max(0, totalAllPending - rawBal);

          setSupplierBalance(favorBalance);
          setUseBalance(favorBalance > 0);
          setSelectedIds([]);
        } catch (error) {
          console.error("Error cargando datos de tesorería", error);
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

  // --- MATEMÁTICA DE LIQUIDACIÓN ---
  const totalInvoices = invoices
    .filter((inv) => selectedIds.includes(inv.id))
    .reduce((sum, inv) => sum + parseFloat(inv.total_net_pay), 0);

  const balanceToUse =
    useBalance && supplierBalance > 0
      ? Math.min(supplierBalance, totalInvoices)
      : 0;
  const netToPay = Math.max(0, totalInvoices - balanceToUse);

  // --- ACCIONES ---
  const handlePayInvoices = async () => {
    if (selectedIds.length === 0)
      return alert("Selecciona al menos una factura para pagar.");
    if (
      netToPay > 0 &&
      !payForm.transaction_number &&
      payForm.payment_method !== "CASH"
    ) {
      return alert("Ingresa el N° de Operación para la transferencia.");
    }

    setProcessing(true);
    try {
      const finalObservation =
        balanceToUse > 0
          ? `Cruce con Saldo a Favor (S/ ${balanceToUse.toFixed(2)}) y Transferencia (S/ ${netToPay.toFixed(2)}). ${payForm.observation}`
          : payForm.observation;

      await api.post("/treasury/operations/pay_invoices/", {
        purchase_ids: selectedIds,
        amount_paid: netToPay,
        payment_date: payForm.payment_date,
        payment_method: netToPay === 0 ? "BALANCE" : payForm.payment_method,
        transaction_number:
          netToPay === 0 ? "CRUCE-SALDO" : payForm.transaction_number,
        observation: finalObservation,
      });

      alert("¡Facturas liquidadas con éxito! 💸");
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al procesar el pago.");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddAdvance = async () => {
    if (!advanceForm.amount || parseFloat(advanceForm.amount) <= 0)
      return alert("Ingresa un monto válido.");
    if (
      !advanceForm.transaction_number &&
      advanceForm.payment_method !== "CASH"
    )
      return alert("Ingresa el N° de Operación.");

    setProcessing(true);
    try {
      await api.post("/treasury/operations/add_advance/", {
        supplier_id: supplierId,
        ...advanceForm,
      });

      alert("¡Adelanto registrado con éxito! Saldo a favor actualizado. 📈");
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al registrar el adelanto.");
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* HEADER & TABS */}
        <div className="bg-slate-800 text-white pt-6 px-6 pb-0">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black tracking-tight">
                Centro de Pagos
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Proveedor:{" "}
                <span className="font-bold text-white">{supplierName}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-700/50 p-2 rounded-full transition"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex gap-6 border-b border-slate-700">
            <button
              onClick={() => setActiveTab("PAY_INVOICES")}
              className={`pb-3 text-sm font-bold tracking-wide uppercase transition-colors border-b-2 ${activeTab === "PAY_INVOICES" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-300"}`}
            >
              Liquidar Facturas
            </button>
            <button
              onClick={() => setActiveTab("ADVANCE")}
              className={`pb-3 text-sm font-bold tracking-wide uppercase transition-colors border-b-2 ${activeTab === "ADVANCE" ? "border-green-500 text-green-400" : "border-transparent text-slate-400 hover:text-slate-300"}`}
            >
              Registrar Adelanto
            </button>
          </div>
        </div>

        {/* BODY TAB 1: LIQUIDAR FACTURAS */}
        {activeTab === "PAY_INVOICES" && (
          <div className="flex-1 overflow-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-50">
            {/* COLUMNA IZQUIERDA: FACTURAS */}
            <div className="lg:col-span-2 flex flex-col">
              <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                <FileText size={18} className="text-blue-500" /> Facturas
                Pendientes
              </h3>

              {loading ? (
                <div className="flex-1 flex justify-center items-center py-20 bg-white rounded-xl border border-slate-200">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center py-20 bg-white rounded-xl border border-slate-200 border-dashed">
                  <CheckCircle2 size={48} className="text-green-400 mb-3" />
                  <p className="text-slate-500 font-medium">
                    No hay deudas pendientes con este proveedor.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-1">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 shadow-sm">
                        <tr>
                          <th className="p-3 text-center w-12">
                            <input
                              type="checkbox"
                              onChange={(e) =>
                                setSelectedIds(
                                  e.target.checked
                                    ? invoices.map((i) => i.id)
                                    : [],
                                )
                              }
                              checked={
                                selectedIds.length === invoices.length &&
                                invoices.length > 0
                              }
                              className="rounded text-blue-600 w-4 h-4 cursor-pointer"
                            />
                          </th>
                          <th className="p-3">Documento</th>
                          <th className="p-3 text-center">Fecha Emisión</th>
                          <th className="p-3 text-right">Deuda</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoices.map((inv) => (
                          <tr
                            key={inv.id}
                            className={`hover:bg-blue-50/50 cursor-pointer transition ${selectedIds.includes(inv.id) ? "bg-blue-50" : ""}`}
                            onClick={() => toggleSelect(inv.id)}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(inv.id)}
                                readOnly
                                className="rounded text-blue-600 w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-slate-700">
                                {inv.document_type}
                              </div>
                              <div className="text-xs text-slate-400">
                                {inv.series}-{inv.number}
                              </div>
                            </td>
                            <td className="p-3 text-center text-slate-500 font-medium">
                              {inv.issue_date}
                            </td>
                            <td className="p-3 text-right font-black text-red-600">
                              S/ {parseFloat(inv.total_net_pay).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA: CAJA Y RESUMEN */}
            <div className="flex flex-col gap-4">
              {/* SALDO A FAVOR */}
              {supplierBalance > 0 && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-1 text-green-800 font-bold text-sm">
                    <Wallet size={16} /> Saldo a Favor Disponible
                  </div>
                  <div className="text-3xl font-black text-green-700 mb-3 tracking-tight">
                    S/ {supplierBalance.toFixed(2)}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-green-800 cursor-pointer select-none bg-white/50 p-2 rounded-lg border border-green-200/50">
                    <input
                      type="checkbox"
                      checked={useBalance}
                      onChange={(e) => setUseBalance(e.target.checked)}
                      className="rounded text-green-600 focus:ring-green-500 w-4 h-4"
                    />
                    <span className="font-bold">
                      Usar a favor para liquidar
                    </span>
                  </label>
                </div>
              )}

              {/* FORMULARIO DE PAGO */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 flex-1 shadow-sm">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <CreditCard size={18} className="text-slate-400" /> Resumen de
                  Liquidación
                </h3>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-sm mb-4">
                  <div className="flex justify-between text-slate-500 font-medium">
                    <span>Facturas Seleccionadas:</span>
                    <span>S/ {totalInvoices.toFixed(2)}</span>
                  </div>
                  {useBalance && supplierBalance > 0 && (
                    <div className="flex justify-between text-green-600 font-bold">
                      <span>(-) Saldo a descontar:</span>
                      <span>- S/ {balanceToUse.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-slate-800 text-xl border-t border-slate-200 pt-3 mt-3">
                    <span>A Transferir:</span>
                    <span className="text-blue-600">
                      S/ {netToPay.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {netToPay > 0 && (
                    <>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Fecha de Pago
                        </label>
                        <input
                          type="date"
                          className="w-full border p-2.5 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-100"
                          value={payForm.payment_date}
                          onChange={(e) =>
                            setPayForm({
                              ...payForm,
                              payment_date: e.target.value,
                            })
                          }
                        />
                      </div>

                      {/* 👇 GRILLA CONDICIONAL: Si es Efectivo, el Método ocupa todo el ancho */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div
                          className={
                            payForm.payment_method === "CASH"
                              ? "md:col-span-2"
                              : ""
                          }
                        >
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Método
                          </label>
                          <select
                            className="w-full border p-2.5 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            value={payForm.payment_method}
                            onChange={(e) =>
                              setPayForm({
                                ...payForm,
                                payment_method: e.target.value,
                                // Limpiamos el N° Operación si selecciona Efectivo
                                transaction_number:
                                  e.target.value === "CASH"
                                    ? ""
                                    : payForm.transaction_number,
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

                        {/* 👇 ANIMACIÓN: Solo mostramos N° Operación si NO es Efectivo */}
                        {payForm.payment_method !== "CASH" && (
                          <div className="animate-in fade-in slide-in-from-right-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              N° Operación
                            </label>
                            <input
                              type="text"
                              className="w-full border p-2.5 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-100"
                              placeholder="Ej: 123456"
                              value={payForm.transaction_number}
                              onChange={(e) =>
                                setPayForm({
                                  ...payForm,
                                  transaction_number: e.target.value,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mt-2 block">
                      Observaciones (Opcional)
                    </label>
                    <textarea
                      className="w-full border p-2.5 rounded-lg bg-white text-sm h-16 resize-none outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="Ej. Pago correspondiente a quincena..."
                      value={payForm.observation}
                      onChange={(e) =>
                        setPayForm({ ...payForm, observation: e.target.value })
                      }
                    />
                  </div>

                  <button
                    onClick={handlePayInvoices}
                    disabled={processing || selectedIds.length === 0}
                    className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2 uppercase tracking-wide transition-all active:scale-95"
                  >
                    {processing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <DollarSign size={20} />
                    )}
                    {processing
                      ? "Procesando..."
                      : netToPay === 0
                        ? "Cruzar Deuda"
                        : "Procesar Pago"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BODY TAB 2: REGISTRAR ADELANTO */}
        {activeTab === "ADVANCE" && (
          <div className="flex-1 p-8 bg-slate-50 flex justify-center items-start">
            <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="text-center mb-6">
                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ArrowDownCircle size={32} className="text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  Registrar Depósito / Adelanto
                </h3>
                <p className="text-sm text-slate-500">
                  Este dinero se guardará como Saldo a Favor para cruzarlo con
                  futuras facturas.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                    Monto Depositado
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-slate-400 font-bold text-lg">
                      S/
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border-2 border-slate-200 p-3 pl-10 rounded-xl text-lg font-black text-slate-800 outline-none focus:border-green-400 focus:ring-4 focus:ring-green-100 transition-all"
                      placeholder="0.00"
                      value={advanceForm.amount}
                      onChange={(e) =>
                        setAdvanceForm({
                          ...advanceForm,
                          amount: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                      Fecha
                    </label>
                    <input
                      type="date"
                      className="w-full border p-3 rounded-xl text-sm outline-none focus:border-green-400"
                      value={advanceForm.payment_date}
                      onChange={(e) =>
                        setAdvanceForm({
                          ...advanceForm,
                          payment_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                      Método
                    </label>
                    <select
                      className="w-full border p-3 rounded-xl text-sm outline-none focus:border-green-400"
                      value={advanceForm.payment_method}
                      onChange={(e) =>
                        setAdvanceForm({
                          ...advanceForm,
                          payment_method: e.target.value,
                          transaction_number:
                            e.target.value === "CASH"
                              ? ""
                              : advanceForm.transaction_number,
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
                </div>

                {/* 👇 Ocultamos N° Operación en Adelantos si es Efectivo */}
                {advanceForm.payment_method !== "CASH" && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                      N° Operación
                    </label>
                    <input
                      type="text"
                      className="w-full border p-3 rounded-xl text-sm outline-none focus:border-green-400"
                      placeholder="Ej. 123456789"
                      value={advanceForm.transaction_number}
                      onChange={(e) =>
                        setAdvanceForm({
                          ...advanceForm,
                          transaction_number: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                    Motivo / Descripción
                  </label>
                  <input
                    type="text"
                    className="w-full border p-3 rounded-xl text-sm outline-none focus:border-green-400"
                    value={advanceForm.observation}
                    onChange={(e) =>
                      setAdvanceForm({
                        ...advanceForm,
                        observation: e.target.value,
                      })
                    }
                  />
                </div>

                <button
                  onClick={handleAddAdvance}
                  disabled={processing}
                  className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-xl shadow-lg shadow-green-200 disabled:opacity-50 flex justify-center items-center gap-2 uppercase tracking-wide transition-all active:scale-95"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Wallet size={20} />
                  )}
                  Guardar Saldo a Favor
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TreasuryPaymentModal;
