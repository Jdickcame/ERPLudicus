import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  FileText,
  Loader2,
  Search,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import Pagination from "../../components/common/Pagination";
import TreasuryPaymentModal from "../../components/treasury/TreasuryPaymentModal";

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const AccountsPayable = () => {
  const navigate = useNavigate();

  // --- ESTADOS ---
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // 👇 Por defecto ahora ordenamos por los que vencen primero
  const [ordering, setOrdering] = useState("next_due_date");

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

  const loadBalances = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: page,
        page_size: pageSize,
        ordering: ordering,
      };

      if (debouncedSearch) params.search = debouncedSearch;

      const response = await api.get("/purchases/suppliers/", { params });

      if (response.data && response.data.results) {
        setSuppliers(response.data.results);
        setTotalCount(response.data.count);
      } else {
        const allData = Array.isArray(response.data) ? response.data : [];
        setTotalCount(allData.length);
        const startIndex = (page - 1) * pageSize;
        setSuppliers(allData.slice(startIndex, startIndex + pageSize));
      }
    } catch (error) {
      console.error("Error cargando saldos:", error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, ordering]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleSort = (field: string) => {
    if (ordering === field) setOrdering(`-${field}`);
    else if (ordering === `-${field}`) setOrdering(field);
    else setOrdering(field);
  };

  const getSortIcon = (field: string) => {
    if (ordering === field) return <ArrowUp size={14} className="ml-1" />;
    if (ordering === `-${field}`)
      return <ArrowDown size={14} className="ml-1" />;
    return null;
  };

  const openPaymentModal = (supplier: any) => {
    setSelectedSupplier(supplier);
    setIsPaymentModalOpen(true);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // --- FUNCIÓN PARA FORMATEAR Y COLOREAR LA FECHA ---
  const renderDueDate = (dateString: string | null) => {
    if (!dateString)
      return <span className="text-slate-400 italic">Sin pendientes</span>;

    const dueDate = new Date(dateString);
    // Para que no haya problemas con la zona horaria, tomamos solo la fecha local
    const dueDateLocal = new Date(
      dueDate.getTime() + dueDate.getTimezoneOffset() * 60000,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = Math.ceil(
      (dueDateLocal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    let textColor = "text-slate-600";
    let bgBadge = "";
    let label = "";

    if (diffTime < 0) {
      textColor = "text-red-700 font-black";
      bgBadge = "bg-red-100 text-red-700 border-red-200";
      label = `Venció hace ${Math.abs(diffTime)} día(s)`;
    } else if (diffTime === 0) {
      textColor = "text-orange-600 font-bold";
      bgBadge = "bg-orange-100 text-orange-700 border-orange-200";
      label = "Vence HOY";
    } else if (diffTime <= 3) {
      textColor = "text-orange-500 font-bold";
      label = `Vence en ${diffTime} días`;
    } else {
      label = `En ${diffTime} días`;
    }

    return (
      <div className="flex flex-col items-start gap-1">
        <span className={`${textColor} flex items-center gap-1.5`}>
          <CalendarClock size={14} />
          {dueDateLocal.toLocaleDateString("es-PE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
        {label && (
          <span
            className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${bgBadge || "border-transparent text-slate-400"}`}
          >
            {label}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Wallet className="text-blue-600" size={32} /> Tablero de Tesorería
          </h1>
          <p className="text-slate-500 font-medium mt-1 text-sm md:text-base">
            Gestión de pagos, saldos y adelantos a proveedores.
            <span className="ml-3 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
              {totalCount} Cuentas Registradas
            </span>
          </p>
        </div>
      </div>

      {/* BÚSQUEDA */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 relative">
        <Search className="absolute left-7 top-7 text-slate-400" size={22} />
        <input
          type="text"
          placeholder="Buscar proveedor por nombre o RUC..."
          className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-medium text-slate-700 text-base"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLA FINANCIERA */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        {loading ? (
          <div className="py-24 flex flex-col justify-center items-center gap-4 text-slate-500">
            <Loader2 className="animate-spin text-blue-600" size={40} />
            <span className="font-medium text-sm tracking-wide uppercase">
              Sincronizando Saldos...
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th
                    className="p-5 cursor-pointer hover:bg-slate-100 transition w-2/6"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex flex-col text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="flex items-center text-slate-700">
                        Proveedor {getSortIcon("name")}
                      </span>
                      <span className="text-slate-400 font-normal mt-0.5">
                        Razón Social y RUC
                      </span>
                    </div>
                  </th>

                  {/* 👇 NUEVA COLUMNA DE VENCIMIENTO 👇 */}
                  <th
                    className="p-5 cursor-pointer hover:bg-slate-100 transition w-1/6"
                    onClick={() => handleSort("next_due_date")}
                  >
                    <div className="flex flex-col text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="flex items-center text-slate-700">
                        Próx. Vencimiento {getSortIcon("next_due_date")}
                      </span>
                      <span className="text-slate-400 font-normal mt-0.5">
                        Fecha límite de pago
                      </span>
                    </div>
                  </th>

                  <th
                    className="p-5 text-right cursor-pointer hover:bg-slate-100 transition w-1/6"
                    onClick={() => handleSort("balance")}
                  >
                    <div className="flex flex-col items-end text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="flex items-center text-slate-700">
                        Estado Financiero {getSortIcon("balance")}
                      </span>
                      <span className="text-slate-400 font-normal mt-0.5">
                        Saldo Actualizado
                      </span>
                    </div>
                  </th>

                  <th className="p-5 text-center w-2/6">
                    <div className="flex flex-col items-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="text-slate-700">Gestión Operativa</span>
                      <span className="text-slate-400 font-normal mt-0.5">
                        Acciones Rápidas
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-16 text-slate-400 font-medium"
                    >
                      No se encontraron cuentas con esos datos.
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => {
                    const balance = parseFloat(s.balance || "0");
                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        <td className="p-5">
                          <div className="font-black text-slate-800 text-lg uppercase tracking-tight">
                            {s.name}
                          </div>
                          <div className="text-slate-500 font-mono text-sm mt-1 flex items-center gap-2">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-600">
                              RUC
                            </span>
                            {s.tax_id}
                          </div>
                        </td>

                        {/* 👇 CELDA DE VENCIMIENTO 👇 */}
                        <td className="p-5">
                          {balance > 0 ? (
                            renderDueDate(s.next_due_date)
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        <td className="p-5 text-right">
                          {balance > 0 ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="text-red-600 font-black text-xl bg-red-50 border border-red-100 px-4 py-1.5 rounded-xl shadow-sm">
                                S/ {balance.toFixed(2)}
                              </span>
                              <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1.5 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                Por Pagar
                              </span>
                            </div>
                          ) : balance < 0 ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="text-green-600 font-black text-xl bg-green-50 border border-green-100 px-4 py-1.5 rounded-xl shadow-sm">
                                + S/ {Math.abs(balance).toFixed(2)}
                              </span>
                              <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest mt-1.5">
                                A nuestro favor
                              </span>
                            </div>
                          ) : (
                            <div className="inline-flex flex-col items-end">
                              <span className="text-slate-500 font-bold text-xl bg-slate-50 border border-slate-200 px-4 py-1.5 rounded-xl">
                                S/ 0.00
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
                                Saldado
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="p-5">
                          <div className="flex justify-center gap-3">
                            <button
                              onClick={() =>
                                navigate(`/treasury/payables/${s.id}/statement`)
                              }
                              className="flex items-center gap-2 bg-white border-2 border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all shadow-sm font-bold text-sm"
                              title="Ver Estado de Cuenta detallado"
                            >
                              <FileText size={18} /> Historial
                            </button>
                            <button
                              onClick={() => openPaymentModal(s)}
                              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-all shadow-md shadow-slate-900/20 font-bold text-sm active:scale-95"
                              title="Liquidar Deuda o Registrar Adelanto"
                            >
                              <Wallet size={18} /> Pagos
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        loading={loading}
        onPageChange={(newPage) => setPage(newPage)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      {isPaymentModalOpen && selectedSupplier && (
        <TreasuryPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedSupplier(null);
          }}
          supplierId={selectedSupplier.id}
          supplierName={selectedSupplier.name}
          onSuccess={() => loadBalances()}
        />
      )}
    </div>
  );
};

export default AccountsPayable;
