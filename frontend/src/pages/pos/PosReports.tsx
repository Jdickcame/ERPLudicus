import { Clock, DollarSign, Lock, Printer, TrendingUp } from "lucide-react";
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
    const hourStr = hour.toString().padStart(2, "0");
    const timeLabel = `${hourStr}:00 - ${hourStr}:59`;

    const gross = parseFloat(sale.total);
    const net = gross / 1.18; // Cálculo sin IGV

    if (!acc[timeLabel])
      acc[timeLabel] = { count: 0, totalGross: 0, totalNet: 0 };
    acc[timeLabel].count += 1;
    acc[timeLabel].totalGross += gross;
    acc[timeLabel].totalNet += net;

    return acc;
  }, {});

  // Convertimos el objeto a un arreglo y lo ordenamos por hora
  const hourlyData = Object.entries(salesByHour)
    .map(([time, data]: any) => ({ time, ...data }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // --- CÁLCULO DEL PRODUCT MIX (PMIX) ---
  // (Este lo dejas tal cual, ya que la matemática de cantidades funciona perfecto)
  const productMix = sales.reduce((acc: any, sale: any) => {
    if (sale.details && Array.isArray(sale.details)) {
      sale.details.forEach((detail: any) => {
        const productName =
          detail.product?.name || detail.product_name || "Producto Desconocido";
        const qty = parseFloat(detail.quantity);

        if (!acc[productName]) {
          acc[productName] = { qty: 0 };
        }
        acc[productName].qty += qty;
      });
    }
    return acc;
  }, {});

  const pmixData = Object.entries(productMix)
    .map(([name, data]: any) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty);

  // --- FUNCIONES DE IMPRESIÓN (MODO SILENCIOSO) ---
  const printPdfSilently = async (endpointUrl: string) => {
    try {
      // 1. Pedimos el PDF al backend (importante el responseType: "blob")
      const response = await api.get(endpointUrl, { responseType: "blob" });

      // 2. Creamos un archivo temporal en la memoria del navegador
      const pdfBlob = new Blob([response.data], { type: "application/pdf" });
      const pdfUrl = window.URL.createObjectURL(pdfBlob);

      // 3. Creamos una ventana invisible (iframe)
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = pdfUrl;
      document.body.appendChild(iframe);

      // 4. Cuando el PDF cargue oculto, disparamos la ticketera
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };

      // 5. Limpiamos la basura de la memoria después de 1 minuto
      setTimeout(() => {
        document.body.removeChild(iframe);
        window.URL.revokeObjectURL(pdfUrl);
      }, 60000);
    } catch (error) {
      console.error("Error imprimiendo:", error);
      alert(
        "❌ Error al intentar generar el ticket. Revisa tu conexión o sesión.",
      );
    }
  };

  // 👇 Ahora simplemente conectamos cada botón a su URL respectiva en Django
  const handlePrintHourlyReport = () => {
    // Asegúrate de que esta ruta coincida exactamente con tu urls.py
    printPdfSilently("/sales/reports/hourly/print/");
  };

  const handlePrintPmixReport = () => {
    // Asegúrate de que esta ruta coincida exactamente con tu urls.py
    printPdfSilently("/sales/reports/pmix/print/");
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

            {/* ENVOLTURA GRID DE 2 COLUMNAS PARA LAS TABLAS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 items-start">
              {/* 1. TABLA DE DESGLOSE POR HORA */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">
                    Desglose por Hora
                  </h3>
                  <button
                    onClick={handlePrintHourlyReport}
                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Imprimir Desglose"
                  >
                    <Printer size={18} />
                  </button>
                </div>
                <div className="p-0 overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-4 font-bold">Rango de Hora</th>
                        <th className="p-4 font-bold text-center">Tickets</th>
                        <th className="p-4 font-bold text-right">Bruto</th>
                        <th className="p-4 font-bold text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {hourlyData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-8 text-center text-slate-400"
                          >
                            Sin transacciones aún.
                          </td>
                        </tr>
                      ) : (
                        hourlyData.map((data: any, index) => (
                          <tr
                            key={index}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="p-4 font-bold text-slate-700 flex items-center gap-2 whitespace-nowrap">
                              <Clock size={14} className="text-slate-400" />{" "}
                              {data.time}
                            </td>
                            <td className="p-4 text-center font-medium">
                              <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-600 text-xs">
                                {data.count}
                              </span>
                            </td>
                            <td className="p-4 text-right font-bold text-blue-600 whitespace-nowrap">
                              S/ {data.totalGross.toFixed(2)}
                            </td>
                            <td className="p-4 text-right font-bold text-emerald-600 whitespace-nowrap">
                              S/ {data.totalNet.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. TABLA DE PRODUCT MIX (PMIX) */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-700">
                    Mix de Productos (PMIX)
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-white px-2 py-1 rounded border border-slate-200">
                      Top Ventas
                    </span>
                    <button
                      onClick={handlePrintPmixReport}
                      className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Imprimir PMIX"
                    >
                      <Printer size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-0 overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-4 font-bold">Producto</th>
                        <th className="p-4 font-bold text-right">
                          Cant. Vendida
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pmixData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={2}
                            className="p-8 text-center text-slate-400"
                          >
                            No hay productos registrados.
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
                            <td className="p-4 text-right font-medium">
                              <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold">
                                {item.qty}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PosReports;
