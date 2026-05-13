import {
  Clock,
  DollarSign,
  Gift,
  Lock,
  Printer,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";
import PosHeader from "./components/PosHeader";

interface SaleDetail {
  product?: { name: string };
  product_name?: string;
  quantity: number | string;
  price: string;
}

interface Sale {
  id: number;
  series: string;
  number: string;
  total: string;
  date: string;
  status: string;
  invoice_type_code: string;
  is_courtesy?: boolean;
  credit_notes?: any[];
  details?: SaleDetail[];
  // Si tu backend devuelve quién autorizó (user_name o supervisor_name), lo puedes usar
  authorized_by?: { first_name: string; last_name: string } | string;
}

const PosReports = () => {
  const { currentBranch } = useBranch();
  const { user } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
  const [courtesies, setCourtesies] = useState<Sale[]>([]); // 👈 NUEVO: Estado para cortesías
  const [loading, setLoading] = useState(true);

  // Seguridad: Solo gerentes o admins
  const isManager =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  useEffect(() => {
    const fetchShiftData = async () => {
      if (!currentBranch || !isManager) return;
      setLoading(true);
      try {
        const shiftRes = await api.get("/cash/shifts/current/");
        const shiftOpenDate = new Date(shiftRes.data.opened_at);

        const response = await api.get(
          `/sales/sales/?branch_id=${currentBranch.id}&ordering=-date`,
        );
        const results = response.data.results || response.data;

        // Clasificamos las ventas del turno
        const validSales: Sale[] = [];
        const courtesySales: Sale[] = [];

        results.forEach((sale: Sale) => {
          const saleDate = new Date(sale.date);
          const isAnulada =
            sale.status === "CANCELED" ||
            (sale.credit_notes && sale.credit_notes.length > 0);

          // Si es del turno actual y NO está anulada
          if (saleDate >= shiftOpenDate && !isAnulada) {
            // 👈 NUEVO: Separamos las ventas reales de las cortesías
            if (sale.invoice_type_code === "99" || sale.is_courtesy) {
              courtesySales.push(sale);
            } else {
              validSales.push(sale);
            }
          }
        });

        setSales(validSales);
        setCourtesies(courtesySales); // Guardamos las cortesías
      } catch (error) {
        console.error("Error cargando reporte", error);
      } finally {
        setLoading(false);
      }
    };

    fetchShiftData();
  }, [currentBranch, isManager]);

  // --- CÁLCULOS MATEMÁTICOS (Ventas Reales) ---
  const totalGross = sales.reduce(
    (acc, sale) => acc + parseFloat(sale.total),
    0,
  );
  const totalNet = totalGross / 1.18;
  const totalTaxes = totalGross - totalNet;

  // --- CÁLCULOS MATEMÁTICOS (Cortesías) ---
  // Calculamos el costo "regalado" sumando los precios base de los detalles
  const totalCourtesyCost = courtesies.reduce((acc, sale) => {
    if (parseFloat(sale.total) > 0) return acc + parseFloat(sale.total);

    // Si el total es 0 (como debe ser en cortesías), sumamos el valor de sus items
    const itemsTotal =
      sale.details?.reduce(
        (sum, item) => sum + parseFloat(item.price) * Number(item.quantity),
        0,
      ) || 0;
    return acc + itemsTotal;
  }, 0);

  // Agrupar por hora (Solo ventas reales)
  const salesByHour = sales.reduce((acc: any, sale) => {
    const hour = new Date(sale.date).getHours();
    const hourStr = hour.toString().padStart(2, "0");
    const timeLabel = `${hourStr}:00 - ${hourStr}:59`;

    const gross = parseFloat(sale.total);
    const net = gross / 1.18;

    if (!acc[timeLabel])
      acc[timeLabel] = { count: 0, totalGross: 0, totalNet: 0 };
    acc[timeLabel].count += 1;
    acc[timeLabel].totalGross += gross;
    acc[timeLabel].totalNet += net;

    return acc;
  }, {});

  const hourlyData = Object.entries(salesByHour)
    .map(([time, data]: any) => ({ time, ...data }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // --- CÁLCULO DEL PRODUCT MIX (PMIX - Incluye Cortesías para cuadrar Kardex) ---
  const allTransactions = [...sales, ...courtesies];
  const productMix = allTransactions.reduce((acc: any, sale: any) => {
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

  // --- IMPRESIÓN ---
  const printPdfSilently = async (endpointUrl: string) => {
    try {
      const response = await api.get(endpointUrl, { responseType: "blob" });
      const pdfBlob = new Blob([response.data], { type: "application/pdf" });
      const pdfUrl = window.URL.createObjectURL(pdfBlob);

      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = pdfUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };

      setTimeout(() => {
        document.body.removeChild(iframe);
        window.URL.revokeObjectURL(pdfUrl);
      }, 60000);
    } catch (error) {
      alert(
        "❌ Error al intentar generar el ticket. Revisa tu conexión o sesión.",
      );
    }
  };

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

      <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6 custom-scrollbar">
        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse font-medium">
            Calculando métricas...
          </div>
        ) : (
          <>
            {/* TARJETAS RESUMEN - Ahora son 4 columnas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <DollarSign size={16} className="text-green-600" /> Venta
                  Bruta
                </div>
                <div className="text-3xl font-black text-slate-800 truncate">
                  S/ {totalGross.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Ingreso real a caja
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <TrendingUp size={16} className="text-blue-600" /> Venta Neta
                </div>
                <div className="text-3xl font-black text-slate-800 truncate">
                  S/ {totalNet.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  IGV Retenido: S/ {totalTaxes.toFixed(2)}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Clock size={16} className="text-orange-600" /> Transacciones
                </div>
                <div className="text-3xl font-black text-slate-800">
                  {sales.length}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Tickets y Facturas cobradas
                </div>
              </div>

              {/* 👇 NUEVA TARJETA: CORTESÍAS */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-200 bg-purple-50/30">
                <div className="flex items-center gap-2 text-purple-700 font-bold text-[11px] uppercase tracking-wider mb-2">
                  <Gift size={16} className="text-purple-600" /> Val. Cortesías
                </div>
                <div className="text-3xl font-black text-purple-800 truncate">
                  S/ {totalCourtesyCost.toFixed(2)}
                </div>
                <div className="text-[10px] text-purple-500 mt-1">
                  {courtesies.length} tickets regalados / consumo
                </div>
              </div>
            </div>

            {/* TABLAS - Primera fila */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* 1. TABLA DE DESGLOSE POR HORA */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">
                    Desglose por Hora
                  </h3>
                  <button
                    onClick={() =>
                      printPdfSilently("/sales/reports/hourly/print/")
                    }
                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Printer size={18} />
                  </button>
                </div>
                <div className="p-0 overflow-x-auto max-h-[300px] custom-scrollbar">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 shadow-sm">
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
                      onClick={() =>
                        printPdfSilently("/sales/reports/pmix/print/")
                      }
                      className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Printer size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-0 overflow-x-auto max-h-[300px] custom-scrollbar">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 shadow-sm">
                      <tr>
                        <th className="p-4 font-bold">Producto</th>
                        <th className="p-4 font-bold text-right">
                          Cant. Saliente
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

            {/* 👇 NUEVO: 3. TABLA DE DESGLOSE DE CORTESÍAS */}
            <div className="bg-white rounded-2xl shadow-sm border border-purple-200 overflow-hidden mb-8">
              {/* CABECERA CON BOTÓN DE IMPRESIÓN */}
              <div className="p-4 border-b border-purple-100 bg-purple-50 flex justify-between items-center">
                <h3 className="font-bold text-purple-800 flex items-center gap-2">
                  <Gift size={18} /> Detalle de Cortesías y Consumos
                </h3>
                <button
                  onClick={() =>
                    printPdfSilently("/sales/reports/courtesies/print/")
                  }
                  className="p-1.5 text-purple-500 hover:text-purple-800 hover:bg-purple-200 rounded-lg transition-colors"
                  title="Imprimir Reporte de Cortesías"
                >
                  <Printer size={18} />
                </button>
              </div>
              <div className="p-0 overflow-x-auto max-h-[300px] custom-scrollbar">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-white text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 shadow-sm">
                    <tr>
                      <th className="p-4 font-bold">Ticket</th>
                      <th className="p-4 font-bold">Hora</th>
                      <th className="p-4 font-bold">Productos Entregados</th>
                      <th className="p-4 font-bold text-right">
                        Valor Asumido
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {courtesies.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-8 text-center text-slate-400"
                        >
                          No se registraron cortesías en este turno.
                        </td>
                      </tr>
                    ) : (
                      courtesies.map((sale, index) => {
                        // Calcular valor de los items de este ticket
                        const itemsCost =
                          sale.details?.reduce(
                            (sum, item) =>
                              sum +
                              parseFloat(item.price) * Number(item.quantity),
                            0,
                          ) || 0;
                        const itemsList = sale.details
                          ?.map(
                            (d) =>
                              `${d.quantity}x ${d.product?.name || d.product_name}`,
                          )
                          .join(", ");

                        return (
                          <tr
                            key={index}
                            className="hover:bg-purple-50/30 transition-colors"
                          >
                            <td className="p-4 font-bold text-slate-700 whitespace-nowrap">
                              {sale.series}-{sale.number}
                            </td>
                            <td className="p-4 text-slate-500 whitespace-nowrap">
                              {new Date(sale.date).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="p-4 text-slate-500 text-xs italic">
                              {itemsList || "Sin detalles"}
                            </td>
                            <td className="p-4 text-right font-black text-purple-700 whitespace-nowrap">
                              S/ {itemsCost.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
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
