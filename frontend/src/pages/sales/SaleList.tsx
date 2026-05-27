import {
  Ban,
  Banknote,
  Calendar,
  CreditCard,
  FileText,
  Plus,
  Printer,
  Smartphone
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
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
}

interface Sale {
  id: number;
  client_name: string;
  client_doc?: string; // 👈 Recibimos el DNI/RUC
  total: string;
  date: string;
  document_type: string;
  series: string;
  number: string;
  sunat_pdf_url?: string;
  invoice_type_code?: string;
  payments: Payment[]; // 👈 Recibimos la lista de pagos
  credit_notes: CreditNote[];
}

const SaleList = () => {
  const { currentBranch } = useBranch();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saleToAnul, setSaleToAnul] = useState<{
    id: number;
    series: string;
  } | null>(null);
  const navigate = useNavigate();

  const fetchSales = useCallback(() => {
    if (!currentBranch) return;
    setLoading(true);
    api
      .get(`/sales/sales/?branch_id=${currentBranch.id}`)
      .then((res) =>
        setSales(Array.isArray(res.data) ? res.data : res.data.results),
      )
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [currentBranch]);

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

  // 👇 FUNCIÓN PARA PINTAR LOS PAGOS BONITOS
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
            <CreditCard size={12} /> VISA
          </span>
        );
      case "YAPE":
        return (
          <span className="flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">
            <Smartphone size={12} /> YAPE
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">
              Historial de Ventas
            </h1>
            <BranchSelector />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Transacciones en <strong>{currentBranch?.name}</strong>
          </p>
        </div>
        <button
          onClick={() => navigate("/pos")}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition shadow-sm"
        >
          <Plus size={20} /> Nueva Venta
        </button>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b font-semibold uppercase text-xs text-slate-700">
            <tr>
              <th className="p-4"># Doc</th>
              <th className="p-4">Fecha</th>
              <th className="p-4">Cliente</th>
              {/* 👇 NUEVA COLUMNA PAGO */}
              <th className="p-4">Pago</th>
              <th className="p-4">Total</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  Cargando ventas...
                </td>
              </tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  No hay ventas registradas.
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
                    key={sale.id}
                    className={`hover:bg-slate-50 transition group ${
                      isAnulada ? "bg-red-50" : ""
                    }`}
                  >
                    {/* DOC */}
                    <td className="p-4 font-mono text-slate-500">
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded text-[10px] mr-2 ${
                          sale.series.startsWith("F")
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {sale.series.startsWith("F") ? "FAC" : "BOL"}
                      </span>
                      <span
                        className={
                          isAnulada ? "line-through decoration-red-400" : ""
                        }
                      >
                        {sale.series}-{sale.number}
                      </span>
                      {isAnulada && (
                        <div className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1">
                          <Ban size={10} /> ANULADO
                        </div>
                      )}
                    </td>

                    {/* FECHA */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <div>
                          <div>{new Date(sale.date).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(sale.date).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 👇 CLIENTE MEJORADO (CON DNI/RUC) */}
                    <td className="p-4">
                      <div className="font-medium text-slate-800">
                        {sale.client_name || "Cliente General"}
                      </div>
                      {/* Si hay documento y no son puros ceros, lo mostramos */}
                      {sale.client_doc && sale.client_doc !== "00000000" && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {sale.client_doc.length === 11 ? "RUC: " : "DNI: "}
                          {sale.client_doc}
                        </div>
                      )}
                    </td>

                    {/* 👇 NUEVA COLUMNA DE PAGOS */}
                    <td className="p-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        {/* Mostramos "MIXTO" si hay más de 1 pago */}
                        {sale.payments?.length > 1 && (
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            MIXTO:
                          </span>
                        )}
                        {sale.payments?.map((p, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            {renderPaymentBadge(p.payment_method)}
                          </div>
                        ))}
                        {/* Si no hay pagos registrados, mostrar un guion */}
                        {(!sale.payments || sale.payments.length === 0) && (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>

                    {/* TOTAL */}
                    <td
                      className={`p-4 font-bold ${
                        isAnulada
                          ? "text-slate-400 line-through"
                          : "text-green-600"
                      }`}
                    >
                      S/ {parseFloat(sale.total).toFixed(2)}
                    </td>

                    {/* ACCIONES */}
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

                        {isAnulada ? (
                          <button
                            onClick={() =>
                              viewCreditNote(
                                sale.credit_notes[0].id,
                                sale.credit_notes[0].sunat_pdf_url,
                              )
                            }
                            className="flex items-center gap-1 px-3 py-1 rounded border bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 transition"
                            title="Ver Nota de Crédito (PDF)"
                          >
                            <FileWarning size={16} /> NC
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              setSaleToAnul({
                                id: sale.id,
                                series: `${sale.series}-${sale.number}`,
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

      {saleToAnul && (
        <CreditNoteModal
          open={true}
          saleId={saleToAnul.id}
          saleSeries={saleToAnul.series}
          onClose={() => setSaleToAnul(null)}
          onSuccess={() => fetchSales()}
        />
      )}
    </div>
  );
};

export default SaleList;
