import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import PurchaseDetailModal from "../purchases/PurchaseDetailModal";

// 👇 1. AGREGAR 'month' A LA INTERFAZ
interface AreaExpensesTableProps {
  area: any;
  month: string; // formato "YYYY-MM"
  onBack: () => void;
}

// 👇 2. RECIBIR LA PROPIEDAD
const AreaExpensesTable = ({ area, month, onBack }: AreaExpensesTableProps) => {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Paginación
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Estado para el Modal de Detalle
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      try {
        // 👇 3. DESGLOSAR EL AÑO Y MES DEL STRING "YYYY-MM"
        const [year, monthNum] = month.split("-");

        // 👇 4. AGREGAR LOS FILTROS A LA URL
        // Nota: Usamos budget_period__year y __month para filtrar exactamente ese periodo
        const response = await api.get(
          `/purchases/purchases/?area=${area.value}&page=${page}&ordering=-issue_date&budget_period__year=${year}&budget_period__month=${monthNum}`,
        );

        let dataList = [];
        let total = 0;

        if (response.data && Array.isArray(response.data.results)) {
          dataList = response.data.results;
          total = response.data.count;
        } else if (Array.isArray(response.data)) {
          dataList = response.data;
          total = dataList.length;
        }

        setExpenses(dataList);
        setTotalCount(total);
        setTotalPages(total > 0 ? Math.ceil(total / 10) : 1);
      } catch (error) {
        console.error("Error cargando gastos del área", error);
        setExpenses([]);
      } finally {
        setLoading(false);
      }
    };

    if (area && month) {
      fetchExpenses();
    }
  }, [area, page, month]); // 👈 5. AGREGAR 'month' A LAS DEPENDENCIAS

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER DEL DETALLE */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
          title="Volver a lista de áreas"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Gastos: {area.label}
          </h2>
          {/* Mostramos el periodo que estamos viendo */}
          <div className="flex gap-4 items-center text-sm text-slate-500">
            <span>
              Periodo: <strong className="text-slate-700">{month}</strong>
            </span>
            <span>|</span>
            <span>
              Presupuesto Restante:{" "}
              <span
                className={`font-bold ${area.remaining < 0 ? "text-red-600" : "text-green-600"}`}
              >
                S/ {area.remaining?.toFixed(2) || "0.00"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* TABLA DE GASTOS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="animate-spin text-blue-500" size={30} />
          </div>
        ) : expenses?.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No hay gastos registrados para esta área en <strong>{month}</strong>
            .
          </div>
        ) : (
          <>
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-xs">
                <tr>
                  <th className="p-4">Fecha Emisión</th>
                  {/* Agrego columna Periodo para verificar */}
                  <th className="p-4">Periodo</th>
                  <th className="p-4">Proveedor</th>
                  <th className="p-4">Documento</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 text-slate-600 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />{" "}
                      {expense.issue_date}
                    </td>
                    {/* Visualizar el periodo real grabado */}
                    <td className="p-4 text-blue-600 font-medium text-xs">
                      {expense.budget_period
                        ? expense.budget_period.slice(0, 7)
                        : "-"}
                    </td>
                    <td className="p-4 font-medium text-slate-800">
                      {expense.supplier_name}
                    </td>
                    <td className="p-4 text-slate-500">
                      <div className="flex items-center gap-1">
                        <FileText size={14} />
                        {expense.series}-{expense.number}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          expense.payment_status === "PAID"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {expense.payment_status === "PAID"
                          ? "PAGADO"
                          : "PENDIENTE"}
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-slate-800">
                      S/ {parseFloat(expense.total).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => setSelectedPurchaseId(expense.id)}
                        className="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition"
                        title="Ver Detalle"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* PAGINACIÓN */}
            <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              <span className="text-xs text-slate-500">
                Mostrando {(page - 1) * 10 + 1} a{" "}
                {Math.min(page * 10, totalCount)} de {totalCount} registros
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded border bg-white disabled:opacity-50 hover:bg-slate-100"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 py-1 text-sm font-medium">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded border bg-white disabled:opacity-50 hover:bg-slate-100"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedPurchaseId && (
        <PurchaseDetailModal
          purchaseId={selectedPurchaseId}
          onClose={() => setSelectedPurchaseId(null)}
        />
      )}
    </div>
  );
};

export default AreaExpensesTable;
