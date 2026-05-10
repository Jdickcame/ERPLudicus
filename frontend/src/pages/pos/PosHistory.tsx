import { Ban, FileText, FileWarning, Printer, Search } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";
import CreditNoteModal from "../sales/components/CreditNoteModal"; // 👈 Ajusta la ruta a tu modal
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
  details: SaleDetail[];
  credit_notes?: any[];
}

const PosHistory = () => {
  const { currentBranch } = useBranch();

  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Estado para el modal de anulación (PinPad)
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);

  // 1. Cargar las ventas del día (o las últimas)
  const fetchSales = async () => {
    if (!currentBranch) return;
    setLoading(true);
    try {
      // A. Primero averiguamos cuál es el turno actual y a qué hora se abrió
      const shiftRes = await api.get("/cash/shifts/current/");
      const currentShift = shiftRes.data;

      // Convertimos la hora de apertura a un objeto Date de Javascript
      const shiftOpenDate = new Date(currentShift.opened_at);

      // B. Traemos las ventas de la sede
      const response = await api.get(
        `/sales/sales/?branch_id=${currentBranch.id}&ordering=-date`,
      );
      let results = response.data.results || response.data;

      // C. EL FILTRO MÁGICO: Solo dejamos las ventas cuya fecha sea MAYOR o IGUAL a la apertura de caja
      results = results.filter((sale: Sale) => {
        const saleDate = new Date(sale.date); // 👈 Usamos tu nuevo campo 'date'
        return saleDate >= shiftOpenDate;
      });

      setSales(results);

      // Seleccionamos la primera por defecto si hay
      if (results.length > 0 && !selectedSale) {
        setSelectedSale(results[0]);
      } else if (selectedSale) {
        // Actualizar la venta seleccionada si recargamos (ej. después de anular)
        const updatedSelected = results.find(
          (s: Sale) => s.id === selectedSale.id,
        );
        setSelectedSale(updatedSelected || null);
      } else {
        // Si no hay ventas en este turno, limpiamos la selección
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

  // 2. Función de impresión silenciosa (Reutilizada de tu PointOfSale)
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

  // 3. Función para imprimir la Nota de Crédito (Silenciosa)
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

  // Filtrado rápido por número de ticket
  const filteredSales = sales.filter((s) =>
    `${s.series}-${s.number}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="h-screen flex flex-col bg-slate-100 font-sans overflow-hidden">
      <PosHeader />

      {/* Modal de Anulación (El que pide PIN al gerente) */}
      {isVoidModalOpen && selectedSale && (
        <CreditNoteModal
          open={isVoidModalOpen}
          saleId={selectedSale.id}
          saleSeries={`${selectedSale.series}-${selectedSale.number}`}
          onClose={() => setIsVoidModalOpen(false)}
          onSuccess={() => {
            setIsVoidModalOpen(false);
            fetchSales(); // Recargamos para ver el estado "Anulado"
          }}
        />
      )}

      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* PANEL IZQUIERDO: LISTA DE VENTAS */}
        <div className="w-1/3 min-w-[320px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-black text-slate-700 text-lg flex items-center gap-2 mb-3">
              <FileText className="text-blue-600" /> Últimas Ventas
            </h2>
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
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">
                      {new Date(sale.date).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
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
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 mb-1">
                    {selectedSale.invoice_type_code === "01"
                      ? "Factura"
                      : "Boleta"}{" "}
                    Electrónica
                  </h2>
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
                </div>

                {/* Etiqueta Gigante de Anulado */}
                {((selectedSale.credit_notes &&
                  selectedSale.credit_notes.length > 0) ||
                  selectedSale.status === "CANCELED") && (
                  <div className="border-4 border-red-500 text-red-500 font-black text-2xl uppercase tracking-widest px-4 py-2 rounded-lg transform rotate-12 opacity-80 select-none">
                    ANULADO
                  </div>
                )}
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
                        className="border-b border-slate-50 last:border-0"
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

              {/* Pie del Detalle (Totales y Botones Gigantes) */}
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                <div className="flex justify-between items-end mb-6">
                  <div className="text-sm text-slate-500 space-y-1">
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
                      Total a Pagar
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
                    <Printer size={20} /> REIMPRIMIR TICKET
                  </button>

                  {/* Lógica: Si está anulada mostramos imprimir NC, sino mostramos anular */}
                  {selectedSale.credit_notes &&
                  selectedSale.credit_notes.length > 0 ? (
                    <button
                      onClick={() =>
                        handlePrintCreditNote(selectedSale.credit_notes![0].id)
                      }
                      className="flex-1 bg-orange-50 text-orange-600 border-2 border-orange-200 hover:bg-orange-100 font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <FileWarning size={20} /> TICKET NOTA CRÉDITO
                    </button>
                  ) : selectedSale.status !== "CANCELED" ? (
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
              <FileText size={64} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">
                Selecciona una venta de la lista
              </p>
              <p className="text-sm">
                Para ver los detalles, imprimir o anular.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosHistory;
