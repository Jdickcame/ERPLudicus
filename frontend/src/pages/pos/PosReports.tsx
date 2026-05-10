import {
    BarChart3,
    Clock,
    DollarSign,
    Lock,
    Printer,
    TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";
import PosHeader from "./components/PosHeader";

interface Sale {
  id: number;
  total: string;
  date: string;
  status: string;
  credit_notes?: any[];
}

const PosReports = () => {
  const { currentBranch } = useBranch();
  const { user } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Seguridad: Solo gerentes o admins
  const isManager =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  useEffect(() => {
    const fetchShiftData = async () => {
      if (!currentBranch || !isManager) return;
      setLoading(true);
      try {
        // 1. Traemos el turno actual
        const shiftRes = await api.get("/cash/shifts/current/");
        const shiftOpenDate = new Date(shiftRes.data.opened_at);

        // 2. Traemos las ventas
        const response = await api.get(
          `/sales/sales/?branch_id=${currentBranch.id}&ordering=-date`,
        );
        const results = response.data.results || response.data;

        // 3. Filtramos ventas válidas (no anuladas) y solo del turno actual
        const validSales = results.filter((sale: Sale) => {
          const saleDate = new Date(sale.date);

          // La misma validación robusta que usamos en tu Historial
          const isAnulada =
            sale.status === "CANCELED" ||
            (sale.credit_notes && sale.credit_notes.length > 0);

          // Retornamos solo las que son de este turno Y no están anuladas
          return saleDate >= shiftOpenDate && !isAnulada;
        });

        setSales(validSales);
      } catch (error) {
        console.error("Error cargando reporte", error);
      } finally {
        setLoading(false);
      }
    };

    fetchShiftData();
  }, [currentBranch, isManager]);

  // --- CÁLCULOS MATEMÁTICOS ---
  const totalGross = sales.reduce(
    (acc, sale) => acc + parseFloat(sale.total),
    0,
  );
  const totalNet = totalGross / 1.18; // Cálculo simplificado de Base Imponible (Sin IGV)
  const totalTaxes = totalGross - totalNet;

  // Agrupar por hora (ej. "14:00 - 15:00")
  const salesByHour = sales.reduce((acc: any, sale) => {
    const hour = new Date(sale.date).getHours();

    // Formateamos la hora para que siempre tenga 2 dígitos (ej. "09", "14")
    const hourStr = hour.toString().padStart(2, "0");

    // Creamos un rango súper claro
    const timeLabel = `${hourStr}:00 - ${hourStr}:59`;

    if (!acc[timeLabel]) acc[timeLabel] = { count: 0, total: 0 };
    acc[timeLabel].count += 1;
    acc[timeLabel].total += parseFloat(sale.total);
    return acc;
  }, {});

  // Convertimos el objeto a un arreglo y lo ordenamos por hora
  const hourlyData = Object.entries(salesByHour)
    .map(([time, data]: any) => ({ time, ...data }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // --- CÁLCULO DEL PRODUCT MIX (PMIX) ---
  const productMix = sales.reduce((acc: any, sale: any) => {
    // Verificamos si la venta trae sus detalles
    if (sale.details && Array.isArray(sale.details)) {
      sale.details.forEach((detail: any) => {
        // Ajusta esto dependiendo de cómo envíe el nombre tu backend
        const productName =
          detail.product?.name || detail.product_name || "Producto Desconocido";
        const qty = parseFloat(detail.quantity);
        const subtotal = parseFloat(detail.subtotal);

        if (!acc[productName]) {
          acc[productName] = { qty: 0, total: 0 };
        }
        acc[productName].qty += qty;
        acc[productName].total += subtotal;
      });
    }
    return acc;
  }, {});

  // Convertimos a arreglo y ordenamos de mayor a menor cantidad vendida (Top Ventas)
  const pmixData = Object.entries(productMix)
    .map(([name, data]: any) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty);

  // --- FUNCIÓN DE IMPRESIÓN ---
  const handlePrintXReport = async () => {
    // Aquí luego llamaremos a tu backend de Django para imprimir el ticket
    // Ejemplo: await api.get('/cash/shifts/current/print-x-report/');
    alert("Enviando reporte X a la ticketera... (Requiere endpoint en Django)");
  };

  // PANTALLA DE BLOQUEO DE SEGURIDAD
  if (!isManager) {
    return (
      <div className="h-screen flex flex-col bg-slate-100">
        <PosHeader />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <Lock size={64} className="mb-4 text-slate-300" />
          <h2 className="text-2xl font-black text-slate-700">
            Acceso Denegado
          </h2>
          <p>No tienes privilegios para ver los reportes de caja.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden font-sans">
      <PosHeader />

      <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-black flex items-center gap-2 text-slate-800">
            <BarChart3 className="text-blue-600" /> Reporte X (Turno Actual)
          </h1>
          <button
            onClick={handlePrintXReport}
            className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
          >
            <Printer size={18} /> IMPRIMIR REPORTE X
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse font-medium">
            Calculando métricas...
          </div>
        ) : (
          <>
            {/* TARJETAS RESUMEN */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 text-slate-500 font-bold text-sm uppercase tracking-wider mb-2">
                  <DollarSign size={18} className="text-green-600" /> Venta
                  Bruta (Total)
                </div>
                <div className="text-4xl font-black text-slate-800">
                  S/ {totalGross.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400 mt-2">Incluye IGV</div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 text-slate-500 font-bold text-sm uppercase tracking-wider mb-2">
                  <TrendingUp size={18} className="text-blue-600" /> Venta Neta
                </div>
                <div className="text-4xl font-black text-slate-800">
                  S/ {totalNet.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  IGV Retenido: S/ {totalTaxes.toFixed(2)}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 text-slate-500 font-bold text-sm uppercase tracking-wider mb-2">
                  <Clock size={18} className="text-orange-600" /> Transacciones
                </div>
                <div className="text-4xl font-black text-slate-800">
                  {sales.length}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Tickets emitidos hoy
                </div>
              </div>
            </div>

            {/* TABLA DE VENTAS POR HORA */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-700">
                  Desglose por Hora (Horas Pico)
                </h3>
              </div>
              <div className="p-0">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-400 uppercase text-xs">
                    <tr>
                      <th className="p-4 font-bold">Rango de Hora</th>
                      <th className="p-4 font-bold text-center">N° Tickets</th>
                      <th className="p-4 font-bold text-right">
                        Total Vendido
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {hourlyData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-8 text-center text-slate-400"
                        >
                          No hay ventas registradas en este turno.
                        </td>
                      </tr>
                    ) : (
                      hourlyData.map((data: any, index) => (
                        <tr
                          key={index}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-4 font-bold text-slate-700 flex items-center gap-2">
                            <Clock size={14} className="text-slate-400" />{" "}
                            {data.time}
                          </td>
                          <td className="p-4 text-center font-medium">
                            <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-600">
                              {data.count}
                            </span>
                          </td>
                          <td className="p-4 text-right font-black text-blue-600">
                            S/ {data.total.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABLA DE PRODUCT MIX (PMIX) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="font-bold text-slate-700">
                  Mix de Productos (PMIX)
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-white px-2 py-1 rounded border border-slate-200">
                  Ranking de Ventas
                </span>
              </div>
              <div className="p-0">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4 font-bold">Producto</th>
                      <th className="p-4 font-bold text-center">
                        Cant. Vendida
                      </th>
                      <th className="p-4 font-bold text-right">
                        Ingreso Generado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pmixData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-8 text-center text-slate-400"
                        >
                          No hay productos registrados o faltan detalles en la
                          venta.
                        </td>
                      </tr>
                    ) : (
                      pmixData.map((item: any, index: number) => (
                        <tr
                          key={index}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-4 font-bold text-slate-700">
                            {item.name}
                          </td>
                          <td className="p-4 text-center font-medium">
                            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold">
                              {item.qty}
                            </span>
                          </td>
                          <td className="p-4 text-right font-black text-slate-700">
                            S/ {item.total.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PosReports;
