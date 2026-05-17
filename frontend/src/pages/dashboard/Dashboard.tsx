import {
  AlertTriangle,
  Calendar,
  DollarSign,
  Package,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import EmptyDashboard from "../../components/dashboard/EmptyDashboard";
import { useBranch } from "../../context/BranchContext";

const KPICard = ({ title, value, subtitle, icon: Icon, color }: any) => (
  <div className="bg-white p-4 xl:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between gap-3 animate-in fade-in duration-500 hover:shadow-md transition-shadow">
    <div className="flex-1 min-w-0">
      {/* line-clamp-2 permite que el título use 2 líneas si es necesario (ej: Compras del Periodo) en vez de cortarse */}
      <p className="text-[11px] xl:text-xs text-slate-500 font-bold uppercase tracking-wider line-clamp-2 leading-tight">
        {title}
      </p>

      {/* Quitamos truncate, usamos whitespace-nowrap para que no se parta, y tracking-tight para apretar los números */}
      <h3 className="text-xl lg:text-2xl 2xl:text-3xl font-black text-slate-800 mt-1 tracking-tight whitespace-nowrap">
        {value}
      </h3>

      {subtitle && (
        <p className="text-[10px] xl:text-[11px] text-slate-400 mt-1 font-medium whitespace-nowrap">
          {subtitle}
        </p>
      )}
    </div>

    {/* Reducimos un poquito el tamaño del ícono y su fondo para darle más respiro al número */}
    <div className={`p-3 rounded-full ${color} bg-opacity-10 shrink-0`}>
      <Icon
        size={24}
        className={color.replace("bg-", "text-").replace("-500", "-600")}
      />
    </div>
  </div>
);

const Dashboard = () => {
  const { currentBranch } = useBranch();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 👇 NUEVO: Estados para manejar el Periodo Contable (Mes y Año actual por defecto)
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  // Lista de meses para el selector
  const months = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  useEffect(() => {
    if (!currentBranch) return;

    const loadStats = async () => {
      setLoading(true);
      try {
        // 👇 NUEVO: Enviamos el año y el mes al backend
        const res = await api.get(
          `/reports/dashboard/?branch_id=${currentBranch.id}&year=${selectedYear}&month=${selectedMonth}`,
        );
        setData(res.data);
      } catch (error) {
        console.error("Error loading stats", error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [currentBranch, selectedYear, selectedMonth]); // Se recarga si cambias de sede, mes o año

  if (!currentBranch) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4 animate-in fade-in">
        <div className="p-8 text-center bg-white shadow-sm rounded-xl border border-slate-200 max-w-md">
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            ¡Bienvenido al ERP!
          </h2>
          <p className="text-slate-500 mb-6 text-sm">
            Para ver las métricas financieras, primero debes seleccionar una
            sede operativa.
          </p>
          <div className="flex justify-center">
            <BranchSelector />
          </div>
        </div>
      </div>
    );
  }

  // Permite ver la interfaz aunque esté cargando (efecto más suave)
  const isDashboardEmpty =
    !loading &&
    data &&
    Number(data.kpis?.total_sales || 0) === 0 &&
    Number(data.kpis?.total_purchases || 0) === 0 &&
    Number(data.kpis?.product_count || 0) === 0;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* CABECERA Y FILTROS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-2.5 rounded-lg">
            <TrendingUp className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">
              Panel de Resultados
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Análisis financiero de la sede actual
            </p>
          </div>
        </div>

        {/* 👇 NUEVO: Panel de Selectores (Sede y Periodo) */}
        <div className="flex flex-wrap items-center gap-3">
          <BranchSelector />
          <div className="h-6 w-px bg-slate-200 hidden md:block"></div>{" "}
          {/* Separador */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Calendar size={16} className="text-slate-500" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value={currentDate.getFullYear()}>
                {currentDate.getFullYear()}
              </option>
              <option value={currentDate.getFullYear() - 1}>
                {currentDate.getFullYear() - 1}
              </option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-blue-600 flex flex-col items-center justify-center h-[40vh]">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="font-medium animate-pulse">
            Calculando métricas del periodo...
          </p>
        </div>
      ) : isDashboardEmpty ? (
        <EmptyDashboard />
      ) : data ? (
        <>
          {/* KPIs Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard
              title="Ventas (Bruto)"
              value={`S/ ${Number(data.kpis?.total_sales_gross || data.kpis?.total_sales || 0).toFixed(2)}`}
              subtitle={`Neto: S/ ${Number(data.kpis?.total_sales_net || 0).toFixed(2)}`}
              icon={DollarSign}
              color="bg-green-500"
            />
            <KPICard
              title="Compras del Periodo"
              value={`S/ ${Number(data.kpis?.total_purchases_gross || data.kpis?.total_purchases || 0).toFixed(2)}`}
              subtitle={`Neto: S/ ${Number(data.kpis?.total_purchases_net || 0).toFixed(2)}`}
              icon={ShoppingBag}
              color="bg-blue-500"
            />
            <KPICard
              title="Productos en Sede"
              value={data.kpis?.product_count || 0}
              subtitle="Stock Activo"
              icon={Package}
              color="bg-purple-500"
            />
            <KPICard
              title="Alertas de Stock"
              value={data.kpis?.low_stock_count || 0}
              subtitle="Productos por agotarse"
              icon={AlertTriangle}
              color={
                (data.kpis?.low_stock_count || 0) > 0
                  ? "bg-red-500"
                  : "bg-slate-400"
              }
            />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GRÁFICO 1: VENTAS DIARIAS */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="font-bold text-slate-800 text-lg">
                  Evolución Diaria de Ingresos
                </h3>
                <p className="text-xs text-slate-500">
                  Valor Neto vs Bruto en el periodo seleccionado
                </p>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.sales_chart || []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    {/* Cambiamos 'month' por 'day' ya que ahora vemos días */}
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) =>
                        `S/${val >= 1000 ? (val / 1000).toFixed(1) + "k" : val}`
                      }
                    />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                      }}
                      formatter={(value: any, name: any) => [
                        `S/ ${Number(value).toFixed(2)}`,
                        name === "total_bruto"
                          ? "Venta Bruta (Inc. IGV)"
                          : "Venta Neta (Sin IGV)",
                      ]}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "12px", fontWeight: 500 }}
                    />
                    <Bar
                      name="total_bruto"
                      dataKey="total_bruto"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                      barSize={12}
                    />
                    <Bar
                      name="total_neto"
                      dataKey="total_neto"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      barSize={12}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GRÁFICO 2: TOP PRODUCTOS */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="font-bold text-slate-800 text-lg">
                  Top 5 Productos Estrella
                </h3>
                <p className="text-xs text-slate-500">
                  Los artículos con mayor rotación en este periodo
                </p>
              </div>
              <div className="h-80 w-full">
                {data.top_products && data.top_products.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.top_products}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="product__name"
                        type="category"
                        width={120}
                        tick={{
                          fontSize: 11,
                          fill: "#475569",
                          fontWeight: 600,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={{
                          borderRadius: "12px",
                          border: "none",
                          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                        }}
                        formatter={(val) => [
                          `${val} Unidades`,
                          "Cantidad Vendida",
                        ]}
                      />
                      <Bar
                        dataKey="total_sold"
                        fill="#6366f1"
                        radius={[0, 6, 6, 0]}
                        barSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <Package size={48} className="mb-3 opacity-20" />
                    <p className="text-sm font-medium">
                      No hay ventas registradas aún
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default Dashboard;
