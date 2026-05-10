import {
    ArrowRightLeft,
    Banknote,
    CheckCircle,
    CreditCard,
    Plus,
    Trash2,
    X,
} from "lucide-react";
import { useState } from "react";

interface Customer {
  id: number;
  name: string;
  tax_id: string;
  document_type: string;
}

interface PaymentModalProps {
  total: number;
  selectedCustomer?: Customer;
  onClose: () => void;
  onConfirm: (paymentData: any) => void;
}

interface PaymentLine {
  id: number;
  method: "CASH" | "CARD" | "TRANSFER";
  amount: number;
}

const PaymentModal = ({
  total,
  selectedCustomer,
  onClose,
  onConfirm,
}: PaymentModalProps) => {
  // Configuración Documento
  const [docType, setDocType] = useState<"BOLETA" | "FACTURA">(() => {
    return selectedCustomer?.document_type === "RUC" ? "FACTURA" : "BOLETA";
  });

  // Lista de Pagos Agregados
  const [payments, setPayments] = useState<PaymentLine[]>([]);

  // Inputs Temporales para agregar un pago
  const [currentMethod, setCurrentMethod] = useState<
    "CASH" | "CARD" | "TRANSFER"
  >("CASH");
  const [currentAmount, setCurrentAmount] = useState<string>("");

  // Cálculos
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = total - totalPaid;

  // Vuelto (Solo si hay efectivo y se pasa del total)
  // Nota: En pago mixto, el vuelto se calcula sobre el total pagado vs total venta
  const change = totalPaid > total ? totalPaid - total : 0;

  // ¿Está listo para cobrar? (Debe cubrir el total, permitimos sobrepago si es efectivo para vuelto)
  const isReady = totalPaid >= total;

  // --- MÉTODOS ---

  const handleAddPayment = () => {
    let amount = parseFloat(currentAmount);
    if (!amount || amount <= 0) return;

    // Si intenta agregar más de lo que falta y NO es efectivo, lo limitamos
    if (currentMethod !== "CASH" && amount > remaining && remaining > 0) {
      amount = remaining;
    }

    const newPayment: PaymentLine = {
      id: Date.now(),
      method: currentMethod,
      amount: amount,
    };

    setPayments([...payments, newPayment]);
    setCurrentAmount(""); // Limpiar input

    // Auto-seleccionar el siguiente método lógico o enfocar
    // Si ya cubrió todo, genial.
  };

  const removePayment = (id: number) => {
    setPayments(payments.filter((p) => p.id !== id));
  };

  const handleConfirm = () => {
    if (!isReady) return;

    // Validación de Factura
    if (docType === "FACTURA" && selectedCustomer?.document_type !== "RUC") {
      return alert("Error: Para Factura necesitas un RUC.");
    }

    // Preparamos la data para enviar
    // Si hay vuelto, ajustamos el pago en efectivo registrado para que cuadre contablemente
    // O registramos el pago total y el vuelto aparte.
    // Para simplificar, enviaremos los pagos tal cual, y el backend sabrá que hay un "Change".

    const payload = {
      invoice_type: docType,
      payments: payments.map((p) => ({
        payment_method: p.method,
        amount: p.amount, // Enviamos lo que el cliente entregó
      })),
      change: change,
    };

    onConfirm(payload);
  };

  // Botón "Todo" (Llena el monto restante)
  const setRemaining = () => {
    if (remaining > 0) setCurrentAmount(remaining.toFixed(2));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px]">
        {/* === IZQUIERDA: AGREGAR PAGOS === */}
        <div className="w-full md:w-1/2 bg-slate-50 p-6 flex flex-col border-r border-slate-200">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Plus size={20} className="text-blue-600" /> Agregar Pago
          </h3>

          {/* Selector de Método */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[
              {
                id: "CASH",
                label: "Efectivo",
                icon: Banknote,
                color: "text-green-600 bg-green-50 border-green-200",
              },
              {
                id: "CARD",
                label: "Visa/Yape",
                icon: CreditCard,
                color: "text-blue-600 bg-blue-50 border-blue-200",
              },
              {
                id: "TRANSFER",
                label: "Transf.",
                icon: ArrowRightLeft,
                color: "text-purple-600 bg-purple-50 border-purple-200",
              },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setCurrentMethod(m.id as any);
                  document.getElementById("amountInput")?.focus();
                }}
                className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${currentMethod === m.id ? `${m.color} ring-2 ring-offset-1` : "border-slate-200 text-slate-400 hover:bg-white"}`}
              >
                <m.icon size={24} />
                <span className="text-xs font-bold mt-1">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Input Monto */}
          <div className="mb-6">
            <label className="text-xs font-bold text-slate-400 uppercase">
              Monto a agregar
            </label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <span className="absolute left-3 top-3 text-slate-400 font-bold">
                  S/
                </span>
                <input
                  id="amountInput"
                  type="number"
                  className="w-full pl-8 p-3 text-xl font-bold border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none"
                  placeholder="0.00"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPayment()}
                  autoFocus
                />
              </div>
              <button
                onClick={setRemaining}
                className="bg-slate-200 px-3 rounded-xl font-bold text-slate-600 text-xs hover:bg-slate-300"
              >
                Restante
              </button>
            </div>
          </div>

          {/* Teclado Numérico Rápido (Opcional, pero útil) */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[10, 20, 50, 100].map((val) => (
              <button
                key={val}
                onClick={() => setCurrentAmount(val.toString())}
                className="py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 text-sm hover:bg-slate-100"
              >
                {val}
              </button>
            ))}
          </div>

          <button
            onClick={handleAddPayment}
            disabled={!currentAmount}
            className="mt-auto w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:bg-slate-300"
          >
            <Plus size={20} /> AGREGAR PAGO
          </button>
        </div>

        {/* === DERECHA: RESUMEN === */}
        <div className="w-full md:w-1/2 p-6 flex flex-col bg-white">
          {/* Header Resumen */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">
                Total Venta
              </p>
              <p className="text-3xl font-black text-slate-800">
                S/ {total.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">
                Faltante
              </p>
              <p
                className={`text-xl font-black ${remaining > 0 ? "text-red-500" : "text-green-500"}`}
              >
                S/ {remaining > 0 ? remaining.toFixed(2) : "0.00"}
              </p>
            </div>
          </div>

          {/* Selector Documento */}
          <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
            <button
              onClick={() => setDocType("BOLETA")}
              className={`flex-1 py-1 rounded font-bold text-xs ${docType === "BOLETA" ? "bg-white shadow text-blue-600" : "text-slate-400"}`}
            >
              BOLETA
            </button>
            <button
              onClick={() => {
                if (selectedCustomer?.document_type === "RUC")
                  setDocType("FACTURA");
                else alert("Necesitas RUC para Factura");
              }}
              className={`flex-1 py-1 rounded font-bold text-xs ${docType === "FACTURA" ? "bg-white shadow text-purple-600" : "text-slate-400"}`}
            >
              FACTURA
            </button>
          </div>

          {/* Lista de Pagos */}
          <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl mb-4 bg-slate-50/50 p-2 space-y-2">
            {payments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <Banknote size={40} className="mb-2 opacity-20" />
                <p className="text-xs">Agrega métodos de pago</p>
              </div>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex justify-between items-center animate-in slide-in-from-left-2"
                >
                  <div className="flex items-center gap-3">
                    {p.method === "CASH" && (
                      <Banknote size={18} className="text-green-500" />
                    )}
                    {p.method === "CARD" && (
                      <CreditCard size={18} className="text-blue-500" />
                    )}
                    {p.method === "TRANSFER" && (
                      <ArrowRightLeft size={18} className="text-purple-500" />
                    )}
                    <span className="font-bold text-sm text-slate-700">
                      {p.method === "CASH"
                        ? "Efectivo"
                        : p.method === "CARD"
                          ? "Visa/Yape"
                          : "Transf."}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">S/ {p.amount.toFixed(2)}</span>
                    <button
                      onClick={() => removePayment(p.id)}
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Vuelto */}
          {change > 0 && (
            <div className="bg-green-50 border border-green-200 p-3 rounded-xl mb-4 flex justify-between items-center">
              <span className="text-xs font-bold text-green-700 uppercase">
                Vuelto a entregar
              </span>
              <span className="text-2xl font-black text-green-600">
                S/ {change.toFixed(2)}
              </span>
            </div>
          )}

          {/* Botón Final */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 rounded-xl border border-slate-200 text-slate-500 font-bold hover:bg-slate-50"
            >
              <X size={24} />
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isReady}
              className={`flex-1 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 ${isReady ? "bg-slate-900 text-white hover:bg-black" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
            >
              <CheckCircle size={20} /> CONFIRMAR PAGO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
