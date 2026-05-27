import {
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

interface PurchaseDetailModalProps {
  purchaseId: number | null;
  type?: "PURCHASES" | "NOTES";
  onClose: () => void;
  filterAreaId?: string | number;
}

interface PurchaseDetail {
  id: number;
  supplier_name: string;
  supplier_ruc?: string;
  supplier_tax_id?: string;
  issue_date: string;
  document_type?: string;
  note_type?: string;
  series: string;
  number: string;
  observation?: string;
  payment_condition?: string;
  payment_status?: string; // 👈 Añadido para la auditoría
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
  details: any[];
}

// 👈 NUEVA INTERFAZ PARA PAGOS
interface PaymentTrace {
  date: string;
  method: string;
  amount: number;
  transaction_number: string;
  description: string;
}

const PurchaseDetailModal = ({
  purchaseId,
  type = "PURCHASES",
  onClose,
  filterAreaId,
}: PurchaseDetailModalProps) => {
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 👈 ESTADO PARA LA AUDITORÍA
  const [payments, setPayments] = useState<PaymentTrace[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  useEffect(() => {
    if (purchaseId) {
      const fetchDetail = async () => {
        setLoading(true);
        try {
          const endpoint =
            type === "PURCHASES"
              ? `/purchases/purchases/${purchaseId}/`
              : `/purchases/notes/${purchaseId}/`;

          const res = await api.get(endpoint);
          setPurchase(res.data);

          // 👇 Si es una compra y está pagada, buscamos la trazabilidad
          if (type === "PURCHASES" && res.data.payment_status === "PAID") {
            fetchPaymentHistory(purchaseId);
          }
        } catch (error) {
          console.error("Error al cargar detalle", error);
        } finally {
          setLoading(false);
        }
      };
      fetchDetail();
    }
  }, [purchaseId, type]);

  // 👇 FUNCIÓN PARA BUSCAR EL RASTRO DEL PAGO EN TESORERÍA
  const fetchPaymentHistory = async (id: number) => {
    setLoadingPayments(true);
    try {
      const res = await api.get(
        `/treasury/operations/purchase_payments/?purchase_id=${id}`,
      );
      setPayments(res.data);
    } catch (error) {
      console.error("Error cargando pagos:", error);
    } finally {
      setLoadingPayments(false);
    }
  };

  const displayedDetails = useMemo(() => {
    if (!purchase?.details) return [];
    if (!filterAreaId) return purchase.details;
    return purchase.details.filter(
      (item) =>
        String(item.area) === String(filterAreaId) ||
        String(item.area_id) === String(filterAreaId),
    );
  }, [purchase, filterAreaId]);

  const { subtotalStr, taxStr, totalStr, netPayStr, contableStr } =
    useMemo(() => {
      if (!purchase)
        return {
          subtotalStr: "0.00",
          taxStr: "0.00",
          totalStr: "0.00",
          netPayStr: "0.00",
          contableStr: "0.00",
        };

      if (!filterAreaId) {
        return {
          subtotalStr: Number(purchase.subtotal || 0).toFixed(2),
          taxStr: Number(purchase.tax_amount || 0).toFixed(2),
          totalStr: Number(purchase.total || 0).toFixed(2),
          netPayStr: Number(
            purchase.total_net_pay || purchase.total || 0,
          ).toFixed(2),
          contableStr: Number(purchase.total_amount_pen || 0).toFixed(2),
        };
      }

      let calcSubtotal = 0;
      let calcTax = 0;

      displayedDetails.forEach((item) => {
        const itemBase = Number(item.total_value || 0);
        const itemTax = itemBase * (Number(item.tax_percentage || 0) / 100);
        calcSubtotal += itemBase;
        calcTax += itemTax;
      });

      const calcTotal = calcSubtotal + calcTax;
      const exRate = Number(purchase.exchange_rate || 1);
      const calcContable =
        purchase.currency === "USD" ? calcTotal * exRate : calcTotal;

      return {
        subtotalStr: calcSubtotal.toFixed(2),
        taxStr: calcTax.toFixed(2),
        totalStr: calcTotal.toFixed(2),
        netPayStr: calcTotal.toFixed(2),
        contableStr: calcContable.toFixed(2),
      };
    }, [purchase, filterAreaId, displayedDetails]);

  if (!purchaseId) return null;

  const symbol = purchase?.currency === "USD" ? "$" : "S/";

  let documentName = purchase?.document_type || "DOCUMENTO";
  if (type === "NOTES") {
    documentName =
      purchase?.note_type === "07" ? "NOTA DE CRÉDITO" : "NOTA DE DÉBITO";
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* HEADER */}
        <div className="bg-slate-50 p-5 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
              <FileText
                className={
                  type === "NOTES" ? "text-orange-500" : "text-blue-600"
                }
                size={22}
              />
              {type === "NOTES" ? "Detalle de Nota" : "Detalle de Compra"}
              {filterAreaId && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-bold">
                  Filtrado por Área
                </span>
              )}
            </h2>
            {purchase && (
              <p className="text-sm text-slate-500 mt-1 font-medium">
                {documentName}{" "}
                <span className="text-slate-800 font-bold uppercase tracking-wider bg-slate-200/50 px-2 py-0.5 rounded ml-1">
                  {purchase.series}-{purchase.number}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 hover:bg-slate-200 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
          ) : purchase ? (
            <div className="space-y-6">
              {/* DATOS PRINCIPALES (Sin cambios) */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="md:col-span-2">
                  <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                    Proveedor
                  </p>
                  <p
                    className="font-bold text-slate-800 truncate text-base mt-0.5"
                    title={purchase.supplier_name}
                  >
                    {purchase.supplier_name}
                  </p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {purchase.supplier_ruc || purchase.supplier_tax_id}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                    Emisión
                  </p>
                  <p className="font-bold text-slate-800 mt-0.5">
                    {purchase.issue_date}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                    Moneda / TC
                  </p>
                  <p
                    className={`font-bold mt-0.5 ${purchase.currency === "USD" ? "text-green-600" : "text-slate-800"}`}
                  >
                    {purchase.currency}
                    <span className="text-[10px] text-slate-400 ml-1">
                      (x {purchase.exchange_rate})
                    </span>
                  </p>
                </div>
                {type === "PURCHASES" && (
                  <div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                      Condición
                    </p>
                    <p className="font-bold text-slate-800 mt-0.5">
                      {purchase.payment_condition === "CASH"
                        ? "Contado"
                        : "Crédito"}
                    </p>
                  </div>
                )}
              </div>

              {/* TABLA DE PRODUCTOS (Sin cambios) */}
              <div>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
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
                      {displayedDetails.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-6 text-center text-slate-400"
                          >
                            No hay productos registrados para esta área.
                          </td>
                        </tr>
                      ) : (
                        displayedDetails.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-700">
                              {item.product_name || item.description}
                            </td>
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECCIÓN DE TOTALES */}
              <div className="flex flex-col items-end pt-2">
                <div className="w-64 space-y-1.5">
                  <div className="flex justify-between text-sm text-slate-500 font-medium">
                    <span>Subtotal Base:</span>
                    <span>
                      {symbol} {subtotalStr}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500 font-medium">
                    <span>IGV:</span>
                    <span>
                      {symbol} {taxStr}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-black text-slate-800 border-t border-slate-200 pt-2 mt-2">
                    <span>Total {filterAreaId ? "Área" : "Documento"}:</span>
                    <span>
                      {symbol} {totalStr}
                    </span>
                  </div>
                </div>

                {!filterAreaId &&
                  type === "PURCHASES" &&
                  (Number(purchase.perception_amount) > 0 ||
                    Number(purchase.retention_amount) > 0 ||
                    Number(purchase.detraction_amount) > 0) && (
                    <div className="w-64 bg-slate-50 p-3 rounded-lg mt-3 border border-slate-200 space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">
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

                <div className="w-64 mt-4 bg-slate-800 text-white p-4 rounded-xl shadow-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      {filterAreaId
                        ? "Total Área"
                        : type === "NOTES"
                          ? "Total Nota"
                          : "Neto a Pagar"}
                    </span>
                    <span className="text-2xl font-black text-blue-400">
                      {symbol} {netPayStr}
                    </span>
                  </div>
                  {purchase.currency === "USD" && purchase.total_amount_pen && (
                    <div className="border-t border-slate-600 mt-3 pt-2 text-right flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 uppercase">
                        Contable (Soles):
                      </span>
                      <span className="text-sm font-bold text-slate-200">
                        S/ {contableStr}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 👇 NUEVA SECCIÓN: AUDITORÍA FINANCIERA 👇 */}
              {type === "PURCHASES" && !filterAreaId && (
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Wallet size={18} className="text-slate-400" /> Auditoría de
                    Pagos
                  </h3>

                  {purchase.payment_status === "PENDING" ? (
                    <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-start gap-3">
                      <Clock className="text-orange-500 mt-0.5" size={20} />
                      <div>
                        <p className="font-bold text-orange-800">
                          Factura Pendiente de Pago
                        </p>
                        <p className="text-xs text-orange-600/80 mt-1 font-medium">
                          Este documento está a la espera de ser procesado por
                          el departamento de Tesorería.
                        </p>
                      </div>
                    </div>
                  ) : loadingPayments ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-4 rounded-xl">
                      <Loader2 size={16} className="animate-spin" /> Verificando
                      registros en Tesorería...
                    </div>
                  ) : payments.length > 0 ? (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3 mb-4">
                        <CheckCircle2
                          className="text-emerald-500 mt-0.5"
                          size={20}
                        />
                        <div>
                          <p className="font-bold text-emerald-800">
                            Factura Liquidada
                          </p>
                          <p className="text-xs text-emerald-600/80 mt-1 font-medium">
                            El pago de este documento ha sido conciliado en
                            Tesorería.
                          </p>
                        </div>
                      </div>

                      {/* Historial de transacciones de pago */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                            <tr>
                              <th className="p-3">Fecha de Pago</th>
                              <th className="p-3">Método</th>
                              <th className="p-3">N° Operación</th>
                              <th className="p-3 text-right">Monto Aplicado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {payments.map((p, idx) => (
                              <tr key={idx} className="bg-white">
                                <td className="p-3 font-medium text-slate-700">
                                  {p.date}
                                </td>
                                <td className="p-3 font-bold text-slate-600">
                                  {p.method}
                                </td>
                                <td className="p-3 font-mono text-slate-500">
                                  {p.transaction_number || "-"}
                                </td>
                                <td className="p-3 text-right font-black text-emerald-600">
                                  {p.amount > 0
                                    ? `S/ ${p.amount.toFixed(2)}`
                                    : "CRUCE SALDO"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm text-slate-500">
                      Documento marcado como pagado, pero no se encontró rastro
                      en el nuevo módulo de Tesorería (Posiblemente sea un pago
                      antiguo).
                    </div>
                  )}
                </div>
              )}

              {purchase.observation && (
                <div className="text-sm text-slate-600 bg-yellow-50/50 p-4 rounded-xl border border-yellow-100 italic">
                  "{purchase.observation}"
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-red-500 font-medium py-10">
              No se encontró información del documento.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseDetailModal;
