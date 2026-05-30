import { Capacitor } from "@capacitor/core";
import {
  Clock,
  DollarSign,
  Gift,
  Lock,
  Printer,
  Tag,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../../api/axios";
import PinPad from "../../components/common/PinPad";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";
import { db } from "../../db/database";
import { BluetoothPrinter } from "../../utils/BluetoothPrinter";
import PosHeader from "./components/PosHeader";

interface SaleDetail {
  product?: { name: string };
  product_name?: string;
  quantity: number | string;
  price: string;
}

interface Sale {
  id: number | string;
  series: string;
  number: string;
  total: string;
  date: string;
  status: string;
  invoice_type_code: string;
  is_courtesy?: boolean;
  credit_notes?: any[];
  details?: SaleDetail[];
  authorized_by?: { first_name: string; last_name: string } | string;
  discount_amount?: number | string;
}

const PosReports = () => {
  const { currentBranch } = useBranch();
  const { user } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
  const [courtesies, setCourtesies] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

  const [shiftOpenedAt, setShiftOpenedAt] = useState<string>("");
  const [currentShiftId, setCurrentShiftId] = useState<number | null>(null); // 👈 NUEVO: GUARDAMOS EL ID DEL TURNO

  const isManagerByDefault =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  const [isUnlocked, setIsUnlocked] = useState(isManagerByDefault);
  const [authPin, setAuthPin] = useState("");
  const [pinError, setPinError] = useState("");

  const isAndroid = Capacitor.getPlatform() === "android";

  const hoverPrintBtn = !isAndroid
    ? "hover:text-slate-800 hover:bg-slate-200"
    : "active:bg-slate-200 active:scale-95 transition-all";

  const hoverPrintBtnPurple = !isAndroid
    ? "hover:text-purple-800 hover:bg-purple-200"
    : "active:bg-purple-200 active:scale-95 transition-all";

  const hoverRow = !isAndroid
    ? "hover:bg-slate-50"
    : "active:bg-slate-100 transition-colors";
  const hoverRowPurple = !isAndroid
    ? "hover:bg-purple-50/30"
    : "active:bg-purple-100/50 transition-colors";

  const processSalesData = (
    shiftOpenDateStr: string,
    pendingSales: any[],
    serverSales: any[],
  ) => {
    const shiftOpenDate = new Date(shiftOpenDateStr);
    setShiftOpenedAt(shiftOpenDate.toLocaleString("es-PE", { hour12: false }));

    const combinedSales = [...pendingSales, ...serverSales];
    const uniqueMap = new Map();
    combinedSales.forEach((sale) => uniqueMap.set(sale.id, sale));
    const uniqueSales = Array.from(uniqueMap.values());

    const validSales: Sale[] = [];
    const courtesySales: Sale[] = [];

    uniqueSales.forEach((sale: Sale) => {
      const saleDate = new Date(sale.date);
      const isAnulada =
        sale.status === "CANCELED" ||
        (sale.credit_notes && sale.credit_notes.length > 0);

      if (saleDate >= shiftOpenDate && !isAnulada) {
        if (sale.invoice_type_code === "99" || sale.is_courtesy) {
          courtesySales.push(sale);
        } else {
          validSales.push(sale);
        }
      }
    });

    setSales(validSales);
    setCourtesies(courtesySales);
  };

  const fetchShiftData = async () => {
    if (!currentBranch || !isUnlocked) return;
    setLoading(true);

    try {
      const localSalesRaw = await db.sales
        .filter((s) => s.sync_status !== "SYNCED")
        .toArray();
      const pendingSalesFormatted = await Promise.all(
        localSalesRaw.map(async (s: any) => {
          const details = await Promise.all(
            s.payload.details.map(async (d: any) => {
              const prod = await db.products.get(d.product);
              return {
                product: { name: prod ? prod.name : "Producto Desc." },
                quantity: d.quantity,
                price: d.price,
              };
            }),
          );

          const [series, number] = s.local_invoice_number
            ? s.local_invoice_number.split("-")
            : ["L", s.uuid.substring(0, 6)];
          const isCourtesy =
            s.payload.invoice_type_code === "99" ||
            s.payload.payments?.some(
              (p: any) => p.method === "COURTESY" || p.method === "CORTESÍA",
            );

          return {
            id: s.uuid,
            series,
            number,
            total: s.total.toString(),
            date: s.date,
            status: "PENDING",
            invoice_type_code: s.payload.invoice_type_code,
            is_courtesy: isCourtesy,
            details,
            discount_amount: s.payload.discount_amount || 0,
          };
        }),
      );

      if (!navigator.onLine) throw new Error("Offline");

      const shiftRes = await api.get("/cash/shifts/current/");
      const shiftOpenDateStr = shiftRes.data.opened_at;
      const shiftId = shiftRes.data.id;

      setCurrentShiftId(shiftId); // 👈 GUARDAMOS EN ESTADO PARA EL BOTÓN DE IMPRIMIR

      const response = await api.get(
        `/sales/sales/?origin=pos&shift_id=${shiftId}&branch_id=${currentBranch.id}&ordering=-date&page_size=1000`,
      );
      const serverSales = response.data.results || response.data;

      localStorage.setItem("pos_shift_open_date", shiftOpenDateStr);
      localStorage.setItem("pos_shift_id", shiftId.toString()); // Backup por si acaso
      localStorage.setItem("pos_sales_cache", JSON.stringify(serverSales));
      setIsOfflineMode(false);

      processSalesData(shiftOpenDateStr, pendingSalesFormatted, serverSales);
    } catch (error) {
      console.warn("Cargando reportes en modo offline...");
      setIsOfflineMode(true);

      const shiftOpenDateStr =
        localStorage.getItem("pos_shift_open_date") || new Date().toISOString();
      const savedShiftId = localStorage.getItem("pos_shift_id");
      if (savedShiftId) setCurrentShiftId(parseInt(savedShiftId));

      const serverSales = JSON.parse(
        localStorage.getItem("pos_sales_cache") || "[]",
      );

      const localSalesRaw = await db.sales
        .filter((s) => s.sync_status !== "SYNCED")
        .toArray();
      const pendingSalesFormatted = await Promise.all(
        localSalesRaw.map(async (s: any) => {
          const details = await Promise.all(
            s.payload.details.map(async (d: any) => {
              const prod = await db.products.get(d.product);
              return {
                product: { name: prod ? prod.name : "Producto Desc." },
                quantity: d.quantity,
                price: d.price,
              };
            }),
          );
          const [series, number] = s.local_invoice_number
            ? s.local_invoice_number.split("-")
            : ["L", s.uuid.substring(0, 6)];
          const isCourtesy =
            s.payload.invoice_type_code === "99" ||
            s.payload.payments?.some(
              (p: any) => p.method === "COURTESY" || p.method === "CORTESÍA",
            );

          return {
            id: s.uuid,
            series,
            number,
            total: s.total.toString(),
            date: s.date,
            status: "PENDING",
            invoice_type_code: s.payload.invoice_type_code,
            is_courtesy: isCourtesy,
            details,
            discount_amount: s.payload.discount_amount || 0,
          };
        }),
      );

      processSalesData(shiftOpenDateStr, pendingSalesFormatted, serverSales);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShiftData();
    const interval = setInterval(fetchShiftData, 15000);
    return () => clearInterval(interval);
  }, [currentBranch, isUnlocked]);

  const handleUnlockWithPin = async () => {
    if (authPin.length < 4) return setPinError("El PIN es muy corto.");
    setPinError("");
    setLoading(true);

    try {
      const allUsers = await db.users.toArray();
      const userFound = allUsers.find(
        (u) =>
          String(u.pin) === String(authPin) &&
          (u.role === "ADMIN" || u.role === "MANAGER"),
      );

      if (userFound) {
        setIsUnlocked(true);
        setAuthPin("");
      } else {
        setPinError("❌ PIN incorrecto o sin permisos de gerencia.");
        setAuthPin("");
      }
    } catch (error) {
      setPinError("❌ Error validando el PIN localmente.");
      setAuthPin("");
    } finally {
      setLoading(false);
    }
  };

  const totalGross = sales.reduce(
    (acc, sale) => acc + parseFloat(sale.total),
    0,
  );
  const totalNet = totalGross / 1.18;
  const totalTaxes = totalGross - totalNet;
  const totalDiscounts = sales.reduce(
    (acc, sale) => acc + Number(sale.discount_amount || 0),
    0,
  );

  const totalCourtesyCost = courtesies.reduce((acc, sale) => {
    if (parseFloat(sale.total) > 0) return acc + parseFloat(sale.total);
    const itemsTotal =
      sale.details?.reduce(
        (sum, item) => sum + parseFloat(item.price) * Number(item.quantity),
        0,
      ) || 0;
    return acc + itemsTotal;
  }, 0);

  const salesByHour = sales.reduce((acc: any, sale) => {
    const hour = new Date(sale.date).getHours();
    const hourStr = hour.toString().padStart(2, "0");
    const timeLabel = `${hourStr}:00 - ${hourStr}:59`;
    const gross = parseFloat(sale.total);
    const net = gross / 1.18;

    if (!acc[timeLabel])
      acc[timeLabel] = { count: 0, totalGross: 0, totalNet: 0 };
    acc[timeLabel].count += 1;
    acc[timeLabel].totalGross += gross;
    acc[timeLabel].totalNet += net;
    return acc;
  }, {});

  const hourlyData = Object.entries(salesByHour)
    .map(([time, data]: any) => ({ time, ...data }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const allTransactions = [...sales, ...courtesies];
  const productMix = allTransactions.reduce((acc: any, sale: any) => {
    if (sale.details && Array.isArray(sale.details)) {
      sale.details.forEach((detail: any) => {
        const productName =
          detail.product?.name || detail.product_name || "Producto Desconocido";
        const qty = parseFloat(detail.quantity as string);
        if (!acc[productName]) acc[productName] = { qty: 0 };
        acc[productName].qty += qty;
      });
    }
    return acc;
  }, {});

  const pmixData = Object.entries(productMix)
    .map(([name, data]: any) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty);

  const handlePrintReport = async (
    reportType: "HOURLY" | "PMIX" | "COURTESIES",
    endpointBaseUrl: string,
  ) => {
    let reportData: any = {
      type: reportType,
      openedAt: shiftOpenedAt,
      branch: currentBranch
        ? {
            name: currentBranch.name,
            address: currentBranch.address,
            phone: currentBranch.phone,
          }
        : null,
    };

    if (reportType === "HOURLY") {
      reportData.hours = hourlyData.map((d: any) => ({
        timeLabel: d.time,
        count: d.count,
        net: d.totalNet,
        gross: d.totalGross,
      }));
      reportData.totalTickets = sales.length;
      reportData.totalGross = totalGross;
    } else if (reportType === "PMIX") {
      reportData.items = pmixData.map((d: any) => ({
        name: d.name,
        qty: d.qty,
      }));
    } else if (reportType === "COURTESIES") {
      const courtesiesPmix: any = {};
      courtesies.forEach((sale) => {
        sale.details?.forEach((d) => {
          const name =
            d.product?.name || d.product_name || "Producto Desconocido";
          courtesiesPmix[name] =
            (courtesiesPmix[name] || 0) + Number(d.quantity);
        });
      });
      reportData.items = Object.entries(courtesiesPmix)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a: any, b: any) => b.qty - a.qty);
      reportData.totalCost = totalCourtesyCost;
    }

    const isElectron =
      /electron/i.test(navigator.userAgent) || !!(window as any).electronAPI;

    if (isAndroid) {
      try {
        const isConnected = await BluetoothPrinter.isDeviceConnected();
        if (!isConnected) {
          toast.error(
            "Impresora Bluetooth no conectada. Ve a Ajustes de Impresión.",
          );
          return;
        }

        toast.success("Enviando reporte a la impresora...");
        await BluetoothPrinter.printPosReportESC(reportData);
        toast.success("Reporte impreso correctamente.");
      } catch (error) {
        console.error("Error imprimiendo por Bluetooth:", error);
        toast.error("Falló la impresión Bluetooth.");
      }
    } else if (isElectron) {
      try {
        if ((window as any).electronAPI) {
          (window as any).electronAPI.printReport(reportData);
          toast.success("Reporte enviado a impresora local.");
        }
      } catch (error) {
        toast.error("Ocurrió un error al enviar la impresión local.");
      }
    } else {
      if (isOfflineMode) {
        return alert(
          "Para imprimir reportes sin internet debes usar la aplicación de escritorio o la tablet iMin.",
        );
      }
      try {
        toast.loading("Generando PDF...");

        // 👇 SOLUCIÓN: LE PASAMOS EL ID DEL TURNO A LA URL DEL PDF 👇
        let finalPdfUrl = endpointBaseUrl;
        if (currentShiftId) {
          finalPdfUrl += `?shift_id=${currentShiftId}`;
        }

        const response = await api.get(finalPdfUrl, { responseType: "blob" });
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
          toast.dismiss();
        };
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(pdfUrl);
        }, 60000);
      } catch (error) {
        toast.dismiss();
        toast.error("Error al descargar el reporte del servidor.");
      }
    }
  };

  if (!isUnlocked) {
    return (
      <div className="h-screen flex flex-col bg-slate-100 font-sans">
        <PosHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-red-500" />
            </div>
            {pinError && (
              <div className="mb-4 p-2 bg-red-100 text-red-600 text-xs font-bold rounded-lg animate-pulse">
                {pinError}
              </div>
            )}
            <PinPad
              pin={authPin}
              setPin={(val) => {
                setAuthPin(val);
                setPinError("");
              }}
              onSubmit={handleUnlockWithPin}
              maxLength={6}
              title="Reportes Bloqueados"
              subtitle="Solo un Administrador puede ver las métricas de caja. Ingresa el PIN."
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden font-sans relative">
      {isOfflineMode && (
        <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-xs font-bold py-1 flex justify-center items-center gap-2 z-50">
          <WifiOff size={14} /> Estás trabajando sin conexión a internet.
          Mostrando cálculos locales.
        </div>
      )}

      <PosHeader />

      <div
        className={`flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6 custom-scrollbar ${
          isOfflineMode ? "mt-4" : ""
        }`}
      >
        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse font-medium">
            Calculando métricas...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <DollarSign size={16} className="text-green-600" /> Venta
                  Cobrada
                </div>
                <div className="text-2xl font-black text-slate-800 truncate">
                  S/ {totalGross.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Ingreso real a caja
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <TrendingUp size={16} className="text-blue-600" /> Venta Neta
                </div>
                <div className="text-2xl font-black text-slate-800 truncate">
                  S/ {totalNet.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  IGV: S/ {totalTaxes.toFixed(2)}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Clock size={16} className="text-orange-600" /> Transacciones
                </div>
                <div className="text-2xl font-black text-slate-800">
                  {sales.length}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Boletas y Facturas
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-pink-200 bg-pink-50/30">
                <div className="flex items-center gap-2 text-pink-700 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Tag size={16} className="text-pink-600" /> Dsctos Dados
                </div>
                <div className="text-2xl font-black text-pink-800 truncate">
                  S/ {totalDiscounts.toFixed(2)}
                </div>
                <div className="text-[10px] text-pink-500 mt-1">
                  Dinero descontado
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-200 bg-purple-50/30">
                <div className="flex items-center gap-2 text-purple-700 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Gift size={16} className="text-purple-600" /> Val. Cortesías
                </div>
                <div className="text-2xl font-black text-purple-800 truncate">
                  S/ {totalCourtesyCost.toFixed(2)}
                </div>
                <div className="text-[10px] text-purple-500 mt-1">
                  {courtesies.length} consumos
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">
                    Desglose por Hora
                  </h3>
                  <button
                    onClick={() =>
                      handlePrintReport("HOURLY", "/sales/reports/hourly/print")
                    }
                    className={`p-1.5 text-slate-400 rounded-lg bg-transparent ${hoverPrintBtn}`}
                  >
                    <Printer size={18} />
                  </button>
                </div>
                <div className="p-0 overflow-x-auto max-h-[300px] custom-scrollbar">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 shadow-sm">
                      <tr>
                        <th className="p-4 font-bold">Rango de Hora</th>
                        <th className="p-4 font-bold text-center">Tickets</th>
                        <th className="p-4 font-bold text-right">Cobrado</th>
                        <th className="p-4 font-bold text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {hourlyData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-8 text-center text-slate-400"
                          >
                            Sin transacciones aún.
                          </td>
                        </tr>
                      ) : (
                        hourlyData.map((data: any, index) => (
                          <tr key={index} className={hoverRow}>
                            <td className="p-4 font-bold text-slate-700 flex items-center gap-2 whitespace-nowrap">
                              <Clock size={14} className="text-slate-400" />{" "}
                              {data.time}
                            </td>
                            <td className="p-4 text-center font-medium">
                              <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-600 text-xs">
                                {data.count}
                              </span>
                            </td>
                            <td className="p-4 text-right font-bold text-blue-600 whitespace-nowrap">
                              S/ {data.totalGross.toFixed(2)}
                            </td>
                            <td className="p-4 text-right font-bold text-emerald-600 whitespace-nowrap">
                              S/ {data.totalNet.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-700">
                    Mix de Productos (PMIX)
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-white px-2 py-1 rounded border border-slate-200">
                      Top Ventas
                    </span>
                    <button
                      onClick={() =>
                        handlePrintReport("PMIX", "/sales/reports/pmix/print")
                      }
                      className={`p-1.5 text-slate-400 rounded-lg bg-transparent ${hoverPrintBtn}`}
                    >
                      <Printer size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-0 overflow-x-auto max-h-[300px] custom-scrollbar">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 shadow-sm">
                      <tr>
                        <th className="p-4 font-bold">Producto</th>
                        <th className="p-4 font-bold text-right">
                          Cant. Saliente
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pmixData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={2}
                            className="p-8 text-center text-slate-400"
                          >
                            No hay productos registrados.
                          </td>
                        </tr>
                      ) : (
                        pmixData.map((item: any, index: number) => (
                          <tr key={index} className={hoverRow}>
                            <td className="p-4 font-bold text-slate-700">
                              {item.name}
                            </td>
                            <td className="p-4 text-right font-medium">
                              <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold">
                                {item.qty}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-purple-200 overflow-hidden mb-8">
              <div className="p-4 border-b border-purple-100 bg-purple-50 flex justify-between items-center">
                <h3 className="font-bold text-purple-800 flex items-center gap-2">
                  <Gift size={18} /> Detalle de Cortesías y Consumos
                </h3>
                <button
                  onClick={() =>
                    handlePrintReport(
                      "COURTESIES",
                      "/sales/reports/courtesies/print",
                    )
                  }
                  className={`p-1.5 text-purple-500 rounded-lg bg-transparent ${hoverPrintBtnPurple}`}
                >
                  <Printer size={18} />
                </button>
              </div>
              <div className="p-0 overflow-x-auto max-h-[300px] custom-scrollbar">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-white text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 shadow-sm">
                    <tr>
                      <th className="p-4 font-bold">Ticket</th>
                      <th className="p-4 font-bold">Hora</th>
                      <th className="p-4 font-bold">Productos Entregados</th>
                      <th className="p-4 font-bold text-right">
                        Valor Asumido
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {courtesies.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-8 text-center text-slate-400"
                        >
                          No se registraron cortesías.
                        </td>
                      </tr>
                    ) : (
                      courtesies.map((sale, index) => {
                        const itemsCost =
                          sale.details?.reduce(
                            (sum, item) =>
                              sum +
                              parseFloat(item.price) * Number(item.quantity),
                            0,
                          ) || 0;
                        const itemsList = sale.details
                          ?.map(
                            (d) =>
                              `${d.quantity}x ${
                                d.product?.name || d.product_name
                              }`,
                          )
                          .join(", ");
                        return (
                          <tr key={index} className={hoverRowPurple}>
                            <td className="p-4 font-bold text-slate-700 whitespace-nowrap">
                              {sale.series}-{sale.number}
                            </td>
                            <td className="p-4 text-slate-500 whitespace-nowrap">
                              {new Date(sale.date).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="p-4 text-slate-500 text-xs italic">
                              {itemsList || "Sin detalles"}
                            </td>
                            <td className="p-4 text-right font-black text-purple-700 whitespace-nowrap">
                              S/ {itemsCost.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PosReports;
