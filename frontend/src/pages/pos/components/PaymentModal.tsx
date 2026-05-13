import {
  ArrowRightLeft,
  Banknote,
  CheckCircle,
  CreditCard,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
// 👇 Importa tu componente PinPad (ajusta la ruta según tu estructura)
import PinPad from "../../../components/common/PinPad";

interface Customer {
  id: number;
  name: string;
  tax_id: string;
  document_type: string;
}

interface PaymentModalProps {
  total: number;
  selectedCustomer?: Customer;
  isAdmin?: boolean;
  onClose: () => void;
  onConfirm: (paymentData: any) => void;
}

interface PaymentLine {
  id: number;
  method: "CASH" | "CARD" | "TRANSFER" | "COURTESY";
  amount: number;
}

const PaymentModal = ({
  total,
  selectedCustomer,
  isAdmin = false,
  onClose,
  onConfirm,
}: PaymentModalProps) => {
  // Configuración Documento
  const [docType, setDocType] = useState<"BOLETA" | "FACTURA" | "TICKET">(
    () => {
      return selectedCustomer?.document_type === "RUC" ? "FACTURA" : "BOLETA";
    },
  );

  // --- ESTADOS PARA CORTESÍA ---
  const [isCourtesy, setIsCourtesy] = useState(false);
  const [showPinPad, setShowPinPad] = useState(false);
  const [tempPin, setTempPin] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");

  // Lista de Pagos
  const [payments, setPayments] = useState<PaymentLine[]>([]);

  // Inputs Temporales
  const [currentMethod, setCurrentMethod] = useState<
    "CASH" | "CARD" | "TRANSFER"
  >("CASH");
  const [currentAmount, setCurrentAmount] = useState<string>("");

  // --- CÁLCULOS DINÁMICOS ---
  const effectiveTotal = isCourtesy ? 0 : total;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = isCourtesy ? 0 : effectiveTotal - totalPaid;
  const change =
    totalPaid > effectiveTotal && !isCourtesy ? totalPaid - effectiveTotal : 0;

  const isReady = isCourtesy ? true : totalPaid >= effectiveTotal;

  // --- MÉTODOS ---
  const handleAddPayment = () => {
    let amount = parseFloat(currentAmount);
    if (!amount || amount <= 0) return;

    if (currentMethod !== "CASH" && amount > remaining && remaining > 0) {
      amount = remaining;
    }

    const newPayment: PaymentLine = {
      id: Date.now(),
      method: currentMethod,
      amount: amount,
    };

    setPayments([...payments, newPayment]);
    setCurrentAmount("");
  };

  const removePayment = (id: number) => {
    setPayments(payments.filter((p) => p.id !== id));
  };

  const handleDocTypeChange = (type: "BOLETA" | "FACTURA" | "TICKET") => {
    if (type === "TICKET") {
      // 👇 NUEVO: Si es Admin, entra directo sin pedir PIN
      if (isAdmin) {
        setSupervisorPin("BYPASS"); // Un texto de relleno, el backend usará el token real
        setIsCourtesy(true);
        setDocType("TICKET");
        setPayments([]);
      } else {
        setShowPinPad(true); // Si es cajero, muestra el pad
      }
      return;
    }

    if (type === "FACTURA" && selectedCustomer?.document_type !== "RUC") {
      return alert("Error: Para Factura necesitas un RUC.");
    }

    setIsCourtesy(false);
    setSupervisorPin("");
    setPayments([]);
    setDocType(type);
  };

  // 👇 LÓGICA CONECTADA AL COMPONENTE PINPAD
  const handlePinSubmit = () => {
    if (tempPin.length < 4) return;

    setSupervisorPin(tempPin);
    setIsCourtesy(true);
    setDocType("TICKET");
    setPayments([]);
    setShowPinPad(false);
    setTempPin("");
  };

  const handleConfirm = () => {
    if (!isReady) return;

    const payload = {
      invoice_type: docType,
      payments: isCourtesy
        ? [{ payment_method: "COURTESY", amount: 0 }]
        : payments.map((p) => ({ payment_method: p.method, amount: p.amount })),
      change: isCourtesy ? 0 : change,
      is_courtesy: isCourtesy,
      supervisor_pin: supervisorPin,
    };

    onConfirm(payload);
  };

  const setRemaining = () => {
    if (remaining > 0) setCurrentAmount(remaining.toFixed(2));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px] relative">
        {/* =======================================================
            OVERLAY: INTEGRACIÓN DE TU PINPAD
        ======================================================= */}
        {showPinPad && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in zoom-in-95">
            <div className="bg-white p-6 rounded-2xl shadow-xl relative w-full max-w-sm mx-4">
              <button
                onClick={() => {
                  setShowPinPad(false);
                  setTempPin("");
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>

              {/* TU COMPONENTE REUTILIZABLE */}
              <PinPad
                pin={tempPin}
                setPin={setTempPin}
                onSubmit={handlePinSubmit}
                maxLength={6} // Limitado a 4 dígitos para agilizar
                title="Autorizar Cortesía"
                subtitle="Costo cero (no envía a SUNAT)"
              />
            </div>
          </div>
        )}

        {/* === IZQUIERDA: AGREGAR PAGOS === */}
        <div
          className={`w-full md:w-1/2 bg-slate-50 p-6 flex flex-col border-r border-slate-200 transition-opacity ${isCourtesy ? "opacity-30 pointer-events-none grayscale" : ""}`}
        >
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Plus size={20} className="text-blue-600" /> Agregar Pago
          </h3>

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
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">
                {isCourtesy ? "Costo Regular" : "Total Venta"}
              </p>
              <p
                className={`text-3xl font-black ${isCourtesy ? "text-slate-400 line-through" : "text-slate-800"}`}
              >
                S/ {total.toFixed(2)}
              </p>
              {isCourtesy && (
                <p className="text-lg font-bold text-blue-600">
                  S/ 0.00 (Cortesía)
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">
                Faltante
              </p>
              <p
                className={`text-xl font-black ${remaining > 0 ? "text-red-500" : "text-green-500"}`}
              >
                S/ {remaining.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Selector Documento con CORTESÍA añadida */}
          <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
            <button
              onClick={() => handleDocTypeChange("BOLETA")}
              className={`flex-1 py-2 rounded font-bold text-xs ${docType === "BOLETA" ? "bg-white shadow text-blue-600" : "text-slate-400 hover:bg-slate-200"}`}
            >
              BOLETA
            </button>
            <button
              onClick={() => handleDocTypeChange("FACTURA")}
              className={`flex-1 py-2 rounded font-bold text-xs ${docType === "FACTURA" ? "bg-white shadow text-purple-600" : "text-slate-400 hover:bg-slate-200"}`}
            >
              FACTURA
            </button>
            <button
              onClick={() => handleDocTypeChange("TICKET")}
              className={`flex-1 py-2 rounded font-bold text-xs flex items-center justify-center gap-1 ${docType === "TICKET" ? "bg-slate-800 shadow text-white" : "text-slate-400 hover:bg-slate-200"}`}
            >
              <Lock size={12} /> CORTESÍA
            </button>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl mb-4 bg-slate-50/50 p-2 space-y-2">
            {isCourtesy ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <CheckCircle size={40} className="mb-2 text-blue-500" />
                <p className="text-sm font-bold text-slate-700">
                  Ticket de Cortesía Aprobado
                </p>
                <p className="text-xs text-slate-400">
                  No requiere métodos de pago
                </p>
              </div>
            ) : payments.length === 0 ? (
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

          {change > 0 && !isCourtesy && (
            <div className="bg-green-50 border border-green-200 p-3 rounded-xl mb-4 flex justify-between items-center">
              <span className="text-xs font-bold text-green-700 uppercase">
                Vuelto a entregar
              </span>
              <span className="text-2xl font-black text-green-600">
                S/ {change.toFixed(2)}
              </span>
            </div>
          )}

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
              className={`flex-1 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 ${isReady ? (isCourtesy ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-900 text-white hover:bg-black") : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
            >
              <CheckCircle size={20} />{" "}
              {isCourtesy ? "CONFIRMAR CORTESÍA" : "CONFIRMAR PAGO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
