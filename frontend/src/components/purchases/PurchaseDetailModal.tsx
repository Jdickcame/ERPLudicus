import { FileText, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";

interface PurchaseDetailModalProps {
  purchaseId: number | null;
  // 👇 NUEVO: Le pasamos el 'type' para que sepa si busca una Compra o una Nota
  type?: "PURCHASES" | "NOTES";
  onClose: () => void;
}

interface PurchaseDetail {
  id: number;
  supplier_name: string;
  supplier_ruc?: string;
  supplier_tax_id?: string; // Para compatibilidad
  issue_date: string;
  document_type?: string;
  note_type?: string; // Si es nota
  series: string;
  number: string;
  observation?: string;

  payment_condition?: string;

  currency: "PEN" | "USD";
  exchange_rate: string;
  total_amount_pen?: number;

  subtotal?: number;
  tax_amount?: number;
  total: number;

  detraction_amount?: number;
  retention_amount?: number;
  perception_amount?: number;

  total_net_pay?: number;

  details: {
    id: number;
    product_name: string;
    description?: string;
    category_name?: string; // 👈 NUEVO
    area_name?: string; // 👈 NUEVO
    quantity: number;
    unit_value: number;
    total_value: number;
    tax_percentage: number;
  }[];
}

const PurchaseDetailModal = ({
  purchaseId,
  type = "PURCHASES", // Por defecto asume que es una compra normal
  onClose,
}: PurchaseDetailModalProps) => {
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (purchaseId) {
      const fetchDetail = async () => {
        setLoading(true);
        try {
          // 👇 DETERMINAMOS A QUÉ RUTA LLAMAR SEGÚN EL TIPO
          const endpoint =
            type === "PURCHASES"
              ? `/purchases/purchases/${purchaseId}/`
              : `/purchases/notes/${purchaseId}/`;

          const res = await api.get(endpoint);
          setPurchase(res.data);
        } catch (error) {
          console.error("Error al cargar detalle", error);
        } finally {
          setLoading(false);
        }
      };
      fetchDetail();
    }
  }, [purchaseId, type]);

  if (!purchaseId) return null;

  const symbol = purchase?.currency === "USD" ? "$" : "S/";

  // Mapeo del nombre del documento para la cabecera
  let documentName = purchase?.document_type || "DOCUMENTO";
  if (type === "NOTES") {
    documentName =
      purchase?.note_type === "07" ? "NOTA DE CRÉDITO" : "NOTA DE DÉBITO";
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* HEADER */}
        <div className="bg-slate-50 p-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileText
                className={
                  type === "NOTES" ? "text-orange-500" : "text-blue-600"
                }
              />
              {type === "NOTES" ? "Detalle de Nota" : "Detalle de Compra"}
            </h2>
            {purchase && (
              <p className="text-sm text-slate-500 mt-1 font-medium">
                {documentName}{" "}
                <span className="text-slate-800 font-bold">
                  {purchase.series}-{purchase.number}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 p-1 rounded-full transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
          ) : purchase ? (
            <div className="space-y-6">
              {/* DATOS PRINCIPALES */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm bg-slate-50 p-3 rounded border border-slate-100">
                <div className="md:col-span-2">
                  <p className="text-slate-500 font-medium text-xs uppercase">
                    Proveedor
                  </p>
                  <p
                    className="font-bold text-slate-800 truncate"
                    title={purchase.supplier_name}
                  >
                    {purchase.supplier_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {purchase.supplier_ruc || purchase.supplier_tax_id}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium text-xs uppercase">
                    Emisión
                  </p>
                  <p className="font-bold text-slate-800">
                    {purchase.issue_date}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500 font-medium text-xs uppercase">
                    Moneda / TC
                  </p>
                  <p
                    className={`font-bold ${purchase.currency === "USD" ? "text-green-600" : "text-slate-800"}`}
                  >
                    {purchase.currency}
                    <span className="text-xs text-slate-400 ml-1">
                      (x {purchase.exchange_rate})
                    </span>
                  </p>
                </div>

                {type === "PURCHASES" && (
                  <div>
                    <p className="text-slate-500 font-medium text-xs uppercase">
                      Condición
                    </p>
                    <p className="font-bold text-slate-800">
                      {purchase.payment_condition === "CASH"
                        ? "Contado"
                        : "Crédito"}
                    </p>
                  </div>
                )}
              </div>

              {/* TABLA DE PRODUCTOS (AHORA CON ÁREA Y CATEGORÍA) */}
              <div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3 w-1/3">Descripción</th>
                        <th className="p-3">Centro de Costo</th>
                        <th className="p-3 text-center">Cant.</th>
                        <th className="p-3 text-right">P. Unit</th>
                        <th className="p-3 text-center">IGV</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {purchase.details?.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-700">
                            {item.product_name || item.description}
                          </td>
                          {/* 👇 NUEVO: Muestra el área y categoría guardados */}
                          <td className="p-3 text-[11px] leading-tight">
                            <span className="block text-slate-600 font-bold">
                              {item.category_name || "Sin Categoría"}
                            </span>
                            <span className="block text-slate-400">
                              {item.area_name || "Sin Área"}
                            </span>
                          </td>
                          <td className="p-3 text-center font-medium">
                            {Number(item.quantity)}
                          </td>
                          <td className="p-3 text-right">
                            {symbol} {Number(item.unit_value).toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            {Number(item.tax_percentage) > 0 ? (
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                {Number(item.tax_percentage)}%
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">
                                EXO
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-bold text-blue-700">
                            {symbol}{" "}
                            {Number(
                              item.total_value *
                                (1 + Number(item.tax_percentage) / 100),
                            ).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECCIÓN DE TOTALES */}
              <div className="flex flex-col items-end pt-2">
                <div className="w-64 space-y-1">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Subtotal Base:</span>
                    <span>
                      {symbol} {Number(purchase.subtotal || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>IGV:</span>
                    <span>
                      {symbol} {Number(purchase.tax_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-700 border-t border-slate-200 pt-1 mt-1">
                    <span>Total Documento:</span>
                    <span>
                      {symbol} {Number(purchase.total).toFixed(2)}
                    </span>
                  </div>
                </div>

                {type === "PURCHASES" &&
                  (Number(purchase.perception_amount) > 0 ||
                    Number(purchase.retention_amount) > 0 ||
                    Number(purchase.detraction_amount) > 0) && (
                    <div className="w-64 bg-slate-50 p-2 rounded mt-3 border border-slate-200 space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Ajustes Tributarios
                      </p>
                      {Number(purchase.perception_amount) > 0 && (
                        <div className="text-sm text-blue-600 flex justify-between font-medium">
                          <span>(+) Percepción:</span>
                          <span>
                            {symbol}{" "}
                            {Number(purchase.perception_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {Number(purchase.detraction_amount) > 0 && (
                        <div className="text-sm text-orange-600 flex justify-between font-medium">
                          <span>(i) Detracción:</span>
                          <span>
                            {symbol}{" "}
                            {Number(purchase.detraction_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {Number(purchase.retention_amount) > 0 && (
                        <div className="text-sm text-green-600 flex justify-between font-medium">
                          <span>(-) Retención:</span>
                          <span>
                            {symbol}{" "}
                            {Number(purchase.retention_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                <div className="w-64 mt-3 bg-slate-800 text-white p-3 rounded-lg shadow-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      {type === "NOTES" ? "Total Nota" : "Neto a Pagar"}
                    </span>
                    <span className="text-xl font-black">
                      {symbol}{" "}
                      {Number(purchase.total_net_pay || purchase.total).toFixed(
                        2,
                      )}
                    </span>
                  </div>
                  {purchase.currency === "USD" && purchase.total_amount_pen && (
                    <div className="border-t border-slate-600 mt-2 pt-1 text-right">
                      <span className="text-[10px] text-slate-400 uppercase mr-2">
                        Contable (Soles):
                      </span>
                      <span className="text-sm font-bold text-orange-400">
                        S/ {Number(purchase.total_amount_pen).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {purchase.observation && (
                <div className="text-sm text-slate-600 bg-yellow-50 p-3 rounded border border-yellow-100 italic">
                  "{purchase.observation}"
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-red-500">
              No se encontró información del documento.
            </p>
          )}
        </div>

        <div className="bg-slate-50 p-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="bg-white border border-slate-300 text-slate-700 px-6 py-2 rounded-lg font-bold hover:bg-slate-100 transition shadow-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseDetailModal;
