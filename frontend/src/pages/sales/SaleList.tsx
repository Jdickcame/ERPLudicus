import {
  AlertCircle,
  Ban,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  CloudUpload,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Monitor,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Smartphone,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import Pagination from "../../components/common/Pagination";
import { useBranch } from "../../context/BranchContext";
import CreditNoteModal from "./components/CreditNoteModal";

// --- INTERFACES ---
interface Payment {
  payment_method: string;
  amount: string;
}

interface CreditNote {
  id: number;
  series: string;
  number: string;
  sunat_pdf_url?: string;
  sunat_status?: string;
  sunat_description?: string;
}

interface Sale {
  id: number;
  client_name: string;
  client_doc?: string;
  total: string;
  date: string;
  document_type: string;
  series: string;
  number: string;
  sunat_pdf_url?: string;
  invoice_type_code?: string;
  sunat_status?: string;
  sunat_description?: string;
  payments: Payment[];
  credit_notes: CreditNote[];
}

interface CashRegister {
  id: number;
  name: string;
  boleta_series: string;
  factura_series: string;
}

const SaleList = () => {
  const { currentBranch } = useBranch();
  const [sales, setSales] = useState<Sale[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [saleToAnul, setSaleToAnul] = useState<{
    id: number;
    series: string;
  } | null>(null);

  const [resendingId, setResendingId] = useState<number | null>(null);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const navigate = useNavigate();

  const todayDate = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(todayDate.getDate() - 30);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const defaultFilters = {
    search: "",
    startDate: formatDate(thirtyDaysAgo),
    endDate: formatDate(todayDate),
    docType: "",
    paymentMethod: "",
    sunatStatus: "",
    cashRegister: "",
  };

  const [filters, setFilters] = useState(defaultFilters);
  const [totalAmount, setTotalAmount] = useState<number>(0);

  useEffect(() => {
    if (currentBranch?.id) {
      api
        .get(`/cash/registers/?branch_id=${currentBranch.id}`)
        .then((res) => {
          setCashRegisters(res.data.results || res.data);
        })
        .catch((err) => console.error("Error cargando cajas:", err));
    }
  }, [currentBranch?.id]);

  const fetchSales = useCallback(
    (overrideFilters?: any, isSilent: boolean = false) => {
      if (!isSilent) setLoading(true);

      const params = new URLSearchParams();
      params.append("origin", "web");
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());

      if (currentBranch?.id)
        params.append("branch_id", currentBranch.id.toString());

      const activeFilters = overrideFilters || filters;

      if (activeFilters.search) params.append("search", activeFilters.search);
      if (activeFilters.startDate)
        params.append("start_date", activeFilters.startDate);
      if (activeFilters.endDate)
        params.append("end_date", activeFilters.endDate);
      if (activeFilters.docType)
        params.append("document_type", activeFilters.docType);
      if (activeFilters.paymentMethod)
        params.append("payment_method", activeFilters.paymentMethod);
      if (activeFilters.sunatStatus)
        params.append("sunat_status", activeFilters.sunatStatus);
      if (activeFilters.cashRegister)
        params.append("cash_register_id", activeFilters.cashRegister);

      api
        .get(`/sales/sales/?${params.toString()}`)
        .then((res) => {
          const data = Array.isArray(res.data) ? res.data : res.data.results;
          setSales(data);
          setTotalCount(res.data.count || data.length || 0);
          setTotalAmount(res.data.total_amount || 0);
        })
        .catch((err) => console.error("Error fetching sales:", err))
        .finally(() => {
          if (!isSilent) setLoading(false);
        });
    },
    [currentBranch?.id, filters, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranch?.id]);

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    fetchSales(defaultFilters);
  };

  const resendToSunat = async (saleId: number) => {
    setResendingId(saleId);
    try {
      const response = await api.post(
        `/sales/sales/${saleId}/send_sunat/?origin=web`,
      );
      if (response.data.success) {
        fetchSales(undefined, true);
      } else {
        alert(`❌ Error: ${response.data.error}`);
        fetchSales(undefined, true);
      }
    } catch (error: any) {
      alert(`❌ Error de conexión: ${error.message}`);
    } finally {
      setResendingId(null);
    }
  };

  const handleBulkResend = async () => {
    const pendingSales = sales.filter(
      (s) =>
        (s.series.startsWith("B") || s.series.startsWith("F")) &&
        (!s.sunat_status ||
          s.sunat_status === "PENDING" ||
          s.sunat_status === "REJECTED"),
    );

    if (pendingSales.length === 0) {
      alert("No hay comprobantes pendientes para enviar en esta página.");
      return;
    }

    if (
      !window.confirm(
        `Se enviarán ${pendingSales.length} comprobantes a SUNAT. ¿Iniciar?`,
      )
    )
      return;

    setIsBulkSyncing(true);
    setBulkProgress({ current: 0, total: pendingSales.length });

    for (let i = 0; i < pendingSales.length; i++) {
      const sale = pendingSales[i];
      setBulkProgress({ current: i + 1, total: pendingSales.length });
      setResendingId(sale.id);

      try {
        await api.post(`/sales/sales/${sale.id}/send_sunat/?origin=web`);
        fetchSales(undefined, true);
      } catch (error) {
        console.error(`Error al enviar ${sale.series}-${sale.number}`, error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    setResendingId(null);
    setIsBulkSyncing(false);
    alert("Proceso de envío finalizado.");
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const params: any = {};
      params.origin = "web";

      if (currentBranch?.id) params.branch_id = currentBranch.id;
      if (filters.search) params.search = filters.search;
      if (filters.startDate) params.start_date = filters.startDate;
      if (filters.endDate) params.end_date = filters.endDate;
      if (filters.docType) params.document_type = filters.docType;
      if (filters.paymentMethod) params.payment_method = filters.paymentMethod;
      if (filters.sunatStatus) params.sunat_status = filters.sunatStatus;
      if (filters.cashRegister) params.cash_register_id = filters.cashRegister;
      params.nocache = new Date().getTime();

      const response = await api.get(`/sales/sales/export_excel/`, {
        params,
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Ventas_${filters.startDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert("Error al descargar Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  // 👇 RECUPERADO: Lógica original para ver PDF de Venta 👇
  const viewTicket = async (saleId: number, format: "a4" | "ticket" = "a4") => {
    try {
      const response = await api.get(
        `/sales/sales/${saleId}/print/?papel=${format}`,
        {
          responseType: "blob",
        },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      window.open(url, "_blank");
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert("❌ Error cargando ticket de venta");
    }
  };

  // 👇 RECUPERADO: Lógica original para ver PDF de Nota de Crédito 👇
  const viewCreditNote = async (
    noteId: number,
    format: "a4" | "ticket" = "a4",
  ) => {
    try {
      const response = await api.get(
        `/sales/credit-notes/${noteId}/print/?papel=${format}`,
        {
          responseType: "blob",
        },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      window.open(url, "_blank");
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert("❌ Error generando PDF de Nota de Crédito");
    }
  };

  const renderPaymentBadge = (method: string) => {
    switch (method) {
      case "CASH":
        return (
          <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">
            <Banknote size={12} /> EFECTIVO
          </span>
        );
      case "CARD":
        return (
          <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">
            <CreditCard size={12} /> TARJETA
          </span>
        );
      case "YAPE":
        return (
          <span className="flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">
            <Smartphone size={12} /> YAPE/PLIN
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
            {method}
          </span>
        );
    }
  };

  const renderSunatBadge = (status?: string, description?: string) => {
    if (status === "ACCEPTED")
      return (
        <span
          title={description}
          className="flex w-max items-center gap-1 bg-emerald-50 text-emerald-600 px-2 py-1 rounded text-[11px] font-semibold border border-emerald-200"
        >
          <CheckCircle2 size={12} /> ACEPTADO
        </span>
      );
    if (status === "REJECTED")
      return (
        <span
          title={description}
          className="flex w-max items-center gap-1 bg-red-50 text-red-600 px-2 py-1 rounded text-[11px] font-semibold border border-red-200"
        >
          <AlertCircle size={12} /> RECHAZADO
        </span>
      );
    if (status === "PENDING" || !status)
      return (
        <span
          title={description}
          className="flex w-max items-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded text-[11px] font-semibold border border-amber-200"
        >
          <Clock size={12} /> PENDIENTE
        </span>
      );
    return null;
  };

  // LÓGICA MAESTRA: APLANAMIENTO DE FILAS PARA LA TABLA
  const tableRows = useMemo(() => {
    const rows: any[] = [];

    sales.forEach((sale) => {
      const hasNC = sale.credit_notes && sale.credit_notes.length > 0;

      // Si el contador filtró específicamente por Nota de Crédito ("NC")
      if (filters.docType === "NC") {
        sale.credit_notes.forEach((nc) => {
          rows.push({ ...nc, isNC: true, parentSale: sale });
        });
      } else {
        // En cualquier otro caso, primero metemos la Venta original...
        rows.push({ ...sale, isNC: false, hasNC });

        // ...Y justo debajo, como una fila nueva, metemos la Nota de Crédito (si tiene)
        if (hasNC) {
          sale.credit_notes.forEach((nc) => {
            rows.push({ ...nc, isNC: true, parentSale: sale });
          });
        }
      }
    });

    return rows;
  }, [sales, filters.docType]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 whitespace-nowrap">
              Historial de Ventas
            </h1>
            <BranchSelector />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Transacciones en{" "}
            <strong>{currentBranch?.name || "Todas las sedes"}</strong>
          </p>
        </div>

        <div className="flex flex-row items-center justify-start lg:justify-end gap-3 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          <div className="shrink-0 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600 hidden sm:block">
              <Banknote size={20} />
            </div>
            <div className="whitespace-nowrap">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider leading-none mb-1">
                Total Filtrado
              </p>
              <p className="text-xl font-black text-emerald-700 leading-none">
                S/ {parseFloat(totalAmount.toString()).toFixed(2)}
              </p>
            </div>
          </div>

          <button
            onClick={handleBulkResend}
            disabled={isBulkSyncing || sales.length === 0}
            className={`shrink-0 h-11 px-3 flex items-center justify-center gap-2 rounded-xl border transition font-bold text-sm shadow-sm ${
              isBulkSyncing
                ? "bg-amber-50 text-amber-600 border-amber-200 cursor-wait"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-amber-600 active:scale-95"
            }`}
            title="Enviar pendientes a SUNAT"
          >
            <CloudUpload
              size={18}
              className={isBulkSyncing ? "animate-bounce" : ""}
            />
            <span className="hidden sm:inline">
              {isBulkSyncing
                ? `${bulkProgress.current}/${bulkProgress.total}`
                : "Sync"}
            </span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting || sales.length === 0}
            className="shrink-0 h-11 px-3 flex items-center justify-center gap-2 rounded-xl border bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-green-600 transition font-bold text-sm shadow-sm"
            title="Exportar a Excel"
          >
            {isExporting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={() => navigate("/sales/new")}
            className="shrink-0 h-11 px-4 flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition font-medium text-sm shadow-sm"
            title="Nueva Venta"
          >
            <Plus size={18} />
            <span className="hidden md:inline">Nueva Venta</span>
          </button>
        </div>
      </div>

      {/* PANEL DE FILTROS */}
      <div className="bg-white p-4 lg:p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Buscar Doc/Cliente
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                placeholder="DNI, Nombre, Serie (F001-23 o BC11-100)..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Punto de Caja
            </label>
            <div className="relative">
              <Monitor
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                name="cashRegister"
                value={filters.cashRegister}
                onChange={handleFilterChange}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700 appearance-none"
              >
                <option value="">Todas las cajas</option>
                {cashRegisters.map((caja) => (
                  <option key={caja.id} value={caja.id}>
                    {caja.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Método de Pago
            </label>
            <select
              name="paymentMethod"
              value={filters.paymentMethod}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
            >
              <option value="">Todos los pagos</option>
              <option value="CASH">Efectivo</option>
              <option value="CARD">Visa/ Yape/ Plin</option>
              <option value="PAGO_LINK">Pago Link</option>
              <option value="TRANSFER">Transferencia</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Desde
            </label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Hasta
            </label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Comprobante
            </label>
            <select
              name="docType"
              value={filters.docType}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
            >
              <option value="">Todos</option>
              <option value="BOL">Boleta</option>
              <option value="FAC">Factura</option>
              <option value="NC">Nota de Crédito</option>
              <option value="NTV">Nota de Venta</option>
              <option value="TICKET">Ticket interno</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Estado SUNAT
            </label>
            <select
              name="sunatStatus"
              value={filters.sunatStatus}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
            >
              <option value="">Todos</option>
              <option value="ACCEPTED">Aceptados</option>
              <option value="PENDING">Pendientes</option>
              <option value="REJECTED">Rechazados</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-100">
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            <X size={16} /> Limpiar
          </button>
          <button
            onClick={() => fetchSales()}
            className="flex items-center gap-1.5 px-6 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition shadow-sm"
          >
            <Search size={16} /> Buscar
          </button>
        </div>
      </div>

      {/* TABLA DE RESULTADOS MÁGICA */}
      <div className="bg-white rounded-xl shadow border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b font-semibold uppercase text-xs text-slate-700">
            <tr>
              <th className="p-4 whitespace-nowrap"># Doc</th>
              <th className="p-4 whitespace-nowrap">Estado SUNAT</th>
              <th className="p-4 whitespace-nowrap">Fecha</th>
              <th className="p-4 whitespace-nowrap">Cliente</th>
              <th className="p-4 whitespace-nowrap">Pago</th>
              <th className="p-4 whitespace-nowrap">Total</th>
              <th className="p-4 text-right whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin text-blue-500 h-6 w-6" />
                    Buscando transacciones...
                  </div>
                </td>
              </tr>
            ) : tableRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400">
                  <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-lg font-medium text-slate-500">
                    No hay documentos registrados
                  </p>
                  <p className="text-sm">
                    Prueba ajustando los filtros de búsqueda.
                  </p>
                </td>
              </tr>
            ) : (
              tableRows.map((row) => {
                // LÓGICA SI LA FILA ES UNA NOTA DE CRÉDITO
                if (row.isNC) {
                  return (
                    <tr
                      key={`nc-${row.id}`}
                      className="bg-orange-50/30 hover:bg-orange-50/50 transition border-l-4 border-l-orange-400"
                    >
                      <td className="p-4 font-mono text-slate-500">
                        <span className="font-bold px-1.5 py-0.5 rounded text-[10px] mr-2 bg-orange-100 text-orange-700">
                          NCR
                        </span>
                        <span className="font-bold text-orange-800">
                          {row.series}-{row.number}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Ref: {row.parentSale.series}-{row.parentSale.number}
                        </div>
                      </td>

                      <td className="p-4">
                        {renderSunatBadge(
                          row.sunat_status,
                          row.sunat_description,
                        )}
                      </td>

                      <td className="p-4 text-slate-500">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="opacity-50" />
                          <div>
                            {new Date(row.parentSale.date).toLocaleDateString()}
                          </div>
                        </div>
                      </td>

                      <td className="p-4 text-slate-500">
                        <div className="font-medium">
                          {row.parentSale.client_name || "Cliente General"}
                        </div>
                        {row.parentSale.client_doc &&
                          row.parentSale.client_doc !== "00000000" && (
                            <div className="text-[11px] mt-0.5">
                              {row.parentSale.client_doc}
                            </div>
                          )}
                      </td>

                      <td className="p-4">
                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                          DEVOLUCIÓN
                        </span>
                      </td>

                      <td className="p-4 font-bold text-orange-600">
                        S/ -{parseFloat(row.parentSale.total).toFixed(2)}
                      </td>

                      {/* 👇 AQUÍ RECUPERAMOS EL BOTÓN QUE PIDE EL PDF AL BACKEND 👇 */}
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => viewCreditNote(row.id, "ticket")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-white text-orange-600 border-orange-200 hover:bg-orange-50 transition"
                            title="Ver Ticket de Nota de Crédito (80mm)"
                          >
                            <Printer size={16} /> TK
                          </button>
                          <button
                            onClick={() => viewCreditNote(row.id, "a4")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-white text-orange-600 border-orange-200 hover:bg-orange-50 transition"
                            title="Ver PDF A4 de Nota de Crédito"
                          >
                            <FileText size={16} /> A4
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // LÓGICA SI LA FILA ES UNA VENTA ORIGINAL (BOL/FAC/TICKET)
                const isSunatDocument =
                  row.series.startsWith("B") || row.series.startsWith("F");
                const canResend =
                  isSunatDocument &&
                  (!row.sunat_status ||
                    row.sunat_status === "PENDING" ||
                    row.sunat_status === "REJECTED");

                return (
                  <tr
                    key={`sale-${row.id}`}
                    className={`hover:bg-slate-50 transition group ${
                      row.hasNC ? "opacity-70" : ""
                    }`}
                  >
                    <td className="p-4 font-mono text-slate-500">
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded text-[10px] mr-2 ${
                          row.series.startsWith("F")
                            ? "bg-purple-100 text-purple-700"
                            : row.series.startsWith("B")
                            ? "bg-blue-100 text-blue-700"
                            : row.series.startsWith("N") ||
                              row.series.startsWith("NV")
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {row.series.startsWith("F")
                          ? "FAC"
                          : row.series.startsWith("B")
                          ? "BOL"
                          : row.series.startsWith("N") ||
                            row.series.startsWith("NV")
                          ? "NTV"
                          : "TCK"}
                      </span>
                      <span className={row.hasNC ? "line-through" : ""}>
                        {row.series}-{row.number}
                      </span>
                      {row.hasNC && (
                        <div className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1">
                          <Ban size={10} /> ANULADO
                        </div>
                      )}
                    </td>

                    <td className="p-4">
                      {isSunatDocument ? (
                        <div className="flex flex-col gap-1 items-start">
                          {renderSunatBadge(
                            row.sunat_status,
                            row.sunat_description,
                          )}
                          {canResend && !row.hasNC && (
                            <button
                              onClick={() => resendToSunat(row.id)}
                              disabled={resendingId === row.id}
                              className={`flex items-center gap-1 mt-1 text-[10px] font-medium px-2 py-1 rounded transition-colors ${
                                resendingId === row.id
                                  ? "bg-slate-100 text-slate-400 cursor-wait"
                                  : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-blue-600"
                              }`}
                            >
                              <RefreshCw
                                size={10}
                                className={
                                  resendingId === row.id ? "animate-spin" : ""
                                }
                              />
                              {resendingId === row.id
                                ? "ENVIANDO..."
                                : "REENVIAR"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          No aplica
                        </span>
                      )}
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <div>
                          <div>{new Date(row.date).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(row.date).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-medium text-slate-800">
                        {row.client_name || "Cliente General"}
                      </div>
                      {row.client_doc && row.client_doc !== "00000000" && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {row.client_doc.length === 11 ? "RUC: " : "DNI: "}{" "}
                          {row.client_doc}
                        </div>
                      )}
                    </td>

                    <td className="p-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        {row.payments?.length > 1 && (
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            MIXTO:
                          </span>
                        )}
                        {row.payments?.map((p: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2">
                            {renderPaymentBadge(p.payment_method)}
                          </div>
                        ))}
                        {(!row.payments || row.payments.length === 0) && (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>

                    <td
                      className={`p-4 font-bold ${
                        row.hasNC
                          ? "text-slate-400 line-through"
                          : "text-green-600"
                      }`}
                    >
                      S/ {parseFloat(row.total).toFixed(2)}
                    </td>

                    {/* 👇 AQUÍ RECUPERAMOS EL BOTÓN ORIGINAL DE TICKET 👇 */}
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => viewTicket(row.id, "ticket")}
                          className="flex items-center gap-1 px-2 py-1 rounded border bg-white text-slate-500 border-slate-200 hover:bg-slate-100 transition font-bold text-xs"
                          title="Ver en formato Ticket (80mm)"
                        >
                          <Printer size={16} /> TK
                        </button>
                        <button
                          onClick={() => viewTicket(row.id, "a4")}
                          className="flex items-center gap-1 px-2 py-1 rounded border bg-white text-slate-500 border-slate-200 hover:bg-slate-100 transition font-bold text-xs"
                          title="Ver en formato A4"
                        >
                          <FileText size={16} /> A4
                        </button>

                        {!row.hasNC && isSunatDocument && (
                          <button
                            onClick={() =>
                              setSaleToAnul({
                                id: row.id,
                                series: `${row.series}-${row.number}`,
                              })
                            }
                            className="flex items-center gap-1 px-2 py-1 rounded border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 transition"
                            title="Anular"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(totalCount / pageSize)}
        totalCount={totalCount}
        pageSize={pageSize}
        loading={loading}
        onPageChange={(newPage) => setPage(newPage)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      {saleToAnul && (
        <CreditNoteModal
          open={true}
          saleId={saleToAnul.id}
          saleSeries={saleToAnul.series}
          onClose={() => setSaleToAnul(null)}
          onSuccess={() => fetchSales(undefined, true)}
        />
      )}
    </div>
  );
};

export default SaleList;
