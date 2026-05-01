import { Calendar, DollarSign, List, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";

interface ExchangeRate {
  id: number;
  date: string;
  buy_rate: string;
  sell_rate: string;
}

const ExchangeRates = () => {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    next: null,
    prev: null,
    count: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // Estado para el tamaño de página

  // Formulario
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    buy_rate: "",
    sell_rate: "",
  });

  // --- CARGAR HISTORIAL ---
  const fetchRates = async (page = 1, size = pageSize) => {
    setLoading(true);
    try {
      // Enviamos page y page_size a la API
      const res = await api.get(
        `/exchange-rate/?page=${page}&page_size=${size}`,
      );

      setRates(res.data.results || []);
      setPagination({
        next: res.data.next,
        prev: res.data.previous,
        count: res.data.count,
      });
      setCurrentPage(page);
    } catch (error) {
      console.error("Error cargando tasas", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  // --- GUARDAR ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.buy_rate || !form.sell_rate) return alert("Completa los campos");

    try {
      await api.post("/exchange-rate/", form);
      alert("¡Tipo de cambio guardado!");
      fetchRates(1, pageSize); // Recargar desde la pag 1
      setForm({ ...form, buy_rate: "", sell_rate: "" });
    } catch (error: any) {
      alert(
        "Error: " +
          (error.response?.data?.detail ||
            "Quizás ya existe tasa para esta fecha"),
      );
    }
  };

  // --- ELIMINAR ---
  const handleDelete = async (id: number) => {
    if (!confirm("¿Borrar este registro?")) return;
    try {
      await api.delete(`/exchange-rate/${id}/`);
      fetchRates(currentPage, pageSize);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto animate-in fade-in">
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <DollarSign className="text-green-600" /> Historial de Tipo de Cambio
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. FORMULARIO DE REGISTRO */}
        <div className="md:col-span-1">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 sticky top-6">
            <h2 className="font-bold text-slate-700 mb-4 border-b pb-2">
              Registrar / Corregir
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Fecha
                </label>
                <input
                  type="date"
                  className="w-full border p-2 rounded mt-1 focus:ring-2 focus:ring-green-200 outline-none"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Compra
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    className="w-full border p-2 rounded mt-1 text-right"
                    value={form.buy_rate}
                    onChange={(e) =>
                      setForm({ ...form, buy_rate: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Venta
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    className="w-full border p-2 rounded mt-1 text-right font-bold text-slate-700"
                    value={form.sell_rate}
                    onChange={(e) =>
                      setForm({ ...form, sell_rate: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 flex justify-center items-center gap-2 mt-2 transition-colors"
              >
                <Save size={18} /> Guardar Tasa
              </button>
            </form>
          </div>
        </div>

        {/* 2. TABLA DE HISTORIAL */}
        <div className="md:col-span-2 space-y-4">
          {/* Selector de Tamaño de Página */}
          <div className="flex justify-end items-center gap-2 text-xs text-slate-500">
            <List size={14} />
            <span>Mostrar:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setPageSize(newSize);
                fetchRates(1, newSize);
              }}
              className="border rounded p-1 outline-none bg-white font-medium text-slate-700"
            >
              <option value={10}>10 días</option>
              <option value={20}>20 días</option>
              <option value={50}>50 días</option>
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3 text-right">Compra</th>
                  <th className="p-3 text-right">Venta (Oficial)</th>
                  <th className="p-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center">
                      Cargando...
                    </td>
                  </tr>
                ) : rates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">
                      No hay datos registrados
                    </td>
                  </tr>
                ) : (
                  rates.map((rate) => (
                    <tr key={rate.id} className="hover:bg-slate-50">
                      <td className="p-3 font-medium flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        {rate.date}
                      </td>
                      <td className="p-3 text-right text-slate-600">
                        {Number(rate.buy_rate).toFixed(3)}
                      </td>
                      <td className="p-3 text-right font-bold text-green-700">
                        {Number(rate.sell_rate).toFixed(3)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDelete(rate.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* 🔢 CONTROLES DE PAGINACIÓN */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">
                Total: <b>{pagination.count}</b> registros
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchRates(currentPage - 1)}
                  disabled={!pagination.prev || loading}
                  className="px-3 py-1 bg-white border rounded text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                  Anterior
                </button>
                <span className="px-3 py-1 text-sm font-bold text-blue-600 bg-blue-50 rounded">
                  {currentPage}
                </span>
                <button
                  onClick={() => fetchRates(currentPage + 1)}
                  disabled={!pagination.next || loading}
                  className="px-3 py-1 bg-white border rounded text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExchangeRates;
