import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  CreditCard,
  Eye,
  EyeOff,
  History,
  Lock,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import PinPad from "../../components/common/PinPad";
import { useAuth } from "../../context/AuthContext";
import PosHeader from "../pos/components/PosHeader";

// --- INTERFACES ---
interface CashRegister {
  id: number;
  name: string;
}
interface Movement {
  id: number;
  amount: string;
  movement_type: "IN" | "OUT";
  concept: string;
  description: string;
  created_at: string;
}
interface CashShift {
  id: number;
  status: "OPEN" | "CLOSED";
  initial_balance: string;
  opened_at: string;
  current_balance: number;
  expected_cash: number;
  expected_card: number;
  expected_transfer: number;
}

const CashPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isManager =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  const [shift, setShift] = useState<CashShift | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);

  const [initialAmount, setInitialAmount] = useState("");

  // 👇 NUEVOS ESTADOS DE MOVIMIENTOS
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementType, setMovementType] = useState<"IN" | "OUT">("OUT");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDesc, setMovementDesc] = useState("");

  const [declaredCash, setDeclaredCash] = useState("");
  const [declaredCard, setDeclaredCard] = useState("");
  const [declaredTransfer, setDeclaredTransfer] = useState("");
  const [showSystemBalance, setShowSystemBalance] = useState(false);

  const [showPinModal, setShowPinModal] = useState(false);
  const [authPin, setAuthPin] = useState("");

  const isPosMode = location.pathname.startsWith("/pos");

  const loadCashStatus = async () => {
    setLoading(true);
    try {
      const regRes = await api.get("/cash/registers/");
      setRegisters(regRes.data.results || regRes.data);
      const res = await api.get("/cash/shifts/current/");
      setShift(res.data);
      if (res.data) {
        const movRes = await api.get(`/cash/movements/?shift=${res.data.id}`);
        setMovements(movRes.data.results || movRes.data);
      }
    } catch (error: any) {
      if (error.response?.status === 404) setShift(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCashStatus();
  }, []);

  const handleOpenShift = async () => {
    if (!initialAmount) return alert("Ingresa el monto inicial");
    if (registers.length === 0)
      return alert("Error: No hay cajas configuradas");
    try {
      await api.post("/cash/shifts/", {
        initial_balance: initialAmount,
        cash_register: registers[0].id,
      });
      if (isPosMode) {
        navigate("/pos");
      } else {
        loadCashStatus();
      }
    } catch (error) {
      alert("Error al abrir caja");
    }
  };

  // FUNCIÓN PARA GUARDAR INGRESO O RETIRO
  const executeMovement = async (pinForBackend?: string) => {
    try {
      await api.post("/cash/movements/", {
        shift: shift?.id,
        amount: movementAmount,
        movement_type: movementType,
        concept: movementType === "IN" ? "DEPOSIT" : "EXPENSE",
        description: movementDesc,
        pin_autorizacion: pinForBackend,
      });

      alert(
        `✅ ${movementType === "IN" ? "Ingreso" : "Retiro"} registrado exitosamente.`,
      );

      setMovementAmount("");
      setMovementDesc("");
      setShowMovementForm(false);
      setShowPinModal(false);
      loadCashStatus();
    } catch (error: any) {
      alert(
        "❌ Error: " +
          JSON.stringify(error.response?.data || "Operación denegada"),
      );
      setAuthPin("");
    }
  };

  // 👇 Lo que pasa al darle al botón "Guardar" verde/rojo
  const handleRequestMovement = () => {
    if (!movementAmount || parseFloat(movementAmount) <= 0)
      return alert("Ingresa un monto válido");
    if (!movementDesc) return alert("Completa la descripción");
    if (!shift) return alert("No hay un turno abierto.");

    if (isManager) {
      // 🚀 ATajo: Si es admin, ejecuta directo sin pedir PIN
      executeMovement();
    } else {
      // 🔒 Si es cajero, limpia el PIN y abre el candado
      setAuthPin("");
      setShowPinModal(true);
    }
  };

  // 👇 Lo que pasa cuando el cajero digita el PIN del gerente y le da a Confirmar
  const handleConfirmMovement = async () => {
    if (!shift) return;
    if (authPin.length < 4)
      return alert("El PIN debe tener al menos 4 dígitos");

    // Aquí podrías validar el PIN primero en el backend, o pasarlo en executeMovement
    executeMovement(authPin);
  };

  const handlePreClose = () => {
    if (!shift) return;
    const dCash = parseFloat(declaredCash) || 0;
    const dCard = parseFloat(declaredCard) || 0;
    const dTransfer = parseFloat(declaredTransfer) || 0;
    const totalDeclared = dCash + dCard + dTransfer;

    const diffCash = dCash - shift.expected_cash;
    const diffCard = dCard - shift.expected_card;
    const diffTransfer = dTransfer - shift.expected_transfer;

    const isPerfect =
      Math.abs(diffCash) < 0.1 &&
      Math.abs(diffCard) < 0.1 &&
      Math.abs(diffTransfer) < 0.1;

    const msg = `📊 REPORTE DE CIERRE\n===================================\nEFECTIVO: Declarado S/ ${dCash} | Sistema: ${isPerfect ? "OK" : "S/ " + shift.expected_cash.toFixed(2)}\nVISA/YAPE: Declarado S/ ${dCard} | Sistema: ${isPerfect ? "OK" : "S/ " + shift.expected_card.toFixed(2)}\nTRANSFERENCIA: Declarado S/ ${dTransfer} | Sistema: ${isPerfect ? "OK" : "S/ " + shift.expected_transfer.toFixed(2)}\n===================================\nTOTAL REAL: S/ ${totalDeclared.toFixed(2)}\n\n${isPerfect ? "✅ CUADRE PERFECTO" : "⚠️ HAY DIFERENCIAS - ¿Cerrar igual?"}`;

    if (window.confirm(msg)) submitClose(totalDeclared);
  };

  const submitClose = async (finalReal: number) => {
    if (!shift) return;
    try {
      await api.post(`/cash/shifts/${shift.id}/close/`, {
        final_balance_real: finalReal,
      });
      alert("🔒 Turno Cerrado Correctamente");
      setShift(null);
      setMovements([]);
      setDeclaredCash("");
      setDeclaredCard("");
      setDeclaredTransfer("");
      if (isPosMode) navigate("/pos-login");
    } catch (error) {
      alert("Error al cerrar caja");
    }
  };

  const canSeeBalance = user?.role === "ADMIN" || user?.is_superuser;

  if (loading)
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-100 text-slate-500 animate-pulse">
        Cargando estado de caja...
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {isPosMode && <PosHeader />}

      <div
        className={`p-6 w-full ${!isPosMode ? "max-w-6xl mx-auto" : ""} font-sans text-slate-700 flex-1`}
      >
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Banknote className="text-green-600" /> GESTIÓN DE CAJA
          </h1>
          {isPosMode && shift && (
            <button
              onClick={() => navigate("/pos")}
              className="bg-slate-900 text-white px-5 py-2 rounded-xl font-bold hover:bg-black transition-all flex items-center gap-2 shadow-md"
            >
              <ArrowRightLeft size={18} /> VOLVER A VENDER
            </button>
          )}
        </div>

        {!shift ? (
          <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center mt-10 animate-in zoom-in-95 duration-300">
            <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-slate-400" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-slate-800">
              Turno Cerrado
            </h2>
            <div className="mb-4 text-left">
              <label className="text-xs font-bold text-slate-400 uppercase">
                Fondo Inicial
              </label>
              <input
                type="number"
                className="w-full p-3 border-2 border-slate-100 rounded-lg text-2xl font-bold text-center outline-none focus:border-blue-500 transition-all"
                placeholder="0.00"
                value={initialAmount}
                onChange={(e) => setInitialAmount(e.target.value)}
                autoFocus
              />
            </div>
            <button
              onClick={handleOpenShift}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg transform active:scale-95 transition-all"
            >
              APERTURAR CAJA
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            {/* 1. INFORMACIÓN Y GASTOS */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-700">Saldo Teórico</h3>
                  {canSeeBalance && (
                    <button
                      onClick={() => setShowSystemBalance(!showSystemBalance)}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {showSystemBalance ? (
                        <EyeOff size={20} />
                      ) : (
                        <Eye size={20} />
                      )}
                    </button>
                  )}
                </div>
                <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">
                    Total Sistema
                  </p>
                  <p
                    className={`text-3xl font-black transition-all duration-300 ${showSystemBalance ? "text-slate-800" : "text-slate-300 blur-sm select-none"}`}
                  >
                    {showSystemBalance
                      ? `S/ ${shift.current_balance.toFixed(2)}`
                      : "S/ ???.??"}
                  </p>
                </div>

                {/* 👇 INTERFAZ MODIFICADA PARA NUEVO MOVIMIENTO */}
                {!showMovementForm ? (
                  <button
                    onClick={() => setShowMovementForm(true)}
                    className="w-full py-3.5 border-2 border-dashed border-slate-300 bg-white text-slate-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <ArrowRightLeft size={18} /> NUEVO MOVIMIENTO
                  </button>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in slide-in-from-top-2">
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setMovementType("IN")}
                        className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg border-2 transition-all ${
                          movementType === "IN"
                            ? "border-green-600 bg-green-100 text-green-700"
                            : "border-transparent bg-white text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        + Ingreso
                      </button>
                      <button
                        onClick={() => setMovementType("OUT")}
                        className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg border-2 transition-all ${
                          movementType === "OUT"
                            ? "border-red-600 bg-red-100 text-red-700"
                            : "border-transparent bg-white text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        - Retiro
                      </button>
                    </div>

                    <input
                      type="number"
                      placeholder="Monto (S/)"
                      className={`w-full p-2.5 mb-2 rounded-lg border-2 outline-none transition-colors font-bold text-lg text-center ${
                        movementType === "IN"
                          ? "focus:border-green-400 text-green-700"
                          : "focus:border-red-400 text-red-700"
                      }`}
                      value={movementAmount}
                      onChange={(e) => setMovementAmount(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Motivo detallado..."
                      className="w-full p-2.5 mb-4 rounded-lg border border-slate-300 outline-none focus:border-blue-400 text-sm"
                      value={movementDesc}
                      onChange={(e) => setMovementDesc(e.target.value)}
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowMovementForm(false)}
                        className="flex-1 py-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-500 text-sm hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleRequestMovement}
                        className={`flex-1 py-2.5 text-white rounded-lg font-bold text-sm shadow-md transition-colors ${
                          movementType === "IN"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-red-600 hover:bg-red-700"
                        }`}
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. ARQUEO POR MEDIO DE PAGO */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <AlertTriangle className="text-orange-500" size={20} />{" "}
                Declaración de Cierre
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-1">
                    <Banknote size={14} /> Efectivo Real (Caja)
                  </label>
                  <input
                    type="number"
                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 focus:border-green-400 outline-none transition-all"
                    placeholder="0.00"
                    value={declaredCash}
                    onChange={(e) => setDeclaredCash(e.target.value)}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-1">
                    <CreditCard size={14} /> Visa / Yape (Voucher)
                  </label>
                  <input
                    type="number"
                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 focus:border-blue-400 outline-none transition-all"
                    placeholder="0.00"
                    value={declaredCard}
                    onChange={(e) => setDeclaredCard(e.target.value)}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-1">
                    <ArrowRightLeft size={14} /> Transferencia Bancaria
                  </label>
                  <input
                    type="number"
                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 focus:border-purple-400 outline-none transition-all"
                    placeholder="0.00"
                    value={declaredTransfer}
                    onChange={(e) => setDeclaredTransfer(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={handlePreClose}
                  className="w-full bg-slate-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-xl transform active:scale-95 transition-all"
                >
                  VALIDAR Y CERRAR TURNO
                </button>
              </div>
            </div>

            {/* 3. HISTORIAL */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[520px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2 text-sm text-slate-600">
                  <History size={16} /> Movimientos del Turno
                </h3>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                  Turno #{shift.id}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {movements.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 italic text-sm">
                    Sin movimientos aún
                  </div>
                ) : (
                  // 👇 MAGIA AQUÍ: Agrupamos los movimientos por descripción antes de renderizarlos
                  Object.values(
                    movements.reduce((acc: any, mov) => {
                      const key = `${mov.description}-${mov.movement_type}`;
                      if (!acc[key]) {
                        acc[key] = {
                          ...mov,
                          numericAmount: parseFloat(mov.amount),
                        };
                      } else {
                        acc[key].numericAmount += parseFloat(mov.amount);
                      }
                      return acc;
                    }, {}),
                  ).map((mov: any) => (
                    <div
                      key={mov.id}
                      className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-bold text-xs text-slate-700 truncate">
                          {mov.description || mov.concept}
                        </p>
                        <p className="text-[10px] text-slate-400 uppercase font-medium">
                          {new Date(mov.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          •
                          <span
                            className={
                              mov.movement_type === "IN"
                                ? "text-green-600"
                                : "text-red-500"
                            }
                          >
                            {" "}
                            {mov.movement_type === "IN" ? "Ingreso" : "Salida"}
                          </span>
                        </p>
                      </div>
                      <span
                        className={`font-black text-sm whitespace-nowrap ${mov.movement_type === "IN" ? "text-green-600" : "text-red-600"}`}
                      >
                        {mov.movement_type === "IN" ? "+" : "-"} S/{" "}
                        {mov.numericAmount.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* 🔒 MODAL DE PINPAD CON TU COMPONENTE REUTILIZABLE */}
      {showPinModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-[360px] relative animate-in zoom-in-95 duration-200">
            {/* Botón para cerrar el modal */}
            <button
              onClick={() => setShowPinModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors"
            >
              <X size={24} />
            </button>

            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 mt-4">
              <Lock size={32} className="text-slate-800" />
            </div>

            {/* 👇 AQUÍ USAMOS TU COMPONENTE 👇 */}
            <PinPad
              pin={authPin}
              setPin={setAuthPin}
              onSubmit={handleConfirmMovement}
              maxLength={6}
              title="Autorización"
              subtitle={`PIN para ${movementType === "IN" ? "ingresar" : "retirar"} S/ ${parseFloat(movementAmount).toFixed(2)}`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CashPage;
