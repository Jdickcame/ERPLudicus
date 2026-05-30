import { Capacitor } from "@capacitor/core";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  CloudUpload,
  FileText,
  FileWarning,
  Printer,
  RefreshCw,
  Search,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";
import { db } from "../../db/database";
import { BluetoothPrinter } from "../../utils/BluetoothPrinter";
import { numeroALetras } from "../../utils/numeroALetras";
import CreditNoteModal from "../sales/components/CreditNoteModal";
import PosHeader from "./components/PosHeader";

interface SaleDetail {
  id: number;
  product_name: string;
  quantity: number;
  price: string;
  subtotal: string;
}

interface Sale {
  id: number | string;
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
  discount_amount?: string | number;
  discount_reason?: string;
}

const PosHistory = () => {
  const { currentBranch } = useBranch();

  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const selectedSaleIdRef = useRef<string | number | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

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
    if (!isSilent) setLoading(true);

    try {
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

      if (!navigator.onLine) throw new Error("Offline");

      const response = await api.get(
        `/sales/sales/?branch_id=${currentBranch.id}&origin=pos&ordering=-date&page_size=500`,
      );
      const serverSales = response.data.results || response.data;

      localStorage.setItem("pos_sales_cache", JSON.stringify(serverSales));
      setIsOfflineMode(false);

      const combinedSales = [...pendingSalesFormatted, ...serverSales];
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
      if (!isSilent) setLoading(false);
    }
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
    if (isPrinting) return;
    setIsPrinting(true);

    try {
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

        if (!selectedSale) throw new Error("Venta no seleccionada");

        const creditNote =
          selectedSale.credit_notes?.find((cn: any) => cn.id === noteId) ||
          selectedSale.credit_notes?.[0];

        const items = selectedSale.details.map((d: any) => ({
          qty: d.quantity,
          name: d.product_name || "Producto",
          price: Number(d.price),
          subtotal: Number(d.subtotal) || d.quantity * Number(d.price),
        }));

        const subtotalBrutoCarrito = items.reduce(
          (acc, item) => acc + item.subtotal,
          0,
        );
        const totalValue = Number(selectedSale.total);

        const ticketData = {
          isCourtesy: false,
          invoiceTypeCode:
            selectedSale.invoice_type_code === "00" ? "00" : "07",
          invoiceNumber: creditNote?.series
            ? `${creditNote.series}-${String(creditNote.number).padStart(
                8,
                "0",
              )}`
            : `NC-${noteId}`,
          invoiceTypeLabel:
            selectedSale.invoice_type_code === "01"
              ? "NOTA DE CRÉDITO (FACTURA)"
              : selectedSale.invoice_type_code === "03"
              ? "NOTA DE CRÉDITO (BOLETA)"
              : "DEVOLUCIÓN (NOTA DE VENTA)",
          date: new Date().toLocaleString("es-PE"),
          customer: selectedSale.client_name || "PÚBLICO GENERAL",
          customerDoc: "-",
          address: "-",
          paymentTypeStr: "DEVOLUCIÓN",
          items: items,
          subtotalBruto: subtotalBrutoCarrito,
          descuentoGlobal: Number(selectedSale.discount_amount || 0),
          opGravada: totalValue / 1.18,
          igv: totalValue - totalValue / 1.18,
          total: totalValue,
          realValue: totalValue,
          amountInWords: numeroALetras(totalValue),
          payments: [{ method: "DEVOLUCIÓN", amount: totalValue }],
          branch: currentBranch
            ? {
                name: currentBranch.name,
                address: currentBranch.address,
                phone: currentBranch.phone,
              }
            : null,
        };

        showMessage("success", "🖨️ Imprimiendo Nota de Crédito (Bluetooth)...");
        await BluetoothPrinter.printTicketESC(ticketData);
      } else {
        showMessage("success", "Obteniendo PDF del servidor...");
        const response = await api.get(`/sales/credit-notes/${noteId}/print/`, {
          responseType: "blob",
        });

        if (isElectron && (window as any).electronAPI?.printTicket) {
          await new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(response.data);
            reader.onloadend = () => {
              try {
                const base64data = reader.result as string;
                (window as any).electronAPI.printTicket(base64data);
                showMessage("success", "🖨️ Enviado a la impresora local.");
                resolve();
              } catch (err) {
                reject(err);
              }
            };
            reader.onerror = () => reject(new Error("Fallo al leer el PDF"));
          });
        } else {
          showMessage("success", "Abriendo PDF en el navegador...");
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
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error("Error en Nota de Crédito:", error);
      showMessage(
        "error",
        "❌ Error al generar o imprimir la nota de crédito.",
      );
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSendToSunat = async (saleId: number | string) => {
    if (typeof saleId === "string") {
      return showMessage(
        "error",
        "⚠️ Esta venta es local, sincroniza primero con la nube.",
      );
    }
    setIsSyncing(true);
    try {
      await api.post(`/sales/sales/${saleId}/send_sunat/`);
      showMessage("success", "✅ Enviado a SUNAT correctamente.");
      fetchSales(true);
    } catch (error: any) {
      showMessage(
        "error",
        `❌ Error: ${error.response?.data?.error || "Error SUNAT"}`,
      );
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
      fetchSales(true);
    } finally {
      setIsSyncingAll(false);
    }
  };

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

      {isVoidModalOpen &&
        selectedSale &&
        typeof selectedSale.id === "number" && (
          <CreditNoteModal
            open={isVoidModalOpen}
            saleId={selectedSale.id}
            saleSeries={`${selectedSale.series}-${selectedSale.number}`}
            onClose={() => setIsVoidModalOpen(false)}
            onSuccess={() => {
              setIsVoidModalOpen(false);
              fetchSales(true);
            }}
          />
        )}

      <div
        className={`flex flex-1 overflow-hidden p-4 gap-4 ${
          isOfflineMode ? "mt-4" : ""
        }`}
      >
        <div className="w-1/3 min-w-[320px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
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
                  className={`w-full text-left p-4 rounded-xl mb-2 transition-all border active:bg-slate-100 ${
                    selectedSale?.id === sale.id
                      ? "bg-blue-50 border-blue-200 shadow-sm"
                      : `bg-white border-transparent ${hoverSaleCard}`
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-800">
                      {sale.series}-{String(sale.number || "").padStart(8, "0")}
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
                      {sale.sunat_status === "OFFLINE" ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1">
                          <WifiOff size={10} /> LOCAL
                        </span>
                      ) : !["99", "00"].includes(sale.invoice_type_code) ? (
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
                      ) : null}
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

        <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {selectedSale ? (
            <>
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-start relative overflow-hidden">
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
                        : "Nota de Venta / Ticket"}
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
                    ) : null}
                  </div>
                  <p className="text-lg font-bold text-blue-600 mb-2">
                    {selectedSale.series}-
                    {String(selectedSale.number || "").padStart(8, "0")}
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
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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
                        className={`border-b border-slate-50 last:border-0 transition-colors active:bg-slate-100 ${hoverRowSlate}`}
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
                          S/ {parseFloat(detail.subtotal).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-200">
                <div className="flex justify-between items-end mb-6">
                  <div className="text-sm text-slate-500 space-y-1 font-medium">
                    {Number(selectedSale.discount_amount) > 0 && (
                      <p className="text-purple-600 font-bold mb-2">
                        Dscto. Global: S/{" "}
                        {Number(selectedSale.discount_amount).toFixed(2)}
                        {selectedSale.discount_reason && (
                          <span className="text-xs opacity-70 ml-1">
                            ({selectedSale.discount_reason})
                          </span>
                        )}
                      </p>
                    )}
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
                    disabled={isPrinting}
                    className={`flex-1 font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 border active:scale-95 ${
                      (selectedSale.credit_notes &&
                        selectedSale.credit_notes.length > 0) ||
                      selectedSale.status === "CANCELED"
                        ? "bg-slate-100 text-slate-500 border-slate-200 active:bg-slate-300 shadow-none"
                        : `bg-slate-900 text-white border-transparent active:bg-slate-800 ${hoverBtnBlack}`
                    }`}
                  >
                    {isPrinting ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <Printer size={20} />
                    )}
                    {isPrinting
                      ? "IMPRIMIENDO..."
                      : (selectedSale.credit_notes &&
                          selectedSale.credit_notes.length > 0) ||
                        selectedSale.status === "CANCELED"
                      ? "COPIA ORIGINAL"
                      : "IMPRIMIR TICKET"}
                  </button>

                  {selectedSale.credit_notes &&
                  selectedSale.credit_notes.length > 0 ? (
                    <button
                      onClick={() =>
                        handlePrintCreditNote(selectedSale.credit_notes![0].id)
                      }
                      disabled={isPrinting}
                      className={`flex-1 bg-red-50 text-red-600 border-2 border-red-200 disabled:opacity-70 disabled:cursor-not-allowed font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 active:bg-red-200 ${hoverBtnRedLight}`}
                    >
                      {isPrinting ? (
                        <RefreshCw size={20} className="animate-spin" />
                      ) : (
                        <FileWarning size={20} />
                      )}
                      {isPrinting ? "IMPRIMIENDO..." : "TICKET N. CRÉDITO"}
                    </button>
                  ) : selectedSale.status !== "CANCELED" &&
                    selectedSale.invoice_type_code !== "99" &&
                    (selectedSale.invoice_type_code === "00" ||
                      selectedSale.sunat_status !== "OFFLINE") ? (
                    <button
                      onClick={() => setIsVoidModalOpen(true)}
                      className={`flex-1 bg-orange-50 text-orange-600 border-2 border-orange-200 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 active:bg-orange-200 ${hoverBtnOrangeLight}`}
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
