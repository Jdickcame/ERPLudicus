import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

const Pagination = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false,
}: PaginationProps) => {
  // Cálculo visual de los registros actuales (Ej: Mostrando 1 al 20 de 501)
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
      {/* LADO IZQUIERDO: Selector de tamaño e Info */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 w-full md:w-auto justify-center md:justify-start">
        <div className="flex items-center gap-2">
          <span>Mostrar</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
            className="border border-slate-300 rounded-lg p-1.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer disabled:opacity-50 text-slate-700 font-medium transition-all"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>registros</span>
        </div>

        <div className="hidden md:block border-l border-slate-300 h-5"></div>

        <div>
          {totalCount > 0 ? (
            <span>
              Viendo <b className="text-slate-800">{startItem}</b> -{" "}
              <b className="text-slate-800">{endItem}</b> de{" "}
              <b className="text-slate-800">{totalCount}</b>
            </span>
          ) : (
            <span>No hay registros</span>
          )}
        </div>
      </div>

      {/* LADO DERECHO: Navegación de páginas */}
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        <div className="text-sm font-medium text-slate-500">
          Página <b className="text-slate-800">{currentPage}</b> de{" "}
          <b className="text-slate-800">{totalPages || 1}</b>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1 || loading}
            className="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-all text-slate-600 bg-white shadow-sm"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0 || loading}
            className="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-all text-slate-600 bg-white shadow-sm"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
