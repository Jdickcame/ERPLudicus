import { DollarSign, Edit2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // 👈 Importar navegación
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";

const ExchangeRateWidget = () => {
  const { user } = useAuth();
  const navigate = useNavigate(); // 👈 Hook para navegar
  const [rate, setRate] = useState({ buy: "1.000", sell: "1.000" });
  const [loading, setLoading] = useState(false);

  const fetchRate = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/exchange-rate/");
      // Manejamos si viene como lista (ModelViewSet con o sin paginación)
      const results = data.results || data;

      if (Array.isArray(results) && results.length > 0) {
        setRate({
          buy: results[0].buy_rate,
          sell: results[0].sell_rate,
        });
      }
    } catch (error) {
      console.error("Error cargando TC", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRate();
  }, []);

  const isAdmin = user?.role === "ADMIN" || user?.is_superuser;

  return (
    <div className="mx-4 mt-auto mb-4 bg-slate-800/50 rounded-xl p-3 border border-slate-700 backdrop-blur-sm">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 text-orange-400 font-bold text-xs uppercase tracking-wider">
          <DollarSign size={14} /> Tipo de Cambio
        </div>

        {isAdmin && (
          <button
            onClick={() => navigate("/config/exchange-rates")} // 👈 AHORA NAVEGA A LA PÁGINA
            className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
            title="Gestionar historial y fechas"
          >
            <Edit2 size={12} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-2">
          <RefreshCw size={16} className="animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="flex justify-between items-center text-sm">
          <div className="flex flex-col">
            <span className="text-slate-400 text-[10px]">Compra</span>
            <span className="text-white font-mono font-bold">
              {Number(rate.buy).toFixed(3)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-700 mx-2"></div>
          <div className="flex flex-col items-end">
            <span className="text-slate-400 text-[10px]">Venta</span>
            <span className="text-white font-mono font-bold">
              {Number(rate.sell).toFixed(3)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExchangeRateWidget;
