import {
  Ban,
  CloudUpload,
  FileText,
  FileWarning,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Estados de carga para envíos a SUNAT
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false); // 👈 NUEVO: Estado para envío masivo

  // Estado para el modal de anulación (PinPad)
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);

  // 1. Cargar las ventas del día
  const fetchSales = async () => {
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

      if (results.length > 0 && !selectedSale) {
        setSelectedSale(results[0]);
      } else if (selectedSale) {
        const updatedSelected = results.find(
          (s: Sale) => s.id === selectedSale.id,
        );
        setSelectedSale(updatedSelected || null);
      } else {
        setSelectedSale(null);
      }
    } catch (error) {
      console.error("Error cargando historial", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [currentBranch]);

  // 2. Función de impresión silenciosa
  const handlePrint = async (saleId: number) => {
    try {
      const response = await api.get(`/sales/sales/${saleId}/print/`, {
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
      alert("Error al intentar imprimir el ticket.");
    }
  };

  // 3. Función para imprimir la Nota de Crédito
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

  // 🔥 5. Enviar a SUNAT (MASIVO)
  const handleSyncAllPending = async () => {
    // Filtramos las que no son Ticket interno y que NO estén aceptadas
    const pendingSales = sales.filter(
      (s) => s.invoice_type_code !== "99" && s.sunat_status !== "ACCEPTED",
    );

    if (pendingSales.length === 0) {
      return alert(
        "✅ No hay comprobantes pendientes de envío a SUNAT en este turno.",
      );
    }

    setIsSyncingAll(true);
    try {
      // Enviamos todas en paralelo
      await Promise.all(
        pendingSales.map((sale) =>
          api.post(`/sales/sales/${sale.id}/send_sunat/`),
        ),
      );
      fetchSales();
    } catch (error) {
      console.error(error);
      alert(
        "⚠️ Algunos comprobantes pudieron no enviarse por problemas de conexión. Intente nuevamente.",
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
    <div className="h-screen flex flex-col bg-slate-100 font-sans overflow-hidden">
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
              <button
                onClick={handleSyncAllPending}
                disabled={isSyncingAll}
                className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                title="Sincronizar todos los documentos pendientes a SUNAT"
              >
                <CloudUpload
                  size={14}
                  className={isSyncingAll ? "animate-bounce" : ""}
                />
                {isSyncingAll ? "ENVIANDO..." : "SYNC PENDIENTES"}
              </button>
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

                    {/* 👇 NUEVO: Botón Minimalista de SUNAT integrado en el título */}
                    {selectedSale.invoice_type_code !== "99" && (
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
                            : "Standby / Pendiente"}
                        </span>

                        {/* El botón de reintento circular */}
                        {selectedSale.sunat_status !== "ACCEPTED" && (
                          <button
                            onClick={() => handleSendToSunat(selectedSale.id)}
                            disabled={isSyncing}
                            className="bg-blue-100 hover:bg-blue-200 text-blue-700 p-1.5 rounded-full transition-colors disabled:opacity-50 active:scale-95"
                            title="Reintentar Envío a SUNAT"
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
