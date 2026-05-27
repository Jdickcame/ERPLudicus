import {
  Ban,
  CloudUpload,
  FileText,
  FileWarning,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";
import { db } from "../../db/database";
import { BluetoothPrinter } from "../../utils/BluetoothPrinter";
import { numeroALetras } from "../../utils/numeroALetras";
import CreditNoteModal from "../sales/components/CreditNoteModal";
import PosHeader from "./components/PosHeader";

// Interfaces básicas
interface SaleDetail {
  id: number;
  product_name: string;
  quantity: number;
  price: string;
  subtotal: string;
}

interface Sale {
  id: number;
  series: string;
  number: string;
  total: string;
  date: string;
  status: string;
  invoice_type_code: string;
  client_name?: string;
  notes?: string;
  sunat_status?: string;
  details: SaleDetail[];
  credit_notes?: any[];
}

const PosHistory = () => {
  const { currentBranch } = useBranch();

  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const selectedSaleIdRef = useRef<string | number | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const [isPrinting, setIsPrinting] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);

  const isAndroid = Capacitor.getPlatform() === "android";

  const hoverBtnOrange = !isAndroid ? "hover:bg-orange-200" : "";
  const hoverSaleCard = !isAndroid
    ? "hover:bg-slate-50 hover:border-slate-200"
    : "";
  const hoverBtnBlue = !isAndroid ? "hover:bg-blue-200" : "";
  const hoverBtnBlack = !isAndroid ? "hover:bg-black" : "";
  const hoverBtnRedLight = !isAndroid ? "hover:bg-red-100" : "";
  const hoverBtnOrangeLight = !isAndroid ? "hover:bg-orange-100" : "";
  const hoverRowSlate = !isAndroid ? "hover:bg-slate-50" : "";

  const [notification, setNotification] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  const showMessage = (type: "error" | "success", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    selectedSaleIdRef.current = selectedSale?.id || null;
  }, [selectedSale]);

  const fetchSales = async (isSilent = false) => {
    if (!currentBranch) return;
    setLoading(true);
    try {
      const shiftRes = await api.get("/cash/shifts/current/");
      const currentShift = shiftRes.data;
      const shiftOpenDate = new Date(currentShift.opened_at);

      const response = await api.get(
        `/sales/sales/?branch_id=${currentBranch.id}&ordering=-date`,
      );
      let results = response.data.results || response.data;

      // Filtrar solo las ventas de este turno
      results = results.filter((sale: Sale) => {
        const saleDate = new Date(sale.date);
        return saleDate >= shiftOpenDate;
      });

      setSales(results);

      if (selectedSaleIdRef.current) {
        const found = uniqueSales.find(
          (s) => s.id === selectedSaleIdRef.current,
        );
        if (found) {
          setSelectedSale(found);
        } else if (uniqueSales.length > 0 && !isSilent) {
          setSelectedSale(uniqueSales[0]);
        }
      } else if (uniqueSales.length > 0 && !isSilent) {
        setSelectedSale(uniqueSales[0]);
      }
    } catch (error) {
      setIsOfflineMode(true);
      const localSalesRaw = await db.sales
        .filter((s) => s.sync_status !== "SYNCED")
        .toArray();
      const pendingSalesFormatted: Sale[] = await Promise.all(
        localSalesRaw.map(async (s: any) => {
          const customer = s.payload.customer
            ? await db.customers.get(s.payload.customer)
            : null;
          const details = await Promise.all(
            s.payload.details.map(async (d: any, idx: number) => {
              const prod = await db.products.get(d.product);
              return {
                id: idx,
                product_name: prod ? prod.name : "Producto",
                quantity: d.quantity,
                price: d.price,
                subtotal: (d.quantity * parseFloat(d.price)).toFixed(2),
              };
            }),
          );
          const [series, number] = s.local_invoice_number
            ? s.local_invoice_number.split("-")
            : ["L", s.uuid.substring(0, 6)];
          return {
            id: s.uuid,
            series,
            number,
            total: s.total.toString(),
            date: s.date,
            status: "PENDING",
            invoice_type_code: s.payload.invoice_type_code,
            client_name: customer ? customer.name : "PÚBLICO GENERAL",
            sunat_status: "OFFLINE",
            details,
            discount_amount: s.payload.discount_amount || 0,
            discount_reason: s.payload.discount_reason || "",
          };
        }),
      );

      const cachedSales = JSON.parse(
        localStorage.getItem("pos_sales_cache") || "[]",
      );
      const combinedSales = [...pendingSalesFormatted, ...cachedSales];

      const uniqueMap = new Map();
      combinedSales.forEach((sale) => uniqueMap.set(sale.id, sale));
      const uniqueSales = Array.from(uniqueMap.values());
      uniqueSales.sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      setSales(uniqueSales);

      if (selectedSaleIdRef.current) {
        const found = uniqueSales.find(
          (s) => s.id === selectedSaleIdRef.current,
        );
        if (found) setSelectedSale(found);
      } else if (uniqueSales.length > 0 && !isSilent) {
        setSelectedSale(uniqueSales[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    await fetchSales(false);
    setIsManualRefreshing(false);
    showMessage("success", "Lista actualizada.");
  };

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    await fetchSales(false);
    setIsManualRefreshing(false);
    showMessage("success", "Lista actualizada.");
  };

  useEffect(() => {
    fetchSales();
    const interval = setInterval(() => fetchSales(true), 15000);
    return () => clearInterval(interval);
  }, [currentBranch]);

  const handlePrint = async (saleId: number | string) => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      const saleToPrint = sales.find((s) => s.id === saleId);
      if (!saleToPrint) throw new Error("Venta no encontrada en la memoria.");

      let customerName = saleToPrint.client_name || "PÚBLICO GENERAL";
      let customerDoc = "-";
      let address = "-";
      let items: any[] = [];
      let paymentStr = "EFECTIVO";
      let invoiceNumber = `${saleToPrint.series}-${String(
        saleToPrint.number || "",
      ).padStart(8, "0")}`;
      let typeCode = saleToPrint.invoice_type_code || "03";
      let totalValue = Number(saleToPrint.total);
      let dateStr = new Date(saleToPrint.date).toLocaleString("es-PE");

      if (typeof saleId === "string") {
        const localSale = await db.sales.get(saleId);
        if (localSale) {
          if (localSale.payload.customer) {
            const c = await db.customers.get(localSale.payload.customer);
            if (c) {
              customerName = c.name;
              customerDoc = c.tax_id;
              address = c.address || "-";
            }
          }
          if (customerDoc === "-" && localSale.payload.customer_document) {
            customerDoc = localSale.payload.customer_document;
          }
          const rawMethod =
            localSale.payload.payments?.[0]?.method ||
            localSale.payload.payments?.[0]?.payment_method ||
            "CASH";
          paymentStr =
            rawMethod === "CARD"
              ? "VISA/YAPE"
              : rawMethod === "TRANSFER"
              ? "TRANSFERENCIA"
              : rawMethod === "PAGO_LINK"
              ? "PAGO LINK"
              : "EFECTIVO";
          invoiceNumber = localSale.local_invoice_number;
        }
      } else {
        const serverSale = saleToPrint as any;
        customerDoc =
          serverSale.customer_document || serverSale.client_doc || "-";

        if (
          customerDoc === "-" &&
          serverSale.customer &&
          typeof serverSale.customer === "object"
        ) {
          customerDoc =
            serverSale.customer.tax_id || serverSale.customer.document || "-";
          address = serverSale.customer.address || "-";
        }

        if (serverSale.payments && serverSale.payments.length > 0) {
          const rawMethod =
            serverSale.payments[0].payment_method ||
            serverSale.payments[0].method ||
            "CASH";
          paymentStr =
            rawMethod === "CARD"
              ? "VISA/YAPE"
              : rawMethod === "TRANSFER"
              ? "TRANSFERENCIA"
              : rawMethod === "PAGO_LINK"
              ? "PAGO LINK"
              : "EFECTIVO";
        }
      }

      items = saleToPrint.details.map((d: any) => ({
        qty: d.quantity,
        name: d.product_name || "Producto",
        price: Number(d.price),
        subtotal: Number(d.subtotal) || d.quantity * Number(d.price),
      }));

      const subtotalBrutoCarrito = items.reduce(
        (acc, item) => acc + item.subtotal,
        0,
      );
      const descuentoGlobalAImprimir = Number(saleToPrint.discount_amount || 0);

      const ticketData = {
        isCourtesy: typeCode === "99",
        invoiceTypeCode: typeCode,
        invoiceNumber: invoiceNumber,
        invoiceTypeLabel:
          typeCode === "01"
            ? "FACTURA ELECTRÓNICA"
            : typeCode === "03"
            ? "BOLETA DE VENTA ELECTRÓNICA"
            : "NOTA DE VENTA",
        date: dateStr,
        customer: customerName.substring(0, 35),
        customerDoc: customerDoc,
        address: address.substring(0, 35),
        paymentTypeStr: paymentStr,
        items: items,
        subtotalBruto: subtotalBrutoCarrito,
        descuentoGlobal: descuentoGlobalAImprimir,
        opGravada: totalValue / 1.18,
        igv: totalValue - totalValue / 1.18,
        total: totalValue,
        realValue: totalValue,
        amountInWords: `${totalValue.toFixed(2)} SOLES`,
        payments: [{ method: paymentStr, amount: totalValue }],
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
        const isConnected = await BluetoothPrinter.isDeviceConnected();
        if (!isConnected) {
          showMessage(
            "error",
            "⚠️ Impresora Bluetooth no conectada. Ve a Ajustes.",
          );
          setIsPrinting(false);
          return;
        }
        showMessage("success", "Enviando ticket a la impresora...");
        await BluetoothPrinter.printTicketESC(ticketData);
      } else if (isElectron) {
        if (window.electronAPI) {
          window.electronAPI.printLocalTicket(ticketData);
          showMessage("success", "Imprimiendo en PC...");
        }
      } else {
        // 👇 AQUI ESTÁ LA MAGIA PARA LA WEB 👇
        if (typeof saleId === "string") {
          showMessage(
            "error",
            "⚠️ Esta venta es local. Sincroniza con la nube primero para poder descargar el PDF.",
          );
          setIsPrinting(false);
          return;
        }

        showMessage("success", "Obteniendo PDF del servidor...");
        // Usamos el mismo endpoint de impresión con papel ticket_80 por defecto
        const response = await api.get(
          `/sales/sales/${saleId}/print/?papel=ticket_80`,
          {
            responseType: "blob",
          },
        );

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
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error: any) {
      console.error("Error al preparar ticket:", error);
      showMessage("error", `❌ Error al imprimir: ${error.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintCreditNote = async (noteId: number) => {
    try {
      const response = await api.get(`/sales/credit-notes/${noteId}/print/`, {
        responseType: "blob",
      });
      const pdfBlob = new Blob([response.data], { type: "application/pdf" });
      const pdfUrl = window.URL.createObjectURL(pdfBlob);

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
      alert("Error al intentar imprimir la nota de crédito.");
    }
  };

  // 🔥 4. Enviar a SUNAT (INDIVIDUAL)
  const handleSendToSunat = async (saleId: number) => {
    setIsSyncing(true);
    try {
      await api.post(`/sales/sales/${saleId}/send_sunat/`);
      fetchSales(); // Recargamos para que el badge cambie a verde
    } catch (error: any) {
      console.error(error);
      const errorMsg =
        error.response?.data?.error || "Error de conexión con SUNAT.";
      alert(`❌ No se pudo procesar: ${errorMsg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // 🏛️ REENVÍO MANUAL A SUNAT
  const handleSyncAllPending = async () => {
    if (!navigator.onLine || isOfflineMode) {
      return showMessage(
        "error",
        "❌ No hay internet. Conéctate para sincronizar con SUNAT.",
      );
    }

    const pendingSunat = sales.filter(
      (s) =>
        !["99", "00"].includes(s.invoice_type_code) &&
        s.sunat_status !== "ACCEPTED" &&
        typeof s.id === "number",
    );

    if (pendingSunat.length === 0) {
      return showMessage(
        "success",
        "Todo está sincronizado con SUNAT. No hay pendientes.",
      );
    }

    setIsSyncingAll(true);
    setBulkProgress({ current: 0, total: pendingSunat.length });
    let currentSync = 0;

    try {
      for (const sale of pendingSunat) {
        currentSync++;
        setBulkProgress({ current: currentSync, total: pendingSunat.length });
        try {
          await api.post(`/sales/sales/${sale.id}/send_sunat/`);
        } catch (e) {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      fetchSales(true);
      showMessage("success", "✅ Reenvío a SUNAT completado.");
    } catch (error) {
      showMessage(
        "error",
        "⚠️ Hubo problemas de conexión durante el envío a SUNAT.",
      );
      fetchSales();
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Filtrado rápido
  const filteredSales = sales.filter((s) =>
    `${s.series}-${s.number}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="h-screen flex flex-col bg-slate-100 font-sans overflow-hidden relative">
      {isOfflineMode && (
        <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-xs font-bold py-1 flex justify-center items-center gap-2 z-50">
          <WifiOff size={14} /> Estás trabajando sin conexión a internet.
          Mostrando caché local.
        </div>
      )}

      {notification && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
          <div
            className={`text-white px-6 py-3 rounded-xl shadow-2xl font-bold flex items-center gap-2 animate-in slide-in-from-top-4 fade-in ${
              notification.type === "error" ? "bg-red-600" : "bg-emerald-600"
            }`}
          >
            {notification.type === "error" ? (
              <AlertTriangle size={18} />
            ) : (
              <CheckCircle size={18} />
            )}
            {notification.text}
          </div>
        </div>
      )}

      <PosHeader />

      {isVoidModalOpen && selectedSale && (
        <CreditNoteModal
          open={isVoidModalOpen}
          saleId={selectedSale.id}
          saleSeries={`${selectedSale.series}-${selectedSale.number}`}
          onClose={() => setIsVoidModalOpen(false)}
          onSuccess={() => {
            setIsVoidModalOpen(false);
            fetchSales();
          }}
        />
      )}

      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* PANEL IZQUIERDO: LISTA DE VENTAS */}
        <div className="w-1/3 min-w-[320px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            {/* 👇 NUEVO: Cabecera con botón de Envío Masivo */}
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-black text-slate-700 text-lg flex items-center gap-2">
                <FileText className="text-blue-600" /> Últimas Ventas
              </h2>

              <div className="flex gap-2">
                <button
                  onClick={handleManualRefresh}
                  disabled={isManualRefreshing}
                  className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
                  title="Actualizar lista de ventas"
                >
                  <RefreshCw
                    size={16}
                    className={
                      isManualRefreshing ? "animate-spin text-blue-600" : ""
                    }
                  />
                </button>

                <button
                  onClick={handleSyncAllPending}
                  disabled={isSyncingAll || isOfflineMode}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                    isOfflineMode
                      ? "bg-slate-100 text-slate-400 border-slate-200"
                      : `bg-orange-50 text-orange-600 border-orange-200 active:scale-95 ${hoverBtnOrange}`
                  }`}
                  title="Reenviar a SUNAT"
                >
                  <CloudUpload
                    size={14}
                    className={isSyncingAll ? "animate-bounce" : ""}
                  />
                  {isSyncingAll
                    ? `ENVIANDO... ${bulkProgress.current}/${bulkProgress.total}`
                    : "SYNC SUNAT"}
                </button>
              </div>
            </div>

            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Buscar ticket (ej. B001-123)"
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {loading ? (
              <p className="text-center text-slate-400 mt-10 animate-pulse">
                Cargando tickets...
              </p>
            ) : filteredSales.length === 0 ? (
              <p className="text-center text-slate-400 mt-10">
                No hay ventas recientes.
              </p>
            ) : (
              filteredSales.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className={`w-full text-left p-4 rounded-xl mb-2 transition-all border ${
                    selectedSale?.id === sale.id
                      ? "bg-blue-50 border-blue-200 shadow-sm"
                      : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-800">
                      {sale.series}-{sale.number}
                    </span>
                    <span className="font-black text-blue-600">
                      S/ {parseFloat(sale.total).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs mt-2">
                    <span className="text-slate-500">
                      {new Date(sale.date).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    <div className="flex gap-1.5 items-center">
                      {/* Badge de SUNAT en la lista */}
                      {sale.invoice_type_code !== "99" && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider flex items-center gap-1 ${
                            sale.sunat_status === "ACCEPTED"
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              : "bg-orange-50 text-orange-600 border border-orange-100"
                          }`}
                        >
                          {sale.sunat_status === "ACCEPTED"
                            ? "✔ SUNAT"
                            : "⚠️ PENDIENTE"}
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[9px] ${
                          (sale.credit_notes && sale.credit_notes.length > 0) ||
                          sale.status === "CANCELED"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {(sale.credit_notes && sale.credit_notes.length > 0) ||
                        sale.status === "CANCELED"
                          ? "ANULADO"
                          : "PAGADO"}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* PANEL DERECHO: DETALLE DEL TICKET */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {selectedSale ? (
            <>
              {/* Cabecera del Detalle */}
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-start relative overflow-hidden">
                {/* Etiqueta Gigante de Anulado */}
                {((selectedSale.credit_notes &&
                  selectedSale.credit_notes.length > 0) ||
                  selectedSale.status === "CANCELED") && (
                  <div className="absolute top-4 right-4 border-4 border-red-500 text-red-500 font-black text-2xl uppercase tracking-widest px-4 py-2 rounded-lg transform rotate-12 opacity-40 select-none pointer-events-none z-0">
                    ANULADO
                  </div>
                )}

                <div className="z-10 w-full">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-black text-slate-800">
                      {selectedSale.invoice_type_code === "01"
                        ? "Factura Electrónica"
                        : selectedSale.invoice_type_code === "03"
                          ? "Boleta Electrónica"
                          : "Ticket de Cortesía"}
                    </h2>
                    {selectedSale.sunat_status === "OFFLINE" ? (
                      <span className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest font-black flex items-center gap-1 border bg-slate-100 border-slate-300 text-slate-500">
                        Pendiente Servidor
                      </span>
                    ) : !["99", "00"].includes(
                        selectedSale.invoice_type_code,
                      ) ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest font-black flex items-center gap-1 border ${
                            selectedSale.sunat_status === "ACCEPTED"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-orange-50 border-orange-200 text-orange-700 animate-pulse"
                          }`}
                        >
                          {selectedSale.sunat_status === "ACCEPTED"
                            ? "Aceptado en SUNAT"
                            : "Pendiente en SUNAT"}
                        </span>

                        {/* El botón de reintento circular */}
                        {selectedSale.sunat_status !== "ACCEPTED" && (
                          <button
                            onClick={() => handleSendToSunat(selectedSale.id)}
                            disabled={isSyncing || isOfflineMode}
                            className={`bg-blue-100 text-blue-700 p-1.5 rounded-full transition-colors disabled:opacity-50 active:scale-95 active:bg-blue-300 ${hoverBtnBlue}`}
                            title="Reenviar a SUNAT individualmente"
                          >
                            <RefreshCw
                              size={16}
                              className={isSyncing ? "animate-spin" : ""}
                              strokeWidth={3}
                            />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-lg font-bold text-blue-600 mb-2">
                    {selectedSale.series}-{selectedSale.number}
                  </p>
                  <p className="text-sm text-slate-500">
                    Cliente:{" "}
                    <span className="font-medium text-slate-700">
                      {selectedSale.client_name || "Cliente Genérico"}
                    </span>
                  </p>
                  <p className="text-sm text-slate-500">
                    Fecha:{" "}
                    <span className="font-medium text-slate-700">
                      {new Date(selectedSale.date).toLocaleString()}
                    </span>
                  </p>

                  {selectedSale.notes && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 shadow-sm animate-in fade-in max-w-md">
                      <strong className="font-black flex items-center gap-1">
                        ✍️ Nota del cajero:
                      </strong>
                      <span className="italic mt-1 block">
                        {selectedSale.notes}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Lista de Productos del Ticket */}
              <div className="flex-1 overflow-y-auto p-6">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="text-xs uppercase bg-slate-100 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 rounded-l-lg">Cant.</th>
                      <th className="px-4 py-3">Descripción</th>
                      <th className="px-4 py-3 text-right">P. Unit</th>
                      <th className="px-4 py-3 text-right rounded-r-lg">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.details?.map((detail, index) => (
                      <tr
                        key={index}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-4 font-bold">
                          {detail.quantity}
                        </td>
                        <td className="px-4 py-4 font-medium text-slate-800">
                          {detail.product_name}
                        </td>
                        <td className="px-4 py-4 text-right">
                          S/ {parseFloat(detail.price).toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-slate-800">
                          S/{" "}
                          {(detail.quantity * parseFloat(detail.price)).toFixed(
                            2,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 👇 NUEVO: Pie del Detalle Limpio y Equilibrado */}
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                <div className="flex justify-between items-end mb-6">
                  <div className="text-sm text-slate-500 space-y-1 font-medium">
                    <p>
                      Op. Gravada: S/{" "}
                      {(parseFloat(selectedSale.total) / 1.18).toFixed(2)}
                    </p>
                    <p>
                      IGV (18%): S/{" "}
                      {(
                        parseFloat(selectedSale.total) -
                        parseFloat(selectedSale.total) / 1.18
                      ).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Total Pagado
                    </p>
                    <p className="text-4xl font-black text-slate-800">
                      S/ {parseFloat(selectedSale.total).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => handlePrint(selectedSale.id)}
                    className="flex-1 bg-slate-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Printer size={20} /> IMPRIMIR
                  </button>

                  {selectedSale.credit_notes &&
                  selectedSale.credit_notes.length > 0 ? (
                    <button
                      onClick={() =>
                        handlePrintCreditNote(selectedSale.credit_notes![0].id)
                      }
                      className="flex-1 bg-orange-50 text-orange-600 border-2 border-orange-200 hover:bg-orange-100 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <FileWarning size={20} /> TICKET N. CRÉDITO
                    </button>
                  ) : selectedSale.status !== "CANCELED" &&
                    selectedSale.invoice_type_code !== "99" ? (
                    <button
                      onClick={() => setIsVoidModalOpen(true)}
                      className="flex-1 bg-red-50 text-red-600 border-2 border-red-200 hover:bg-red-100 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Ban size={20} /> ANULAR VENTA
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <div className="bg-slate-100 p-6 rounded-full mb-4">
                <FileText size={48} className="opacity-40" />
              </div>
              <p className="text-lg font-bold text-slate-600">
                Selecciona un ticket
              </p>
              <p className="text-sm mt-1">
                Para ver los detalles, enviar a SUNAT o imprimir.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosHistory;
