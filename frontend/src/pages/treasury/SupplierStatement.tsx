import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Download,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import PurchaseDetailModal from "../../components/purchases/PurchaseDetailModal";

interface Transaction {
  id: number;
  date: string;
  type:
    | "COMPRA"
    | "PAGO"
    | "NOTA_CREDITO"
    | "SALDO_INICIAL"
    | "ADELANTO"
    | "NOTA_DEBITO";
  document: string;
  amount: number;
  status: string;
  description: string;
  purchase_id?: number;
}

const SupplierStatement = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // 👇 NUEVO: Estado para almacenar la deuda operativa (Facturas sin pagar)
  const [pendingDebt, setPendingDebt] = useState(0);

  // Filtros
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal Detalle
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(
    null,
  );

  const fetchStatement = async (reset = false, customPage?: number) => {
    if (!id) return;
    setLoading(true);
    try {
      const p = reset ? 1 : customPage || page;

      let url = `/purchases/suppliers/${id}/statement/?page=${p}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;

      // 👇 Hacemos la consulta doble (Historial + Facturas Pendientes para el cálculo)
      const [res, pendingRes] = await Promise.all([
        api.get(url),
        api.get(`/purchases/suppliers/${id}/pending_invoices/`),
      ]);

      if (reset) {
        setTransactions(res.data.results);
      } else {
        setTransactions((prev) => [...prev, ...res.data.results]);
      }

      setHasMore(p < res.data.total_pages);

      // Calculamos la deuda pendiente real sumando las facturas en PENDING
      const totalPending = pendingRes.data.reduce(
        (sum: number, inv: any) => sum + parseFloat(inv.total_net_pay),
        0,
      );
      setPendingDebt(totalPending);

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

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchStatement(false, nextPage);
  };

  useEffect(() => {
    fetchStatement(true);
  }, [id]);

  const handleFilter = () => {
    setPage(1);
    fetchStatement(true);
  };

  const handleSyncBalance = async () => {
    if (!id) return;
    setIsSyncing(true);
    try {
      const res = await api.post(`/purchases/suppliers/${id}/sync_balance/`);
      setSupplier((prev: any) => ({
        ...prev,
        balance: res.data.new_balance,
      }));
    } catch (error) {
      console.error("Error al auditar saldo", error);
      alert("Hubo un error al intentar sincronizar el saldo.");
    } finally {
      setIsSyncing(false);
    }
  };

  const isDebt = (type: string) => type === "COMPRA" || type === "NOTA_DEBITO";

  // --- MATEMÁTICA DE CONCILIACIÓN ---
  const netBalance = parseFloat(supplier?.balance || "0");
  const availableAdvance = Math.max(0, pendingDebt - netBalance);

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/treasury/payables")}
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

        <button
          onClick={handleSyncBalance}
          disabled={isSyncing}
          className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2.5 rounded-lg hover:bg-slate-700 transition disabled:opacity-50 text-sm font-bold shadow-md"
          title="Auditar y Sincronizar Saldo"
        >
          <RefreshCw
            size={16}
            className={isSyncing ? "animate-spin text-blue-400" : ""}
          />
          {isSyncing ? "Sincronizando..." : "Auditar Saldos"}
        </button>
      </div>

      {/* 👇 NUEVO PANEL DE CONCILIACIÓN (3 TARJETAS) 👇 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Tarjeta 1: Deuda Operativa (Lo que tienes que pagar) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-red-500 border border-y-slate-200 border-r-slate-200 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] opacity-5">
            <FileText size={100} />
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <AlertCircle size={14} className="text-red-500" /> Facturas
            Pendientes
          </p>
          <h3 className="text-3xl font-black text-slate-800">
            S/ {pendingDebt.toFixed(2)}
          </h3>
          <p className="text-[10px] text-slate-400 mt-2">
            Deuda pendiente de cruce o pago.
          </p>
        </div>

        {/* Tarjeta 2: Anticipos (Tu plata guardada) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-green-500 border border-y-slate-200 border-r-slate-200 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] opacity-5">
            <Wallet size={100} />
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Wallet size={14} className="text-green-500" /> Anticipos / A Favor
          </p>
          <h3 className="text-3xl font-black text-slate-800">
            S/ {availableAdvance.toFixed(2)}
          </h3>
          <p className="text-[10px] text-slate-400 mt-2">
            Dinero disponible para cruzar.
          </p>
        </div>

        {/* Tarjeta 3: Saldo Contable (El neto final) */}
        <div
          className={`p-5 rounded-2xl shadow-sm border-l-4 relative overflow-hidden ${netBalance > 0 ? "bg-red-50 border-l-red-600 border-red-100" : netBalance < 0 ? "bg-green-50 border-l-green-600 border-green-100" : "bg-slate-50 border-l-slate-400 border-slate-200"}`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wider mb-1 ${netBalance > 0 ? "text-red-700" : netBalance < 0 ? "text-green-700" : "text-slate-500"}`}
          >
            Saldo Contable Neto
          </p>
          <h3
            className={`text-3xl font-black ${netBalance > 0 ? "text-red-600" : netBalance < 0 ? "text-green-600" : "text-slate-600"}`}
          >
            S/ {Math.abs(netBalance).toFixed(2)}
          </h3>
          <p
            className={`text-[10px] font-bold mt-2 ${netBalance > 0 ? "text-red-500" : netBalance < 0 ? "text-green-600" : "text-slate-400"}`}
          >
            {netBalance > 0
              ? "DEUDA GLOBAL"
              : netBalance < 0
                ? "A FAVOR GLOBAL"
                : "CUENTAS SALDADAS"}
          </p>
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
                const debt = isDebt(tx.type);
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
                            ? "bg-red-50 text-red-600 border-red-100"
                            : "bg-green-50 text-green-600 border-green-100"
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
              onClick={handleLoadMore}
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
