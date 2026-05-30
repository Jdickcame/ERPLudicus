import { CalendarPlus, ChevronRight, Pencil, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

const EventListPage = () => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentBranch) return;
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await api.get(
          `/events/events/?branch_id=${currentBranch.id}`,
        );
        setEvents(res.data.results || res.data);
      } catch (error) {
        console.error("Error cargando eventos", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [currentBranch]);

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            Mis Eventos
          </h1>
          <p className="text-slate-500 font-medium">
            Panel de control y finanzas de eventos
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <BranchSelector />
          <button
            onClick={() => navigate("/events/create")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition shadow-md"
          >
            <CalendarPlus size={20} /> Crear Evento
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20 text-slate-400">
          Cargando eventos...
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-500">
          No hay eventos registrados en esta sede.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow overflow-hidden flex flex-col relative group"
            >
              <div className="p-5 border-b border-slate-100 flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-slate-800 line-clamp-2 pr-2">
                    {ev.name}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                        ev.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {ev.is_active ? "Activo" : "Cerrado"}
                    </span>
                    {/* 👇 NUEVO BOTÓN DE EDITAR 👇 */}
                    <button
                      onClick={() => navigate(`/events/${ev.id}/edit`)}
                      className="text-slate-400 hover:text-orange-500 bg-slate-50 hover:bg-orange-50 p-1.5 rounded-lg transition-all border border-slate-100 hover:border-orange-200"
                      title="Editar Configuración del Evento"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-500 font-medium">
                  {ev.date ? `📅 Fecha: ${ev.date}` : "📅 Evento Permanente"}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      Recaudación Bruta
                    </p>
                    <p className="text-lg font-black text-blue-600 flex items-center gap-1">
                      {parseFloat(ev.total_gross).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      Base Neta
                    </p>
                    <p className="text-lg font-black text-emerald-600 flex items-center gap-1">
                      <span className="text-sm">S/</span>{" "}
                      {parseFloat(ev.total_net).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 flex justify-between items-center">
                <div className="flex items-center gap-2 text-slate-500 text-sm font-bold">
                  <Users size={18} /> {ev.registered_count} Asistentes
                </div>
                <button
                  onClick={() => navigate(`/events/${ev.id}/taquilla`)}
                  className="text-blue-600 hover:text-blue-800 font-black text-sm flex items-center gap-1 hover:translate-x-1 transition-transform"
                >
                  Abrir Taquilla <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventListPage;
