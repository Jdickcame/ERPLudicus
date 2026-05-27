import {
  ArrowRightLeft,
  Banknote,
  CheckCircle,
  CreditCard,
  FileText,
  Link,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
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
  appliedDiscount: {
    amount: number;
    reason: string;
    authorizedById: number | null;
  };
  onUpdateDiscount: (discount: {
    amount: number;
    reason: string;
    authorizedById: number | null;
  }) => void;
  onClose: () => void;
  onConfirm: (paymentData: any) => void;
}

interface PaymentLine {
  id: number;
  method: "CASH" | "CARD" | "PAGO_LINK" | "TRANSFER" | "COURTESY";
  amount: number;
}

const PaymentModal = ({
  total,
  selectedCustomer,
  isAdmin = false,
  appliedDiscount,
  onUpdateDiscount,
  onClose,
  onConfirm,
}: PaymentModalProps) => {
  // Configuración Documento (👇 NUEVO: Agregado "NOTA_VENTA")
  const [docType, setDocType] = useState<
    "BOLETA" | "FACTURA" | "TICKET" | "NOTA_VENTA"
  >(() => {
    return selectedCustomer?.document_type === "RUC" ? "FACTURA" : "BOLETA";
  });

  // --- ESTADOS ---
  const [isCourtesy, setIsCourtesy] = useState(false);
  const [showPinPad, setShowPinPad] = useState(false);
  const [tempPin, setTempPin] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");

  const [payments, setPayments] = useState<PaymentLine[]>([]);

  const [currentMethod, setCurrentMethod] = useState<
    "CASH" | "CARD" | "TRANSFER" | "PAGO_LINK"
  >("CASH");
  const [currentAmount, setCurrentAmount] = useState<string>("");

<<<<<<< HEAD
  // --- CÁLCULOS DINÁMICOS ---
  const effectiveTotal = isCourtesy ? 0 : total;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = isCourtesy ? 0 : effectiveTotal - totalPaid;
  const change =
    totalPaid > effectiveTotal && !isCourtesy ? totalPaid - effectiveTotal : 0;
=======
  const [pinPadContext, setPinPadContext] = useState<
    "COURTESY" | "DISCOUNT" | null
  >(null);
  const [isDiscountMode, setIsDiscountMode] = useState(false);
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENTAGE">(
    "AMOUNT",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [generalError, setGeneralError] = useState("");

  // --- CÁLCULOS DINÁMICOS ---
  const effectiveTotal = isCourtesy
    ? 0
    : Number(Math.max(0, total - appliedDiscount.amount).toFixed(2));

  const totalPaid = Number(
    payments.reduce((acc, p) => acc + p.amount, 0).toFixed(2),
  );

  const remaining = isCourtesy
    ? 0
    : Number((effectiveTotal - totalPaid).toFixed(2));

  const change =
    totalPaid > effectiveTotal && !isCourtesy
      ? Number((totalPaid - effectiveTotal).toFixed(2))
      : 0;
>>>>>>> 1d99500 (App Kensis)

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

  const handleDocTypeChange = (
    type: "BOLETA" | "FACTURA" | "TICKET" | "NOTA_VENTA",
  ) => {
    if (type === "TICKET") {
      if (isAdmin) {
        setSupervisorPin("BYPASS");
        setIsCourtesy(true);
        setDocType("TICKET");
        setPayments([]);
      } else {
        setShowPinPad(true);
      }
      return;
    }

    if (type === "FACTURA" && selectedCustomer?.document_type !== "RUC") {
<<<<<<< HEAD
      return alert("Error: Para Factura necesitas un RUC.");
=======
      setGeneralError("⚠️ Para Factura necesitas un cliente con RUC válido.");
      setTimeout(() => setGeneralError(""), 3000);
      return;
>>>>>>> 1d99500 (App Kensis)
    }

    // 👇 IMPORTANTE: Si es Nota de Venta (NV), NO es cortesía, sí se cobra.
    setIsCourtesy(false);
    setSupervisorPin("");

    // Solo borramos pagos si venimos de cortesía para no hacerles escribir doble
    if (isCourtesy) {
      setPayments([]);
    }

    setDocType(type);
  };

<<<<<<< HEAD
  const handlePinSubmit = () => {
    if (tempPin.length < 4) return;

    setSupervisorPin(tempPin);
    setIsCourtesy(true);
    setDocType("TICKET");
    setPayments([]);
=======
  const handleApplyDiscountRequest = () => {
    setDiscountError("");
    let val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0)
      return setDiscountError("Ingrese un monto mayor a 0");

    let calcAmount = discountType === "PERCENTAGE" ? total * (val / 100) : val;

    if (calcAmount > total - 0.1) {
      return setDiscountError(
        `Max. permitido: S/ ${(total - 0.1).toFixed(
          2,
        )} (Para S/ 0 usar CORTESÍA)`,
      );
    }

    onUpdateDiscount({
      amount: calcAmount,
      reason: discountReason.toUpperCase(),
      authorizedById: null,
    });
    setDiscountValue("");
    setDiscountReason("");
    setIsDiscountMode(false);
  };

  const handlePinSubmit = async () => {
    if (tempPin.length < 4) return;

    const allUsers = await db.users.toArray();
    const validUser = allUsers.find(
      (u) =>
        String(u.pin) === String(tempPin) &&
        (u.role === "ADMIN" ||
          u.role === "MANAGER" ||
          Boolean(u.can_authorize_voids)),
    );

    if (!validUser) {
      setPinError("❌ PIN incorrecto o sin permisos.");
      setTempPin("");
      return;
    }

    if (pinPadContext === "COURTESY") {
      setSupervisorPin(`LOCAL:${validUser.id}:${tempPin}`);
      setIsCourtesy(true);
      setDocType("TICKET");
      setPayments([]);
    }

>>>>>>> 1d99500 (App Kensis)
    setShowPinPad(false);
    setTempPin("");
  };

  const handleConfirm = () => {
    if (!isReady) return;

<<<<<<< HEAD
    // Traducir el tipo de documento del Frontend al Backend (01, 03, 00, 99)
    let invoiceTypeCode = "03"; // Boleta por defecto
    if (docType === "FACTURA") invoiceTypeCode = "01";
    if (docType === "TICKET") invoiceTypeCode = "99";
    if (docType === "NOTA_VENTA") invoiceTypeCode = "00"; // 👈 NUEVO: Código interno para Nota de Venta

    const payload = {
      invoice_type_code: invoiceTypeCode, // Enviamos el código exacto
      invoice_type: docType, // (Lo mantengo por si lo usas en otro lado)
      payments: isCourtesy
        ? [{ payment_method: "COURTESY", amount: 0 }]
        : payments.map((p) => ({ payment_method: p.method, amount: p.amount })),
=======
    if (docType === "FACTURA" && selectedCustomer?.document_type !== "RUC") {
      setGeneralError("⚠️ Las facturas exigen un cliente con RUC válido.");
      toast.error("Seleccione un cliente con RUC para Factura.");
      setTimeout(() => setGeneralError(""), 4000);
      return;
    }

    if (docType === "BOLETA" && effectiveTotal >= 700) {
      const docLength = selectedCustomer?.tax_id?.length || 0;
      if (
        !selectedCustomer ||
        selectedCustomer.tax_id === "00000000" ||
        docLength < 8
      ) {
        setGeneralError("⚠️ Boletas ≥ S/ 700 exigen DNI/CE registrado.");
        toast.error("SUNAT exige identificar al cliente para montos ≥ S/ 700");
        setTimeout(() => setGeneralError(""), 4000);
        return;
      }
    }

    let invoiceTypeCode = "03";
    if (docType === "FACTURA") invoiceTypeCode = "01";
    if (docType === "TICKET") invoiceTypeCode = "99";
    if (docType === "NOTA_VENTA") invoiceTypeCode = "00";

    const montoRecibido = isCourtesy
      ? 0
      : payments.reduce((acc, p) => acc + p.amount, 0);

    let processedPayments = [];
    if (isCourtesy) {
      processedPayments = [{ payment_method: "COURTESY", amount: 0 }];
    } else {
      let currentChange = change;

      processedPayments = payments
        .map((p) => {
          let finalAmount = p.amount;

          if (currentChange > 0 && p.method === "CASH") {
            if (finalAmount >= currentChange) {
              finalAmount -= currentChange;
              currentChange = 0;
            } else {
              currentChange -= finalAmount;
              finalAmount = 0;
            }
          }

          return { payment_method: p.method, amount: finalAmount };
        })
        .filter((p) => p.amount > 0);
    }

    const payload = {
      invoice_type_code: invoiceTypeCode,
      invoice_type: docType,
      payments: processedPayments,
>>>>>>> 1d99500 (App Kensis)
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
<<<<<<< HEAD
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px] relative">
        {/* PINPAD OVERLAY */}
        {showPinPad && (
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in zoom-in-95">
            <div className="bg-white p-6 rounded-2xl shadow-xl relative w-full max-w-sm mx-4">
=======
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 font-sans">
      {/* 👇 Ajustado para pantallas de terminales (menos ancho, altura adaptable) 👇 */}
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[480px] max-h-[90vh] relative">
        {showPinPad && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in zoom-in-95">
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-2xl relative w-full max-w-sm mx-4">
>>>>>>> 1d99500 (App Kensis)
              <button
                onClick={() => {
                  setShowPinPad(false);
                  setTempPin("");
                }}
<<<<<<< HEAD
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
=======
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors"
>>>>>>> 1d99500 (App Kensis)
              >
                <X size={24} />
              </button>
              <PinPad
                pin={tempPin}
                setPin={setTempPin}
                onSubmit={handlePinSubmit}
                maxLength={6}
                title="Autorizar Cortesía"
<<<<<<< HEAD
                subtitle="Costo cero (no envía a SUNAT)"
              />
=======
                subtitle="Requiere PIN de supervisor"
              />
              {pinError && (
                <div className="mt-2 flex justify-center animate-in slide-in-from-top-1">
                  <span className="bg-red-50 text-red-600 px-4 py-1.5 rounded-lg text-xs md:text-sm font-bold border border-red-100">
                    {pinError}
                  </span>
                </div>
              )}
>>>>>>> 1d99500 (App Kensis)
            </div>
          </div>
        )}

        {/* --- PANEL IZQUIERDO --- */}
        <div
          className={`w-full md:w-1/2 bg-slate-50 p-4 md:p-6 flex flex-col border-r border-slate-200 transition-opacity overflow-y-auto custom-scrollbar ${
            isCourtesy ? "opacity-30 pointer-events-none grayscale" : ""
          }`}
        >
          <h3 className="font-bold text-slate-700 mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
            <Plus size={18} className="text-blue-600" /> Agregar Pago
          </h3>

          <div className="grid grid-cols-2 gap-2 md:gap-3 mb-4 md:mb-6">
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
                id: "PAGO_LINK",
                label: "Pago Link",
                icon: Link,
                color: "text-indigo-600 bg-indigo-50 border-indigo-200",
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
                className={`flex flex-col items-center p-2.5 md:p-3.5 rounded-xl border-2 transition-all ${
                  currentMethod === m.id
                    ? `${m.color} ring-2 ring-offset-1`
                    : "border-slate-200 text-slate-400 hover:bg-white"
                }`}
              >
<<<<<<< HEAD
                <m.icon size={24} />
                <span className="text-xs font-bold mt-1">{m.label}</span>
=======
                <m.icon size={22} className="md:w-[26px] md:h-[26px]" />{" "}
                <span className="text-[10px] md:text-xs font-bold mt-1.5">
                  {m.label}
                </span>
>>>>>>> 1d99500 (App Kensis)
              </button>
            ))}
          </div>

          <div className="mb-4 md:mb-6">
            <label className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">
              Monto a agregar
            </label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                {/* 👇 SÍMBOLO S/ CENTRADO PERFECTAMENTE 👇 */}
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg md:text-xl">
                  S/
                </span>
                {/* 👇 INPUT CON PL-11 Y SIN FLECHAS (SPINNERS) 👇 */}
                <input
                  id="amountInput"
                  type="number"
                  className="w-full pl-11 pr-4 py-2.5 md:py-3 text-lg md:text-xl font-bold border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPayment()}
                />
              </div>
              <button
                onClick={setRemaining}
                className="bg-slate-200 px-3 md:px-4 rounded-xl font-bold text-slate-600 text-[10px] md:text-xs hover:bg-slate-300 transition-colors"
              >
                Restante
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 md:gap-2 mb-4">
            {[10, 20, 50, 100].map((val) => (
              <button
                key={val}
                onClick={() => setCurrentAmount(val.toString())}
                className="py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600 text-xs md:text-sm hover:bg-slate-100 transition-colors"
              >
                {val}
              </button>
            ))}
          </div>

          <button
            onClick={handleAddPayment}
            disabled={!currentAmount}
            className="mt-auto w-full py-3 md:py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:bg-slate-300 transition-colors text-sm"
          >
            <Plus size={18} /> AGREGAR PAGO
          </button>
        </div>

<<<<<<< HEAD
        {/* === DERECHA: RESUMEN === */}
        <div className="w-full md:w-1/2 p-6 flex flex-col bg-white">
          <div className="flex justify-between items-center mb-6">
=======
        {/* --- PANEL DERECHO --- */}
        <div className="w-full md:w-1/2 p-4 md:p-6 flex flex-col bg-white overflow-hidden">
          <div className="flex justify-between items-start mb-4 md:mb-6 shrink-0">
>>>>>>> 1d99500 (App Kensis)
            <div>
              <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">
                {isCourtesy ? "Costo Regular" : "Total Venta"}
              </p>
              <p
<<<<<<< HEAD
                className={`text-3xl font-black ${isCourtesy ? "text-slate-400 line-through" : "text-slate-800"}`}
              >
                S/ {total.toFixed(2)}
              </p>
              {isCourtesy && (
                <p className="text-lg font-bold text-blue-600">
=======
                className={`font-black ${
                  isCourtesy || appliedDiscount.amount > 0
                    ? "text-slate-400 line-through text-lg md:text-2xl"
                    : "text-slate-800 text-2xl md:text-3xl"
                }`}
              >
                S/ {total.toFixed(2)}
              </p>

              {appliedDiscount.amount > 0 && !isCourtesy && (
                <p className="text-2xl md:text-3xl font-black text-slate-800 mt-0.5 md:mt-1 animate-in slide-in-from-left-2">
                  S/ {effectiveTotal.toFixed(2)}
                </p>
              )}
              {isCourtesy && (
                <p className="text-base md:text-lg font-bold text-blue-600 mt-0.5 md:mt-1">
>>>>>>> 1d99500 (App Kensis)
                  S/ 0.00 (Cortesía)
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">
                Faltante
              </p>
              <p
                className={`text-lg md:text-xl font-black ${
                  remaining > 0 ? "text-red-500" : "text-green-500"
                }`}
              >
                S/ {remaining.toFixed(2)}
              </p>
            </div>
          </div>

<<<<<<< HEAD
          {/* 👇 NUEVO SELECTOR DE DOCUMENTOS DE 4 BOTONES */}
          <div className="flex flex-col gap-1 mb-4">
=======
          {!isCourtesy && (
            <div className="mb-3 md:mb-4 shrink-0">
              {appliedDiscount.amount > 0 ? (
                <div className="flex justify-between items-center bg-purple-50 p-2 md:p-3 rounded-xl border border-purple-100 animate-in slide-in-from-top-2">
                  <div className="text-purple-700 flex flex-col">
                    <span className="text-[10px] md:text-xs font-bold flex items-center gap-1">
                      <Tag size={12} /> Descuento
                    </span>
                    {appliedDiscount.reason && (
                      <span className="text-[9px] md:text-[10px] font-medium opacity-80">
                        {appliedDiscount.reason}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <span className="font-black text-purple-700 text-base md:text-lg">
                      -S/ {appliedDiscount.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() =>
                        onUpdateDiscount({
                          amount: 0,
                          reason: "",
                          authorizedById: null,
                        })
                      }
                      className="bg-white p-1 md:p-1.5 rounded-full text-purple-400 hover:text-red-500 shadow-sm"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : !isDiscountMode ? (
                <button
                  onClick={() => setIsDiscountMode(true)}
                  className="w-full py-2 md:py-2.5 border border-dashed border-slate-300 rounded-xl text-[10px] md:text-xs font-bold text-slate-500 hover:text-purple-600 hover:border-purple-300 transition-colors flex items-center justify-center gap-2"
                >
                  <Tag size={14} /> APLICAR DESCUENTO
                </button>
              ) : (
                <div className="bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-200 animate-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-2 md:mb-3">
                    <span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase">
                      Configurar Descuento
                    </span>
                    <button
                      onClick={() => {
                        setIsDiscountMode(false);
                        setDiscountError("");
                      }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex gap-1.5 md:gap-2 mb-2 md:mb-3">
                    <button
                      onClick={() => setDiscountType("AMOUNT")}
                      className={`flex-1 text-[10px] md:text-xs py-1.5 md:py-2 rounded-lg font-bold transition-all ${
                        discountType === "AMOUNT"
                          ? "bg-white shadow text-purple-600 border border-transparent"
                          : "text-slate-500 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Monto (S/)
                    </button>
                    <button
                      onClick={() => setDiscountType("PERCENTAGE")}
                      className={`flex-1 text-[10px] md:text-xs py-1.5 md:py-2 rounded-lg font-bold transition-all ${
                        discountType === "PERCENTAGE"
                          ? "bg-white shadow text-purple-600 border border-transparent"
                          : "text-slate-500 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Porcentaje (%)
                    </button>
                  </div>
                  <div className="flex gap-1.5 md:gap-2 mb-2">
                    <input
                      type="number"
                      placeholder="Valor"
                      className="w-1/3 p-1.5 md:p-2 text-xs md:text-sm font-bold border border-slate-300 rounded-lg outline-none focus:border-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={discountValue}
                      onChange={(e) => {
                        setDiscountValue(e.target.value);
                        setDiscountError("");
                      }}
                    />
                    <input
                      type="text"
                      autoCapitalize="characters"
                      placeholder="MOTIVO (OPC.)"
                      className="w-2/3 p-1.5 md:p-2 text-[10px] md:text-xs border border-slate-300 rounded-lg outline-none focus:border-purple-400 uppercase"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                    />
                  </div>
                  {discountError && (
                    <p className="text-red-500 text-[9px] md:text-[10px] font-bold text-center mb-1.5 md:mb-2">
                      {discountError}
                    </p>
                  )}
                  <button
                    onClick={handleApplyDiscountRequest}
                    disabled={!discountValue}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg text-[10px] md:text-sm disabled:opacity-50 transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 mb-3 md:mb-4 shrink-0">
            {generalError && (
              <p className="text-[10px] md:text-xs font-bold text-red-500 bg-red-50 p-1.5 md:p-2 rounded text-center animate-pulse mb-1">
                {generalError}
              </p>
            )}
>>>>>>> 1d99500 (App Kensis)
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => handleDocTypeChange("BOLETA")}
                className={`flex-1 py-1.5 md:py-2 rounded font-bold text-[10px] md:text-xs transition-colors ${
                  docType === "BOLETA"
                    ? "bg-white shadow text-blue-600"
                    : "text-slate-400 hover:bg-slate-200"
                }`}
              >
                BOLETA
              </button>
              <button
                onClick={() => handleDocTypeChange("FACTURA")}
                className={`flex-1 py-1.5 md:py-2 rounded font-bold text-[10px] md:text-xs transition-colors ${
                  docType === "FACTURA"
                    ? "bg-white shadow text-purple-600"
                    : "text-slate-400 hover:bg-slate-200"
                }`}
              >
                FACTURA
              </button>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => handleDocTypeChange("NOTA_VENTA")}
                className={`flex-1 py-1.5 md:py-2 rounded font-bold text-[9px] md:text-[11px] flex items-center justify-center gap-1 transition-colors ${
                  docType === "NOTA_VENTA"
                    ? "bg-slate-800 shadow text-amber-400"
                    : "text-slate-400 hover:bg-slate-200"
                }`}
              >
                <FileText size={12} /> NOTA VENTA
              </button>
              <button
                onClick={() => handleDocTypeChange("TICKET")}
                className={`flex-1 py-1.5 md:py-2 rounded font-bold text-[9px] md:text-[11px] flex items-center justify-center gap-1 transition-colors ${
                  docType === "TICKET"
                    ? "bg-slate-800 shadow text-white"
                    : "text-slate-400 hover:bg-slate-200"
                }`}
              >
                <Lock size={12} /> CORTESÍA
              </button>
            </div>
          </div>
<<<<<<< HEAD
          {docType === "NOTA_VENTA" && (
            <p className="text-[10px] text-amber-600 font-bold bg-amber-50 p-1.5 rounded text-center mb-2 mt-[-8px]">
              ⚠️ Control Interno - No viaja a SUNAT
            </p>
          )}
=======
>>>>>>> 1d99500 (App Kensis)

          <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl mb-3 md:mb-4 bg-slate-50/50 p-1.5 md:p-2 space-y-1.5 custom-scrollbar">
            {isCourtesy ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <CheckCircle size={36} className="mb-1 md:mb-2 text-blue-500" />
                <p className="text-xs md:text-sm font-bold text-slate-700">
                  Cortesía Aprobada
                </p>
                <p className="text-xs text-slate-400">
                  No requiere métodos de pago
                </p>
              </div>
            ) : payments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <Banknote size={36} className="mb-1 opacity-20" />
                <p className="text-[10px] md:text-xs">Sin pagos agregados</p>
              </div>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="bg-white p-2 md:p-3 rounded-lg border border-slate-100 shadow-sm flex justify-between items-center animate-in slide-in-from-left-2"
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    {p.method === "CASH" && (
                      <Banknote
                        size={16}
                        className="text-green-500 md:w-[18px] md:h-[18px]"
                      />
                    )}
                    {p.method === "CARD" && (
                      <CreditCard
                        size={16}
                        className="text-blue-500 md:w-[18px] md:h-[18px]"
                      />
                    )}
                    {p.method === "PAGO_LINK" && (
                      <Link
                        size={16}
                        className="text-indigo-500 md:w-[18px] md:h-[18px]"
                      />
                    )}
                    {p.method === "TRANSFER" && (
                      <ArrowRightLeft
                        size={16}
                        className="text-purple-500 md:w-[18px] md:h-[18px]"
                      />
                    )}
                    <span className="font-bold text-xs md:text-sm text-slate-700">
                      {p.method === "CASH"
                        ? "Efectivo"
                        : p.method === "CARD"
                        ? "Visa/Yape"
                        : p.method === "PAGO_LINK"
                        ? "Pago Link"
                        : "Transf."}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <span className="font-bold text-xs md:text-sm">
                      S/ {p.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => removePayment(p.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} className="md:w-[16px] md:h-[16px]" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {change > 0 && !isCourtesy && (
            <div className="bg-green-50 border border-green-200 p-2 md:p-3 rounded-xl mb-3 md:mb-4 flex justify-between items-center shrink-0">
              <span className="text-[10px] md:text-xs font-bold text-green-700 uppercase">
                Vuelto
              </span>
              <span className="text-xl md:text-2xl font-black text-green-600">
                S/ {change.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3 md:px-4 rounded-xl border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-colors flex items-center justify-center"
            >
              <X size={20} className="md:w-[24px] md:h-[24px]" />
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isReady}
              className={`flex-1 py-3 md:py-4 rounded-xl font-bold text-sm md:text-lg shadow-lg flex items-center justify-center gap-2 transition-all ${
                isReady
                  ? isCourtesy
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-slate-900 text-white hover:bg-black"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              <CheckCircle size={18} className="md:w-[20px] md:h-[20px]" />{" "}
              {isCourtesy ? "CORTESÍA" : "CONFIRMAR PAGO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
