import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import PaymentModal from "../../components/purchases/PaymentModal";
import { useBranch } from "../../context/BranchContext";

// 1. Actualizamos la interfaz para recibir la fecha
interface SupplierDebt {
  supplier: number;
  supplier__name: string;
  supplier__tax_id: string;
  total_debt: number;
  count: number;
  next_due_date?: string; // 👈 Campo nuevo (Vencimiento más próximo)
}

const AccountsPayable = () => {
  const { currentBranch } = useBranch();

  // Estados de datos
  const [debts, setDebts] = useState<SupplierDebt[]>([]);
  const [totalDebtGlobal, setTotalDebtGlobal] = useState(0); // Estado separado para el total global

  // Estados de carga y paginación
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [modalData, setModalData] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // --- CARGAR DEUDAS (Con Paginación) ---
  const loadDebts = useCallback(
    async (pageToLoad = 1, isRefresh = false) => {
      if (!currentBranch) return;

      if (pageToLoad === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        // Asumimos que tu backend soporta ?page=X
        const res = await api.get(
          `/purchases/suppliers/with_debt/?branch_id=${currentBranch.id}&page=${pageToLoad}`,
        );

        // Detectar si la respuesta es paginada (DRF standard) o lista plana
        const newData = res.data.results || res.data;
        const totalGlobal = res.data.total_global_debt || 0; // Ideal si el backend manda el total aparte

        if (isRefresh || pageToLoad === 1) {
          setDebts(newData);
          // Si el backend no manda total global, lo calculamos (solo aproximado de la 1ra pagina)
          // Lo ideal es que el backend mande un campo "total_debt_global"
          setTotalDebtGlobal(
            totalGlobal > 0
              ? totalGlobal
              : newData.reduce(
                  (acc: any, curr: any) => acc + curr.total_debt,
                  0,
                ),
          );
        } else {
          setDebts((prev) => [...prev, ...newData]);
        }

        // Verificar si hay más páginas
        if (!res.data.next && Array.isArray(newData)) {
          // Si es lista plana o llegamos al final
          setHasMore(false);
        } else if (res.data.next) {
          setHasMore(true);
        } else {
          // Fallback si no hay paginación explicita
          setHasMore(newData.length > 0);
        }

        setPage(pageToLoad);
      } catch (error) {
        console.error("Error cargando deudas", error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [currentBranch],
  );

  // Resetear al cambiar de sede
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    loadDebts(1, true);
  }, [loadDebts]);

  // Función auxiliar para saber si la fecha ya venció
  const getDueDateStatus = (dateStr?: string) => {
    if (!dateStr)
      return {
        color: "text-slate-400",
        bg: "bg-slate-100",
        label: "Sin fecha",
      };

    const due = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0)
      return {
        color: "text-red-700",
        bg: "bg-red-100",
        label: `Venció hace ${Math.abs(diffDays)} días`,
      };
    if (diffDays === 0)
      return {
        color: "text-orange-700",
        bg: "bg-orange-100",
        label: "Vence HOY",
      };
    if (diffDays <= 3)
      return {
        color: "text-orange-600",
        bg: "bg-orange-50",
        label: `Vence en ${diffDays} días`,
      };
    return { color: "text-green-700", bg: "bg-green-50", label: dateStr };
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="text-red-500" /> Cuentas por Pagar
          </h1>
          <p className="text-slate-500">
            Gestión de deuda a proveedores en {currentBranch?.name}
          </p>
        </div>
        <BranchSelector />
      </div>

      {/* TARJETA DE RESUMEN TOTAL */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl mb-8 flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
        {/* Adorno de fondo */}
        <div className="absolute -right-10 -top-10 text-slate-800 opacity-50">
          <Wallet size={150} />
        </div>

        <div className="relative z-10">
          <p className="text-slate-400 font-medium mb-1 uppercase tracking-wider text-xs flex items-center gap-2">
            Deuda Total Pendiente
          </p>
          <h2 className="text-4xl font-black tracking-tight">
            S/{" "}
            {totalDebtGlobal.toLocaleString("es-PE", {
              minimumFractionDigits: 2,
            })}
          </h2>
        </div>
        <div className="relative z-10 mt-4 md:mt-0 bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10">
          <span className="font-bold text-white text-lg">{debts.length}</span>{" "}
          <span className="text-slate-300 text-sm">Proveedores listados</span>
        </div>
      </div>

      {/* LISTA DE PROVEEDORES DEUDORES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-20">
            <Loader2 className="animate-spin text-blue-600" size={40} />
          </div>
        ) : debts.length === 0 ? (
          <div className="col-span-full text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Building2 size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-600">¡Todo al día!</h3>
            <p className="text-slate-400">
              No tienes deudas pendientes registradas en esta sede.
            </p>
          </div>
        ) : (
          <>
            {debts.map((item) => {
              const status = getDueDateStatus(item.next_due_date);
              return (
                <div
                  key={item.supplier}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg transition-all group overflow-hidden flex flex-col h-full"
                >
                  <div className="p-5 flex-1">
                    <div className="flex justify-between items-start mb-3">
                      <div className="bg-slate-50 p-2 rounded-lg text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <Building2 size={24} />
                      </div>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200">
                        {item.count} DOCS
                      </span>
                    </div>

                    <h3
                      className="font-bold text-slate-800 text-lg mb-1 line-clamp-1"
                      title={item.supplier__name}
                    >
                      {item.supplier__name}
                    </h3>
                    <p className="text-xs text-slate-400 mb-4 font-mono">
                      {item.supplier__tax_id}
                    </p>

                    {/* 🔥 FECHA DE VENCIMIENTO */}
                    {item.next_due_date && (
                      <div
                        className={`text-xs px-2 py-1.5 rounded-md inline-flex items-center gap-1.5 font-medium ${status.bg} ${status.color}`}
                      >
                        <Calendar size={12} />
                        {status.label}
                      </div>
                    )}
                  </div>

                  {/* FOOTER DE LA TARJETA */}
                  <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        Total a Pagar
                      </p>
                      <p className="text-xl font-black text-slate-800">
                        S/{" "}
                        {item.total_debt.toLocaleString("es-PE", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setModalData({
                          id: item.supplier,
                          name: item.supplier__name,
                        })
                      }
                      className="bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-200 group-hover:scale-105"
                      title="Registrar Pago"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* BOTÓN CARGAR MÁS (LAZY LOAD MANUAL) */}
            {hasMore && (
              <div className="col-span-full flex justify-center mt-4">
                <button
                  onClick={() => loadDebts(page + 1)}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-300 rounded-full text-slate-600 font-bold hover:bg-slate-50 hover:text-blue-600 transition disabled:opacity-50 shadow-sm"
                >
                  {loadingMore ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                  {loadingMore ? "Cargando..." : "Cargar más proveedores"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL DE PAGO */}
      {modalData && (
        <PaymentModal
          isOpen={true}
          onClose={() => setModalData(null)}
          supplierId={modalData.id}
          supplierName={modalData.name}
          onSuccess={() => {
            setPage(1); // Resetear al pagar para refrescar datos
            loadDebts(1, true);
          }}
        />
      )}
    </div>
  );
};

export default AccountsPayable;
