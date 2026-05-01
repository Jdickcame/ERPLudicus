import {
    AlertTriangle,
    ArrowRightLeft,
    Banknote,
    CreditCard,
    Eye,
    EyeOff,
    History,
    Lock,
    TrendingDown
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

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
  // Campos del Backend (Desglose)
  current_balance: number;
  expected_cash: number;
  expected_card: number;
  expected_transfer: number;
}

const CashPage = () => {
  const { user } = useAuth(); // Para saber si es ADMIN
  const [shift, setShift] = useState<CashShift | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);

  // Inputs Apertura
  const [initialAmount, setInitialAmount] = useState("");

  // Inputs Gasto
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");

  // 🔒 Inputs Cierre (ARQUEO CIEGO)
  const [declaredCash, setDeclaredCash] = useState("");
  const [declaredCard, setDeclaredCard] = useState("");
  const [declaredTransfer, setDeclaredTransfer] = useState("");

  // Estado para "Revelar" diferencias (Solo Admin o al cerrar)
  const [showSystemBalance, setShowSystemBalance] = useState(false);

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
      if (error.response && error.response.status === 404) setShift(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCashStatus();
  }, []);

  // --- APERTURA ---
  const handleOpenShift = async () => {
    if (!initialAmount) return alert("Ingresa el monto inicial");
    if (registers.length === 0)
      return alert("Error: No hay cajas configuradas");
    try {
      await api.post("/cash/shifts/", {
        initial_balance: initialAmount,
        cash_register: registers[0].id,
      });
      loadCashStatus();
    } catch (error) {
      alert("Error al abrir caja");
    }
  };

  // --- GASTO ---
  const handleAddExpense = async () => {
    if (!expenseAmount || !expenseDesc)
      return alert("Completa monto y descripción");
    try {
      await api.post("/cash/movements/", {
        amount: expenseAmount,
        movement_type: "OUT",
        concept: "EXPENSE",
        description: expenseDesc,
      });
      alert("💸 Gasto registrado");
      setExpenseAmount("");
      setExpenseDesc("");
      setShowExpenseForm(false);
      loadCashStatus();
    } catch (error) {
      alert("Error registrando gasto");
    }
  };

  // --- CIERRE (VALIDACIÓN) ---
  const handlePreClose = () => {
    if (!shift) return;

    const dCash = parseFloat(declaredCash) || 0;
    const dCard = parseFloat(declaredCard) || 0; // Visa / Yape
    const dTransfer = parseFloat(declaredTransfer) || 0; // Transferencia

    const totalDeclared = dCash + dCard + dTransfer;

    // Diferencias
    const diffCash = dCash - shift.expected_cash;
    const diffCard = dCard - shift.expected_card;
    const diffTransfer = dTransfer - shift.expected_transfer;

    const isPerfect =
      Math.abs(diffCash) < 0.1 &&
      Math.abs(diffCard) < 0.1 &&
      Math.abs(diffTransfer) < 0.1;

    const msg = `
      📊 REPORTE DE CIERRE
      ===================================
      EFECTIVO:      Declarado S/ ${dCash}  | Sistema: ${isPerfect ? "OK" : "S/ " + shift.expected_cash.toFixed(2)}
      VISA / YAPE:   Declarado S/ ${dCard}  | Sistema: ${isPerfect ? "OK" : "S/ " + shift.expected_card.toFixed(2)}
      TRANSFERENCIA: Declarado S/ ${dTransfer} | Sistema: ${isPerfect ? "OK" : "S/ " + shift.expected_transfer.toFixed(2)}
      ===================================
      TOTAL:     Declarado S/ ${totalDeclared.toFixed(2)}
      
      ${isPerfect ? "✅ CUADRE PERFECTO" : "⚠️ HAY DIFERENCIAS - ¿Deseas cerrar igual?"}
      `;

    if (window.confirm(msg)) {
      submitClose(totalDeclared);
    }
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
    } catch (error) {
      alert("Error al cerrar caja");
    }
  };

  // Permiso para ver "Ojos" (Solo admin)
  const canSeeBalance = user?.role === "ADMIN" || user?.is_superuser;

  if (loading) return <div className="p-10 text-center">Cargando...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans text-slate-700">
      <h1 className="text-2xl font-black mb-6 flex items-center gap-2">
        <Banknote className="text-green-600" /> GESTIÓN DE CAJA
      </h1>

      {!shift ? (
        // --- MODO CERRADO ---
        <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center mt-10">
          <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-slate-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">Turno Cerrado</h2>
          <div className="mb-4 text-left">
            <label className="text-xs font-bold text-slate-400 uppercase">
              Fondo Inicial
            </label>
            <input
              type="number"
              className="w-full p-3 border rounded-lg text-2xl font-bold text-center"
              placeholder="0.00"
              value={initialAmount}
              onChange={(e) => setInitialAmount(e.target.value)}
              autoFocus
            />
          </div>
          <button
            onClick={handleOpenShift}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg"
          >
            APERTURAR CAJA
          </button>
        </div>
      ) : (
        // --- MODO ABIERTO ---
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. INFORMACIÓN Y GASTOS */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-700">Saldo Teórico</h3>
                {canSeeBalance && (
                  <button
                    onClick={() => setShowSystemBalance(!showSystemBalance)}
                    className="text-slate-400 hover:text-blue-600"
                  >
                    {showSystemBalance ? (
                      <EyeOff size={20} />
                    ) : (
                      <Eye size={20} />
                    )}
                  </button>
                )}
              </div>

              {/* SALDO CIEGO */}
              <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                <p className="text-xs text-slate-400 font-bold uppercase mb-1">
                  Total Sistema
                </p>
                <p
                  className={`text-3xl font-black ${showSystemBalance ? "text-slate-800" : "text-slate-300 blur-sm select-none"}`}
                >
                  {showSystemBalance
                    ? `S/ ${shift.current_balance.toFixed(2)}`
                    : "S/ ???.??"}
                </p>
              </div>

              {!showExpenseForm ? (
                <button
                  onClick={() => setShowExpenseForm(true)}
                  className="w-full py-3 border-2 border-dashed border-red-200 bg-red-50 text-red-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                >
                  <TrendingDown size={18} /> REGISTRAR GASTO
                </button>
              ) : (
                <div className="bg-red-50 p-3 rounded-lg animate-in fade-in">
                  <input
                    type="number"
                    placeholder="Monto"
                    className="w-full p-2 mb-2 rounded border"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Motivo"
                    className="w-full p-2 mb-2 rounded border"
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowExpenseForm(false)}
                      className="flex-1 py-1 bg-white border rounded"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleAddExpense}
                      className="flex-1 py-1 bg-red-600 text-white rounded font-bold"
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
              <AlertTriangle className="text-orange-500" /> Declaración de
              Cierre
            </h3>

            <div className="space-y-4">
              {/* INPUT 1: EFECTIVO */}
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-1">
                  <Banknote size={14} /> Efectivo Real (Caja)
                </label>
                <input
                  type="number"
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-lg font-bold text-slate-700 focus:border-green-400 outline-none"
                  placeholder="0.00"
                  value={declaredCash}
                  onChange={(e) => setDeclaredCash(e.target.value)}
                />
              </div>

              {/* INPUT 2: VISA / YAPE */}
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-1">
                  <CreditCard size={14} /> Visa / Yape (Voucher)
                </label>
                <input
                  type="number"
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-lg font-bold text-slate-700 focus:border-blue-400 outline-none"
                  placeholder="0.00"
                  value={declaredCard}
                  onChange={(e) => setDeclaredCard(e.target.value)}
                />
              </div>

              {/* INPUT 3: TRANSFERENCIA */}
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-1">
                  <ArrowRightLeft size={14} /> Transferencia Bancaria
                </label>
                <input
                  type="number"
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-lg font-bold text-slate-700 focus:border-purple-400 outline-none"
                  placeholder="0.00"
                  value={declaredTransfer}
                  onChange={(e) => setDeclaredTransfer(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={handlePreClose}
                className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-95"
              >
                VALIDAR Y CERRAR
              </button>
            </div>
          </div>

          {/* 3. HISTORIAL */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px]">
            <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <h3 className="font-bold flex items-center gap-2 text-sm text-slate-600">
                <History size={16} /> Movimientos
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {movements.map((mov) => (
                <div
                  key={mov.id}
                  className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-bold text-xs text-slate-700">
                      {mov.description || mov.concept}
                    </p>
                    <p className="text-[10px] text-slate-400">
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
                    className={`font-bold text-sm ${mov.movement_type === "IN" ? "text-green-600" : "text-red-600"}`}
                  >
                    {mov.movement_type === "IN" ? "+" : "-"} S/{" "}
                    {parseFloat(mov.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashPage;
