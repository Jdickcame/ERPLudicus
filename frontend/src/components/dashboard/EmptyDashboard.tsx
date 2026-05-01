import { BarChart3, CreditCard, Package } from "lucide-react";
import { Link } from "react-router-dom";

const EmptyDashboard = () => {
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-in fade-in zoom-in duration-500">
      {/* Icono Principal */}
      <div className="bg-slate-50 p-6 rounded-full mb-6 border-4 border-white shadow-xl">
        <BarChart3 size={64} className="text-slate-300" />
      </div>

      {/* Textos */}
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        Aún no hay datos en esta Sede
      </h2>
      <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
        El panel de estadísticas se activará automáticamente cuando empieces a
        registrar movimientos. ¿Por dónde te gustaría comenzar?
      </p>

      {/* Botones de Acción Rápida */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
        <Link
          to="/inventory/new"
          className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition group text-left"
        >
          <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-600 transition-colors">
            <Package
              className="text-blue-600 group-hover:text-white"
              size={24}
            />
          </div>
          <div>
            <span className="block font-bold text-slate-700">
              Crear Producto
            </span>
            <span className="text-xs text-slate-400">Llena tu inventario</span>
          </div>
        </Link>

        <Link
          to="/pos"
          className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-green-300 hover:shadow-md transition group text-left"
        >
          <div className="bg-green-50 p-3 rounded-lg group-hover:bg-green-600 transition-colors">
            <CreditCard
              className="text-green-600 group-hover:text-white"
              size={24}
            />
          </div>
          <div>
            <span className="block font-bold text-slate-700">Nueva Venta</span>
            <span className="text-xs text-slate-400">Ir al Punto de Venta</span>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default EmptyDashboard;
