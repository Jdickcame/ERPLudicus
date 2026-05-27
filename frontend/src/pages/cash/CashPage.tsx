import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  CreditCard,
  Eye,
  EyeOff,
  History,
  Link,
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
  boleta_series?: string;
  factura_series?: string;
  nota_series?: string;
  ticket_series?: string;
  next_boleta_number?: number;
  next_factura_number?: number;
  next_nota_number?: number;
  next_ticket_number?: number;
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
  expected_pago_link?: number;
  register_name?: string;
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
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

  const [generalError, setGeneralError] = useState("");
  const [generalSuccess, setGeneralSuccess] = useState("");

  // 📱 DETECTOR DE HARDWARE
  const isAndroid = Capacitor.getPlatform() === "android";

  // 🎨 FÓRMULA IMIN COMPLETADA
  const hoverBtnDark = !isAndroid ? "hover:bg-black" : "";
  const hoverBtnBlue = !isAndroid ? "hover:bg-blue-700" : "";
  const hoverBtnGreen = !isAndroid ? "hover:bg-green-700" : "";
  const hoverBtnRed = !isAndroid ? "hover:bg-red-700" : "";
  const hoverBtnSlate = !isAndroid ? "hover:bg-slate-50" : "";
  const hoverRowSlate = !isAndroid ? "hover:bg-slate-50" : "";
  const hoverTextBlue = !isAndroid ? "hover:text-blue-600" : "";
  const hoverManagerBtn = !isAndroid
    ? "hover:bg-slate-800 hover:text-white"
    : "";
  const hoverCloseBtn = !isAndroid ? "hover:text-red-500 hover:bg-red-50" : "";

  const checkConnection = async () => {
    try {
      await api.get("/cash/registers/", { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  };

  const loadCashFromCache = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const cachedRegistersStr = localStorage.getItem("pos_registers_cache");
      if (cachedRegistersStr) {
        const cachedRegisters = JSON.parse(cachedRegistersStr);
        setRegisters(cachedRegisters);
        if (cachedRegisters.length > 0) {
          setSelectedRegisterId((prev) =>
            prev ? prev : cachedRegisters[0].id.toString(),
          );
        }
      }

      const localShiftId = localStorage.getItem("pos_shift_id");
      const isLocalOpen = localStorage.getItem("pos_shift_open") === "true";

      if (isLocalOpen && localShiftId) {
        const cachedShiftStr = localStorage.getItem("pos_shift_data");
        const cachedShift = cachedShiftStr ? JSON.parse(cachedShiftStr) : {};
        const baseBalance = parseFloat(cachedShift.current_balance) || 0;

        let pendingMovementsRaw: any[] = [];
        let pendingSalesRaw: any[] = [];

        try {
          pendingMovementsRaw = await db.pending_movements.toArray();
        } catch (e) {}

        try {
          pendingSalesRaw = await db.sales
            .filter((s: any) => s.sync_status !== "SYNCED")
            .toArray();
        } catch (e) {}

        let offlineImpact = 0;
        pendingMovementsRaw.forEach((m: any) => {
          if (m.movement_type === "IN")
            offlineImpact += parseFloat(m.amount || 0);
          if (m.movement_type === "OUT")
            offlineImpact -= parseFloat(m.amount || 0);
        });
        pendingSalesRaw.forEach((s: any) => {
          offlineImpact += parseFloat(s.total || 0);
        });

        setShift({
          id: parseInt(localShiftId),
          status: "OPEN",
          initial_balance: cachedShift.initial_balance || "0.00",
          opened_at: cachedShift.opened_at || new Date().toISOString(),
          current_balance: baseBalance + offlineImpact,
          expected_cash:
            (parseFloat(cachedShift.expected_cash) || 0) + offlineImpact,
          expected_card: parseFloat(cachedShift.expected_card) || 0,
          expected_transfer: parseFloat(cachedShift.expected_transfer) || 0,
          expected_pago_link: parseFloat(cachedShift.expected_pago_link) || 0,
          register_name: cachedShift.register_name || "Caja Local",
        });

        const pendingMovementsFormatted = pendingMovementsRaw.map((m: any) => ({
          id: m.uuid,
          amount: m.amount,
          movement_type: m.movement_type,
          concept: m.concept,
          description: m.description + " (Pendiente Sync)",
          created_at: m.created_at,
        }));

        const cachedMovements = JSON.parse(
          localStorage.getItem("pos_cash_movements_cache") || "[]",
        );
        const cachedFiltered = cachedMovements.filter(
          (cacheItem: any) =>
            !pendingMovementsFormatted.some(
              (pendingItem: any) => pendingItem.id === cacheItem.id,
            ),
        );

        setMovements([...pendingMovementsFormatted, ...cachedFiltered]);
      } else {
        setShift(null);
      }
    } catch (error) {
      console.error("❌ Error cargando desde caché:", error);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const [initialAmount, setInitialAmount] = useState("");

  // 👇 NUEVOS ESTADOS DE MOVIMIENTOS
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementType, setMovementType] = useState<"IN" | "OUT">("OUT");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDesc, setMovementDesc] = useState("");

  const [declaredCash, setDeclaredCash] = useState("");
  const [declaredCard, setDeclaredCard] = useState("");
  const [declaredTransfer, setDeclaredTransfer] = useState("");
  const [declaredPagoLink, setDeclaredPagoLink] = useState("");
  const [showSystemBalance, setShowSystemBalance] = useState(false);

  // Múltiples Modales de PIN para blindar la operación
  const [showPinModal, setShowPinModal] = useState(false);
  const [authPin, setAuthPin] = useState("");
  const [authPinError, setAuthPinError] = useState("");

  const [showBalancePinModal, setShowBalancePinModal] = useState(false);
  const [balancePin, setBalancePin] = useState("");
  const [balancePinError, setBalancePinError] = useState("");

  const [showXReportPinModal, setShowXReportPinModal] = useState(false);
  const [xReportPin, setXReportPin] = useState("");
  const [xReportPinError, setXReportPinError] = useState("");

  const [showZClosePinModal, setShowZClosePinModal] = useState(false);
  const [zClosePin, setZClosePin] = useState("");
  const [zClosePinError, setZClosePinError] = useState("");

  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [closeConfirmData, setCloseConfirmData] = useState<any>(null);

  const isPosMode = location.pathname.startsWith("/pos");

  const loadCashStatus = async () => {
    setLoading(true);
    try {
      if (!navigator.onLine) throw new Error("Offline");

      const regRes = await api.get(
        `/cash/registers/?branch_id=${currentBranch.id}`,
      );
      const fetchedRegisters = regRes.data.results || regRes.data;
      setRegisters(fetchedRegisters);
      localStorage.setItem(
        "pos_registers_cache",
        JSON.stringify(fetchedRegisters),
      );

      if (fetchedRegisters.length > 0) {
        setSelectedRegisterId((prev) =>
          prev ? prev : fetchedRegisters[0].id.toString(),
        );
      }

      let shiftData = null;
      try {
        const res = await api.get("/cash/shifts/current/");
        shiftData = res.data;
      } catch (err: any) {
        if (err.response?.status !== 404) throw err;
      }

      setIsOfflineMode(false);

      if (shiftData) {
        const previousShiftId = localStorage.getItem("pos_shift_id");
        if (previousShiftId && previousShiftId !== shiftData.id.toString()) {
          localStorage.removeItem("pos_cash_movements_cache");
        }
        setShift((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(shiftData)) return prev;
          return shiftData;
        });
        localStorage.setItem("pos_shift_open", "true");
        localStorage.setItem("pos_shift_id", shiftData.id.toString());
        localStorage.setItem("pos_shift_data", JSON.stringify(shiftData));

        const activeReg =
          fetchedRegisters.find(
            (r: any) =>
              r.id === shiftData.cash_register ||
              r.name === shiftData.register_name,
          ) || fetchedRegisters[0];

        if (activeReg) {
          const bSerie = activeReg.boleta_series || "B001";
          const fSerie = activeReg.factura_series || "F001";
          const nvSerie = activeReg.nota_series || "NV01";
          const tkSerie = activeReg.ticket_series || "TK01";

          localStorage.setItem("pos_boleta_serie", bSerie);
          localStorage.setItem("pos_factura_serie", fSerie);
          localStorage.setItem("pos_nota_serie", nvSerie);
          localStorage.setItem("pos_ticket_serie", tkSerie);

          const localNumB = parseInt(
            localStorage.getItem(`contador_${bSerie}`) || "0",
          );
          const dbNumB = activeReg.next_boleta_number || 1;
          localStorage.setItem(
            `contador_${bSerie}`,
            Math.max(localNumB, dbNumB).toString(),
          );

          const localNumF = parseInt(
            localStorage.getItem(`contador_${fSerie}`) || "0",
          );
          const dbNumF = activeReg.next_factura_number || 1;
          localStorage.setItem(
            `contador_${fSerie}`,
            Math.max(localNumF, dbNumF).toString(),
          );

          const localNumNV = parseInt(
            localStorage.getItem(`contador_${nvSerie}`) || "0",
          );
          const dbNumNV = activeReg.next_nota_number || 1;
          localStorage.setItem(
            `contador_${nvSerie}`,
            Math.max(localNumNV, dbNumNV).toString(),
          );

          const localNumTK = parseInt(
            localStorage.getItem(`contador_${tkSerie}`) || "0",
          );
          const dbNumTK = activeReg.next_ticket_number || 1;
          localStorage.setItem(
            `contador_${tkSerie}`,
            Math.max(localNumTK, dbNumTK).toString(),
          );
        }

        const movRes = await api.get(
          `/cash/movements/?shift=${shiftData.id}&page_size=1000`,
        );
        const serverMovements = movRes.data.results || movRes.data;

        const pendingMovementsRaw = await db.pending_movements.toArray();
        const pendingMovementsFormatted = pendingMovementsRaw.map((m: any) => ({
          id: m.uuid,
          amount: m.amount,
          movement_type: m.movement_type,
          concept: m.concept,
          description: m.description + " (Pendiente Sync)",
          created_at: m.created_at,
        }));

        const combinedMovements = [
          ...pendingMovementsFormatted,
          ...serverMovements,
        ];
        setMovements((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(combinedMovements))
            return prev;
          return combinedMovements;
        });

        localStorage.setItem(
          "pos_cash_movements_cache",
          JSON.stringify(combinedMovements),
        );
      } else {
        setShift(null);
        localStorage.removeItem("pos_shift_open");
        localStorage.removeItem("pos_shift_id");
        localStorage.removeItem("pos_shift_data");
        localStorage.removeItem("pos_cash_movements_cache");
      }
    } catch (error) {
      await loadCashFromCache(isBackground);
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

      const selectedReg = registers.find(
        (r) => r.id === parseInt(selectedRegisterId),
      );

      if (selectedReg) {
        const bSerie = selectedReg.boleta_series || "B001";
        const fSerie = selectedReg.factura_series || "F001";
        const nvSerie = selectedReg.nota_series || "NV01";
        const tkSerie = selectedReg.ticket_series || "TK01";

        localStorage.setItem("pos_boleta_serie", bSerie);
        localStorage.setItem("pos_factura_serie", fSerie);
        localStorage.setItem("pos_nota_serie", nvSerie);
        localStorage.setItem("pos_ticket_serie", tkSerie);

        const localNumB = parseInt(
          localStorage.getItem(`contador_${bSerie}`) || "0",
        );
        const dbNumB = selectedReg.next_boleta_number || 1;
        localStorage.setItem(
          `contador_${bSerie}`,
          Math.max(localNumB, dbNumB).toString(),
        );

        const localNumF = parseInt(
          localStorage.getItem(`contador_${fSerie}`) || "0",
        );
        const dbNumF = selectedReg.next_factura_number || 1;
        localStorage.setItem(
          `contador_${fSerie}`,
          Math.max(localNumF, dbNumF).toString(),
        );

        const localNumNV = parseInt(
          localStorage.getItem(`contador_${nvSerie}`) || "0",
        );
        const dbNumNV = selectedReg.next_nota_number || 1;
        localStorage.setItem(
          `contador_${nvSerie}`,
          Math.max(localNumNV, dbNumNV).toString(),
        );

        const localNumTK = parseInt(
          localStorage.getItem(`contador_${tkSerie}`) || "0",
        );
        const dbNumTK = selectedReg.next_ticket_number || 1;
        localStorage.setItem(
          `contador_${tkSerie}`,
          Math.max(localNumTK, dbNumTK).toString(),
        );
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

  const handlePrintXRequest = () => {
    if (!shift) return;
    if (isManager) executePrintX();
    else {
      setXReportPin("");
      setXReportPinError("");
      setShowXReportPinModal(true);
    }
  };

  const handleVerifyXReportPin = async () => {
    if (xReportPin.length < 4) return;
    const allUsers = await db.users.toArray();
    const userFound = allUsers.find(
      (u) =>
        String(u.pin) === String(xReportPin) &&
        (u.role === "ADMIN" || u.role === "MANAGER"),
    );

    if (userFound) {
      setShowXReportPinModal(false);
      setXReportPin("");
      executePrintX();
    } else {
      setXReportPinError("❌ PIN de administrador incorrecto o sin permisos.");
      setXReportPin("");
    }
  };

  const handleRequestPreClose = () => {
    if (!shift) return;
    if (isOfflineMode)
      return showTempError(
        "❌ No puedes realizar el Cierre Z sin conexión a internet.",
      );

    if (isManager) {
      executePreCloseCalculation();
    } else {
      setZClosePin("");
      setZClosePinError("");
      setShowZClosePinModal(true);
    }
  };

  const handleVerifyZClosePin = async () => {
    if (zClosePin.length < 4) return;
    const allUsers = await db.users.toArray();
    const userFound = allUsers.find(
      (u) =>
        String(u.pin) === String(zClosePin) &&
        (u.role === "ADMIN" || u.role === "MANAGER"),
    );

    if (userFound) {
      setShowZClosePinModal(false);
      setZClosePin("");
      executePreCloseCalculation();
    } else {
      setZClosePinError("❌ PIN de administrador incorrecto o sin permisos.");
      setZClosePin("");
    }
  };

  const executePreCloseCalculation = () => {
    if (!shift) return;

    const baseAmount = parseFloat(shift.initial_balance) || 0;
    const netExpectedCash = shift.expected_cash - baseAmount;

    const dCash = parseFloat(declaredCash) || 0;
    const dCard = parseFloat(declaredCard) || 0;
    const dTransfer = parseFloat(declaredTransfer) || 0;
    const dPagoLink = parseFloat(declaredPagoLink) || 0;
    const totalDeclaredNet = dCash + dCard + dTransfer + dPagoLink;

    const diffCash = dCash - shift.expected_cash;
    const diffCard = dCard - shift.expected_card;
    const diffTransfer = dTransfer - shift.expected_transfer;
    const diffPagoLink = dPagoLink - (shift.expected_pago_link || 0);

    const isPerfect =
      Math.abs(diffCash) < 0.1 &&
      Math.abs(diffCard) < 0.1 &&
      Math.abs(diffTransfer) < 0.1 &&
      Math.abs(diffPagoLink) < 0.1;

    setCloseConfirmData({
      dCash,
      dCard,
      dTransfer,
      dPagoLink,
      totalDeclared: totalDeclaredNet,
      isPerfect,
      expectedCash: netExpectedCash,
      expectedCard: shift.expected_card,
      expectedTransfer: shift.expected_transfer,
      expectedPagoLink: shift.expected_pago_link || 0,
    });
    setShowCloseConfirmModal(true);
  };

  const printShiftReport = async (
    type: "X" | "Z",
    finalRealNet: number = 0,
  ) => {
    if (!shift) return;

    const baseAmount = parseFloat(shift.initial_balance) || 0;
    const netExpectedCash = shift.expected_cash - baseAmount;
    const dCash = parseFloat(declaredCash) || 0;
    const dPagoLink = parseFloat(declaredPagoLink) || 0;

    const reportData = {
      type: "Z_REPORT",
      status: type === "X" ? "OPEN" : "CLOSED",
      shiftId: shift.id,
      registerName: shift.register_name || "Caja Local",
      cashierName:
        (user as any)?.first_name || (user as any)?.username || "Cajero",
      openedAt: new Date(shift.opened_at).toLocaleString("es-PE"),
      closedAt: type === "Z" ? new Date().toLocaleString("es-PE") : null,

      initialFund: baseAmount,
      expectedCash: netExpectedCash,
      expectedCard: shift.expected_card,
      expectedTransfer: shift.expected_transfer,
      expectedPagoLink: shift.expected_pago_link || 0,

      declaredCash: type === "Z" ? dCash : netExpectedCash,
      declaredCard:
        type === "Z" ? parseFloat(declaredCard) || 0 : shift.expected_card,
      declaredTransfer:
        type === "Z"
          ? parseFloat(declaredTransfer) || 0
          : shift.expected_transfer,
      declaredPagoLink:
        type === "Z" ? dPagoLink : shift.expected_pago_link || 0,
      declaredTotal:
        type === "Z"
          ? finalRealNet
          : netExpectedCash +
            shift.expected_card +
            shift.expected_transfer +
            (shift.expected_pago_link || 0),

      branch: currentBranch
        ? {
            name: currentBranch.name,
            address: currentBranch.address,
            phone: currentBranch.phone,
          }
        : null,
    };

    const isElectron =
      /electron/i.test(navigator.userAgent) || !!(window as any).electronAPI;

    if (isAndroid) {
      try {
        const isConnected = await BluetoothPrinter.isDeviceConnected();
        if (!isConnected) {
          showTempError(
            "Impresora Bluetooth no conectada. Ve a Ajustes de Impresión.",
          );
          return;
        }
        showTempSuccess("Enviando reporte a la impresora...");
        await BluetoothPrinter.printPosReportESC(reportData);
        showTempSuccess("Reporte impreso correctamente.");
      } catch (error) {
        showTempError("Falló la impresión Bluetooth.");
      }
    } else if (isElectron) {
      if (window.electronAPI) {
        window.electronAPI.printReport(reportData as any);
        showTempSuccess("Reporte enviado a la impresora local.");
      }
    } else {
      if (isOfflineMode) {
        return showTempError(
          "Para imprimir reportes sin internet debes usar la aplicación de escritorio o iMin.",
        );
      }
      try {
        showTempSuccess("Generando PDF...");
        const endpoint =
          type === "X"
            ? `/cash/shifts/${shift.id}/report_x/`
            : `/cash/shifts/${shift.id}/report_z/`;
        const response = await api.get(endpoint, { responseType: "blob" });
        const pdfUrl = window.URL.createObjectURL(
          new Blob([response.data], { type: "application/pdf" }),
        );
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        };
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(pdfUrl);
        }, 60000);
      } catch (error) {
        showTempError(
          "⚠️ Error al descargar el PDF. Revisa si el servidor lo soporta.",
        );
      }
    }
  };

  const executePrintX = async () => {
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
      setDeclaredPagoLink("");

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

  // 🌟 VISTA SPLIT-SCREEN: APERTURA DE TURNO (Caja Cerrada) 🌟
  if (!shift && !localStorage.getItem("pos_shift_open")) {
    return (
      <div className="h-screen w-full bg-slate-900 flex flex-col md:flex-row overflow-hidden selection:bg-transparent font-sans relative">
        <div className="absolute top-4 left-4 md:top-6 md:left-6 z-50">
          <button
            onClick={() => logout()}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 backdrop-blur-md active:scale-95 border border-white/10"
          >
            <LogOut size={16} /> Cerrar Sesión
          </button>
        </div>

        <div className="w-full md:w-5/12 lg:w-1/3 flex flex-col items-center md:items-start justify-center p-6 md:p-12 relative shrink-0">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 -left-20 w-72 h-72 bg-blue-600 rounded-full mix-blend-screen filter blur-[100px] opacity-30"></div>
            <div className="absolute bottom-1/4 -right-10 w-56 h-56 bg-cyan-500 rounded-full mix-blend-screen filter blur-[80px] opacity-20"></div>
          </div>

          <div className="z-10 text-center md:text-left w-full mt-10 md:mt-0">
            <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mb-6 mx-auto md:mx-0 backdrop-blur-sm border border-blue-500/30">
              <Lock size={32} />
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none mb-3">
              Caja <br className="hidden md:block" />
              <span className="text-blue-500">Cerrada</span>
            </h1>
            <p className="text-slate-400 font-medium text-sm md:text-base mb-4 md:mb-0 max-w-xs mx-auto md:mx-0">
              Apertura tu terminal para comenzar a registrar ventas.
            </p>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 rounded-t-[40px] md:rounded-none md:rounded-l-[40px] flex flex-col items-center justify-center p-4 md:p-6 shadow-[-10px_0_30px_rgba(0,0,0,0.3)] relative z-10">
          <div className="w-full max-w-[360px] bg-white rounded-3xl shadow-xl p-6 md:p-8 relative border border-slate-200">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 to-cyan-400"></div>

            {generalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-xl font-bold text-center animate-in zoom-in duration-200">
                {generalError}
              </div>
            )}

            {registers.length === 0 ? (
              <div className="bg-red-50 text-red-600 p-5 rounded-2xl text-sm font-bold border border-red-200 text-center">
                <AlertTriangle className="mx-auto mb-2" size={32} />
                No hay cajas configuradas en {currentBranch?.name}.<br />
                <span className="font-medium mt-1 block opacity-80">
                  Contacta al administrador.
                </span>
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">
                    Terminal a usar
                  </label>
                  <select
                    className="w-full p-3.5 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 transition-all bg-slate-50 hover:bg-slate-100 cursor-pointer appearance-none"
                    value={selectedRegisterId}
                    onChange={(e) => setSelectedRegisterId(e.target.value)}
                    disabled={isOfflineMode}
                  >
                    {registers.map((r) => (
                      <option key={r.id} value={r.id}>
                        📍 {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-8">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">
                    Fondo Inicial (S/)
                  </label>
                  <input
                    type="number"
                    className="w-full p-4 border-2 border-slate-100 rounded-xl text-3xl font-black text-center text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all bg-white"
                    placeholder="0.00"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(e.target.value)}
                    autoFocus
                    disabled={isOfflineMode}
                  />
                </div>

                <button
                  onClick={handleOpenShift}
                  disabled={isOfflineMode}
                  className={`w-full font-bold py-4 rounded-xl shadow-lg transform transition-all flex items-center justify-center gap-2 ${
                    isOfflineMode
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : `bg-blue-600 text-white active:scale-95 active:bg-blue-700 ${hoverBtnBlue}`
                  }`}
                >
                  <Lock
                    size={18}
                    className={isOfflineMode ? "opacity-50" : "hidden"}
                  />
                  {isOfflineMode ? "SIN CONEXIÓN" : "ABRIR CAJA AHORA"}
                </button>

                {isManager && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <button
                      onClick={() => navigate("/pos/monitor")}
                      className={`w-full py-3.5 border-2 border-slate-800 text-slate-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 active:bg-slate-800 active:text-white ${hoverManagerBtn}`}
                    >
                      <TrendingUp size={18} /> MODO SUPERVISOR
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 🌟 VISTA ESTÁNDAR: CAJA ABIERTA (Dashboard de 3 columnas) 🌟
  return (
    <div className="h-screen flex flex-col bg-slate-100 relative font-sans overflow-hidden">
      {isOfflineMode && (
        <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-xs font-bold py-1 flex justify-center items-center gap-2 z-50">
          <WifiOff size={14} /> Trabajando sin conexión. Movimientos se
          guardarán localmente.
        </div>
      )}

      {/* ALERTAS VISUALES */}
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {generalError && (
          <div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl font-bold flex items-center gap-2 animate-in slide-in-from-top-4 fade-in">
            <AlertTriangle size={18} /> {generalError}
          </div>
        )}
        {generalSuccess && (
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl font-bold flex items-center gap-2 animate-in slide-in-from-top-4 fade-in">
            <CheckCircle size={18} /> {generalSuccess}
          </div>
        )}
      </div>

      {isPosMode && <PosHeader />}

      <div
        className={`flex-1 overflow-y-auto p-4 md:p-6 w-full ${
          !isPosMode ? "max-w-6xl mx-auto" : ""
        } ${isOfflineMode && !isPosMode ? "mt-6" : ""} custom-scrollbar`}
      >
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black flex items-center gap-2 text-slate-800">
            <Banknote className="text-green-600" />
            {shift?.register_name
              ? `MI CAJA: ${shift.register_name}`
              : "GESTIÓN DE CAJA"}
          </h1>
          {isPosMode && (
            <button
              onClick={() => navigate("/pos")}
              className={`bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-md active:scale-95 active:bg-black ${hoverBtnDark}`}
            >
              <ArrowRightLeft size={18} /> VOLVER A VENDER
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
          {/* COLUMNA 1: Saldo y Movimientos Rápidos */}
          <div className="space-y-6 flex flex-col">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-700">Saldo Teórico</h3>
                <button
                  onClick={handleToggleBalance}
                  className={`bg-transparent p-2 rounded-lg text-slate-400 transition-all active:scale-95 active:text-blue-600 outline-none ${hoverTextBlue}`}
                >
                  {showSystemBalance ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <div className="text-center py-5 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">
                  Total Sistema
                </p>
                <p
                  className={`text-3xl font-black transition-opacity duration-200 ${
                    showSystemBalance
                      ? "text-slate-800 opacity-100"
                      : "text-slate-400 opacity-50 select-none tracking-widest"
                  }`}
                >
                  {showSystemBalance
                    ? `S/ ${(shift?.current_balance || 0).toFixed(2)}`
                    : "S/ ••••••"}
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

          {/* COLUMNA 2: Declaración de Cierre */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 opacity-95 flex flex-col">
            <h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2">
              <AlertTriangle className="text-orange-500" size={20} /> Arqueo y
              Cierre
            </h3>
            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1">
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-1">
                  <Banknote size={14} /> Efectivo Real (Caja)
                </label>
                <input
                  type="number"
                  className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 focus:border-green-400 outline-none transition-all focus:bg-white"
                  placeholder="0.00"
                  value={declaredCash}
                  onChange={(e) => setDeclaredCash(e.target.value)}
                  disabled={isOfflineMode}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-1">
                  <CreditCard size={14} /> Visa / Yape / POS
                </label>
                <input
                  type="number"
                  className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 focus:border-blue-400 outline-none transition-all focus:bg-white"
                  placeholder="0.00"
                  value={declaredCard}
                  onChange={(e) => setDeclaredCard(e.target.value)}
                  disabled={isOfflineMode}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-1">
                  <ArrowRightLeft size={14} /> Transf. Directas
                </label>
                <input
                  type="number"
                  className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 focus:border-purple-400 outline-none transition-all focus:bg-white"
                  placeholder="0.00"
                  value={declaredTransfer}
                  onChange={(e) => setDeclaredTransfer(e.target.value)}
                  disabled={isOfflineMode}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-1">
                  <Link size={14} /> Pago Link
                </label>
                <input
                  type="number"
                  className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 focus:border-indigo-400 outline-none transition-all focus:bg-white"
                  placeholder="0.00"
                  value={declaredPagoLink}
                  onChange={(e) => setDeclaredPagoLink(e.target.value)}
                  disabled={isOfflineMode}
                />
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-3">
              <button
                onClick={handlePrintXRequest}
                className={`w-full font-bold py-3.5 rounded-xl border-2 transition-all flex items-center justify-center gap-2 bg-white text-slate-700 border-slate-200 active:scale-[0.98] active:bg-slate-100 ${hoverBtnSlate}`}
              >
                <Printer size={18} /> IMPRIMIR PRE-CIERRE (X)
              </button>
              <button
                onClick={handleRequestPreClose}
                disabled={isOfflineMode}
                className={`w-full font-bold py-3.5 rounded-xl shadow-xl transform transition-all flex items-center justify-center gap-2 ${
                  isOfflineMode
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : `bg-slate-900 text-white active:scale-[0.98] active:bg-black ${hoverBtnDark}`
                }`}
              >
                <Lock size={18} /> VALIDAR Y CERRAR (Z)
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

      {/* 🔥 MODALES 🔥 */}

      {/* Modal 1: PIN Movimientos */}
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
            {authPinError && (
              <p className="text-red-500 text-[11px] font-bold text-center mt-2 animate-bounce bg-red-50 p-2 rounded-lg">
                {authPinError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal 2: PIN Saldo Sistema */}
      {showBalancePinModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-[360px] relative animate-in zoom-in-95 duration-200 border border-slate-200">
            <button
              onClick={() => {
                setShowBalancePinModal(false);
                setBalancePinError("");
              }}
              className={`absolute top-4 right-4 text-slate-400 active:text-red-500 active:bg-red-50 p-1.5 rounded-full transition-colors ${hoverCloseBtn}`}
            >
              <X size={24} />
            </button>
            <PinPad
              pin={balancePin}
              setPin={(val) => {
                setBalancePin(val);
                setBalancePinError("");
              }}
              onSubmit={handleVerifyBalancePin}
              maxLength={6}
              title="Verificar Identidad"
              subtitle="Ingresa tu PIN para revelar el saldo."
            />
            {balancePinError && (
              <p className="text-red-500 text-[11px] font-bold text-center mt-2 animate-bounce bg-red-50 p-2 rounded-lg">
                {balancePinError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal 3: PIN Reporte X */}
      {showXReportPinModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-[360px] relative animate-in zoom-in-95 duration-200 border border-slate-200">
            <button
              onClick={() => {
                setShowXReportPinModal(false);
                setXReportPinError("");
              }}
              className={`absolute top-4 right-4 text-slate-400 active:text-red-500 active:bg-red-50 p-1.5 rounded-full transition-colors ${hoverCloseBtn}`}
            >
              <X size={24} />
            </button>
            <PinPad
              pin={xReportPin}
              setPin={(val) => {
                setXReportPin(val);
                setXReportPinError("");
              }}
              onSubmit={handleVerifyXReportPin}
              maxLength={6}
              title="Autorización Requerida"
              subtitle="PIN de Admin para imprimir Pre-Cierre (X)."
            />
            {xReportPinError && (
              <p className="text-red-500 text-[11px] font-bold text-center mt-2 animate-bounce bg-red-50 p-2 rounded-lg">
                {xReportPinError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal 4: PIN para Cierre Z (Ver descuadre) */}
      {showZClosePinModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-[360px] relative animate-in zoom-in-95 duration-200 border border-slate-200">
            <button
              onClick={() => {
                setShowZClosePinModal(false);
                setZClosePinError("");
              }}
              className={`absolute top-4 right-4 text-slate-400 active:text-red-500 active:bg-red-50 p-1.5 rounded-full transition-colors ${hoverCloseBtn}`}
            >
              <X size={24} />
            </button>
            <PinPad
              pin={zClosePin}
              setPin={(val) => {
                setZClosePin(val);
                setZClosePinError("");
              }}
              onSubmit={handleVerifyZClosePin}
              maxLength={6}
              title="Cierre de Turno (Z)"
              subtitle="Ingresa el PIN de Administrador para ver los descuadres y confirmar."
            />
            {zClosePinError && (
              <p className="text-red-500 text-[11px] font-bold text-center mt-2 animate-bounce bg-red-50 p-2 rounded-lg">
                {zClosePinError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 👇 MODAL 5 (OPTIMIZADO Y RESPONSIVO): Confirmación de Cierre y Ver Descuadre 👇 */}
      {showCloseConfirmModal && closeConfirmData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Cabecera Horizontal Compacta */}
            <div className="flex items-center gap-4 mb-6 shrink-0">
              <div
                className={`w-14 h-14 shrink-0 rounded-full flex items-center justify-center shadow-inner ${
                  closeConfirmData.isPerfect
                    ? "bg-emerald-50 text-emerald-500 border-4 border-emerald-100"
                    : "bg-orange-50 text-orange-500 border-4 border-orange-100"
                }`}
              >
                {closeConfirmData.isPerfect ? (
                  <CheckCircle size={28} />
                ) : (
                  <AlertTriangle size={28} />
                )}
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                  Confirmar Cierre
                </h2>
                <p className="text-xs md:text-sm text-slate-500 font-medium mt-0.5">
                  Revisa los montos antes de finalizar el turno.
                </p>
              </div>
            </div>

            {/* Contenedor principal scrollable (por si la pantalla es muy pequeña) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-2">
              {/* GRILLA DE 2 COLUMNAS PARA MÉTODOS DE PAGO */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* 1. Efectivo */}
                <div className="bg-slate-50/80 border border-slate-200/60 p-3.5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Efectivo
                  </span>
                  <span
                    className={`text-xl md:text-2xl font-black leading-none ${
                      Math.abs(
                        closeConfirmData.dCash - closeConfirmData.expectedCash,
                      ) > 0.1
                        ? "text-red-500"
                        : "text-emerald-600"
                    }`}
                  >
                    S/ {closeConfirmData.dCash.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider mt-2 pt-2 border-t border-slate-200/60">
                    Sis: S/ {closeConfirmData.expectedCash.toFixed(2)}
                  </span>
                </div>

                {/* 2. Visa/POS */}
                <div className="bg-slate-50/80 border border-slate-200/60 p-3.5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Visa/POS
                  </span>
                  <span
                    className={`text-xl md:text-2xl font-black leading-none ${
                      Math.abs(
                        closeConfirmData.dCard - closeConfirmData.expectedCard,
                      ) > 0.1
                        ? "text-red-500"
                        : "text-emerald-600"
                    }`}
                  >
                    S/ {closeConfirmData.dCard.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider mt-2 pt-2 border-t border-slate-200/60">
                    Sis: S/ {closeConfirmData.expectedCard.toFixed(2)}
                  </span>
                </div>

                {/* 3. Transferencia */}
                <div className="bg-slate-50/80 border border-slate-200/60 p-3.5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Transferencia
                  </span>
                  <span
                    className={`text-xl md:text-2xl font-black leading-none ${
                      Math.abs(
                        closeConfirmData.dTransfer -
                          closeConfirmData.expectedTransfer,
                      ) > 0.1
                        ? "text-red-500"
                        : "text-emerald-600"
                    }`}
                  >
                    S/ {closeConfirmData.dTransfer.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider mt-2 pt-2 border-t border-slate-200/60">
                    Sis: S/ {closeConfirmData.expectedTransfer.toFixed(2)}
                  </span>
                </div>

                {/* 4. Pago Link */}
                <div className="bg-slate-50/80 border border-slate-200/60 p-3.5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Pago Link
                  </span>
                  <span
                    className={`text-xl md:text-2xl font-black leading-none ${
                      Math.abs(
                        closeConfirmData.dPagoLink -
                          closeConfirmData.expectedPagoLink,
                      ) > 0.1
                        ? "text-red-500"
                        : "text-emerald-600"
                    }`}
                  >
                    S/ {closeConfirmData.dPagoLink.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider mt-2 pt-2 border-t border-slate-200/60">
                    Sis: S/ {closeConfirmData.expectedPagoLink.toFixed(2)}
                  </span>
                </div>

                {/* 5. TOTAL A LO LARGO */}
                <div className="col-span-2 flex justify-between items-center bg-slate-900 text-white p-4 md:p-5 rounded-2xl shadow-md mt-1">
                  <span className="font-black text-[11px] uppercase tracking-widest opacity-70">
                    Total Declarado
                  </span>
                  <span className="font-black text-2xl md:text-3xl tracking-tight leading-none">
                    S/ {closeConfirmData.totalDeclared.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Mensaje de Cuadre */}
              {closeConfirmData.isPerfect ? (
                <p className="text-center font-bold text-emerald-600 bg-emerald-50 py-2.5 rounded-lg text-sm m-0 border border-emerald-100">
                  ✅ Cuadre Perfecto
                </p>
              ) : (
                <p className="text-center font-bold text-red-500 animate-pulse bg-red-50 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 m-0 border border-red-100">
                  <AlertTriangle size={16} /> Diferencias detectadas
                </p>
              )}
            </div>

            {/* Botones Fijos Abajo */}
            <div className="flex gap-3 pt-4 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowCloseConfirmModal(false)}
                className={`flex-1 py-3.5 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95 active:bg-slate-50 ${hoverBtnSlate}`}
              >
                Revisar
              </button>
              <button
                onClick={submitClose}
                className={`flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-xl transition-all shadow-[0_8px_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2 active:scale-95 active:bg-blue-700 ${hoverBtnBlue}`}
              >
                <Lock size={18} /> Confirmar Cierre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashPage;
