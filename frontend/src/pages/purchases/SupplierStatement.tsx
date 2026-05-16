import {
  ArrowLeft,
  Calendar,
  Download,
  Eye,
  Filter,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import PurchaseDetailModal from "../../components/purchases/PurchaseDetailModal"; // 👈 Reutilizamos el modal

interface Transaction {
  id: number;
  date: string;
  type: "COMPRA" | "PAGO" | "NOTA_CREDITO" | "SALDO_INICIAL";
  document: string;
  amount: number; // El backend debe enviarlo con signo correcto, o lo forzamos aquí
  status: string;
  description: string;
  purchase_id?: number; // Para abrir el modal si es compra
}

const SupplierStatement = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Filtro de Fechas
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal Detalle
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(
    null,
  );

  const fetchStatement = async (reset = false) => {
    if (!id) return;
    setLoading(true);
    try {
      const p = reset ? 1 : page;
      // Construimos la URL con filtros
      let url = `/purchases/suppliers/${id}/statement/?page=${p}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;

      const res = await api.get(url);

      if (reset) {
        setTransactions(res.data.results);
      } else {
        setTransactions((prev) => [...prev, ...res.data.results]);
      }

      setHasMore(res.data.results.length > 0);

      // Cargar info del proveedor solo la primera vez o si cambia el ID
      if (!supplier) {
        const suppRes = await api.get(`/purchases/suppliers/${id}/`);
        setSupplier(suppRes.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement(true);
  }, [id]); // Solo recarga inicial al cambiar de proveedor

  const handleFilter = () => {
    setPage(1);
    fetchStatement(true);
  };

  // Función para determinar si es Deuda (Rojo) o Abono (Verde)
  // Asumimos: COMPRA = Deuda (-), PAGO = Abono (+)
  const isDebt = (type: string) => type === "COMPRA";

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-200 rounded-full transition text-slate-500"
            title="Volver"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              {supplier?.name || supplier?.business_name || "Cargando..."}
            </h1>
            <p className="text-slate-500 font-medium">
              RUC: {supplier?.tax_id}
            </p>
          </div>
        </div>

        {/* SALDO GIGANTE */}
        <div className="text-right bg-slate-900 text-white p-5 rounded-2xl shadow-xl min-w-[250px]">
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">
            Estado de Cuenta
          </p>

          {parseFloat(supplier?.balance || 0) > 0 ? (
            <>
              <h2 className="text-4xl font-black text-red-400">
                S/{" "}
                {parseFloat(supplier?.balance || 0).toLocaleString("es-PE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h2>
              <p className="text-[11px] text-red-300/80 mt-1 font-medium">
                ⚠️ Tienes una deuda pendiente
              </p>
            </>
          ) : parseFloat(supplier?.balance || 0) < 0 ? (
            <>
              <h2 className="text-4xl font-black text-green-400">
                + S/{" "}
                {Math.abs(parseFloat(supplier?.balance || 0)).toLocaleString(
                  "es-PE",
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
              </h2>
              <p className="text-[11px] text-green-300/80 mt-1 font-medium">
                ✅ Saldo a tu favor
              </p>
            </>
          ) : (
            <>
              <h2 className="text-4xl font-black text-slate-300">S/ 0.00</h2>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                ✔️ Cuentas saldadas
              </p>
            </>
          )}
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-end md:items-center">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm uppercase">
          <Filter size={18} className="text-blue-600" /> Filtros
        </div>

        <div className="flex flex-col md:flex-row gap-2 flex-1 w-full">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase">
              Desde
            </label>
            <input
              type="date"
              className="border rounded p-2 text-sm outline-none focus:border-blue-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase">
              Hasta
            </label>
            <input
              type="date"
              className="border rounded p-2 text-sm outline-none focus:border-blue-500"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button
            onClick={handleFilter}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition h-[38px] self-end"
          >
            <Search size={18} />
          </button>
        </div>

        <button className="flex items-center gap-2 text-slate-600 font-bold text-sm hover:bg-slate-100 px-4 py-2 rounded-lg transition border border-transparent hover:border-slate-200">
          <Download size={18} /> Exportar PDF
        </button>
      </div>

      {/* TABLA DE MOVIMIENTOS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-xs tracking-wider">
            <tr>
              <th className="p-4">Fecha</th>
              <th className="p-4">Tipo Mov.</th>
              <th className="p-4">Documento / Referencia</th>
              <th className="p-4 text-right">Monto</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  No hay movimientos registrados en este periodo.
                </td>
              </tr>
            ) : (
              transactions.map((tx, idx) => {
                const debt = isDebt(tx.type); // Es deuda?
                return (
                  <tr
                    key={`${tx.id}-${idx}`}
                    className="hover:bg-slate-50 transition group"
                  >
                    <td className="p-4 text-slate-600 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {tx.date}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-[10px] font-bold border ${
                          debt
                            ? "bg-red-50 text-red-600 border-red-100" // Compra
                            : "bg-green-50 text-green-600 border-green-100" // Pago
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-700">
                        {tx.document}
                      </div>
                      <div className="text-xs text-slate-400 italic truncate max-w-[200px]">
                        {tx.description}
                      </div>
                    </td>
                    <td
                      className={`p-4 text-right font-black text-base ${
                        debt ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {debt ? "- " : "+ "}
                      S/ {Math.abs(tx.amount).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      {/* Solo mostramos el ojito si es una COMPRA y tenemos ID */}
                      {tx.type === "COMPRA" && tx.purchase_id && (
                        <button
                          onClick={() =>
                            setSelectedPurchaseId(tx.purchase_id || null)
                          }
                          className="text-slate-300 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-full transition"
                          title="Ver Detalle de Compra"
                        >
                          <Eye size={20} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* LAZY LOADING */}
        {hasMore && (
          <div className="p-4 text-center border-t border-slate-100 bg-slate-50">
            <button
              onClick={() => setPage((prev) => prev + 1)}
              disabled={loading}
              className="text-slate-600 font-bold text-xs hover:text-blue-600 disabled:opacity-50 transition uppercase tracking-wide flex items-center justify-center gap-2 mx-auto"
            >
              {loading ? (
                <>Cargando datos...</>
              ) : (
                <>▼ Cargar movimientos anteriores</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* MODAL DETALLE DE COMPRA */}
      {selectedPurchaseId && (
        <PurchaseDetailModal
          purchaseId={selectedPurchaseId}
          onClose={() => setSelectedPurchaseId(null)}
        />
      )}
    </div>
  );
};

export default SupplierStatement;
