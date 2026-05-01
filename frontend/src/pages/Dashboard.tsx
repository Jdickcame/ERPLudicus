import { AlertTriangle, DollarSign, Package, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/axios";
import BranchSelector from "../components/common/BranchSelector";
import EmptyDashboard from "../components/dashboard/EmptyDashboard";
import { useBranch } from "../context/BranchContext";

const KPICard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between animate-in fade-in duration-500">
    <div>
      <p className="text-sm text-slate-500 font-medium uppercase">{title}</p>
      <h3 className="text-3xl font-bold text-slate-800 mt-1">{value}</h3>
    </div>
    <div className={`p-4 rounded-full ${color}`}>
      <Icon size={24} className="text-white" />
    </div>
  </div>
);

const Dashboard = () => {
  const { currentBranch } = useBranch();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentBranch) return;

    const loadStats = async () => {
      setLoading(true);
      try {
        console.log(`📊 Cargando Dashboard para Sede ID: ${currentBranch.id}`);
        const res = await api.get(
          `/reports/dashboard/?branch_id=${currentBranch.id}`,
        );
        setData(res.data);
      } catch (error) {
        console.error("Error loading stats", error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [currentBranch]);

  // 1️⃣ ESTADO: NO HAY SEDE SELECCIONADA
  if (!currentBranch) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4 animate-in fade-in">
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 max-w-md">
          <h2 className="text-xl font-semibold text-slate-700 mb-2">
            ¡Bienvenido al ERP!
          </h2>
          <p className="text-slate-500 mb-6">
            Para ver las métricas y gráficos, primero debes seleccionar una
            sede.
          </p>
          <div className="flex justify-center">
            <BranchSelector />
          </div>
        </div>
      </div>
    );
  }

  // 2️⃣ ESTADO: CARGANDO
  if (loading) {
    return (
      <div className="p-10 text-center text-blue-600 animate-pulse flex flex-col items-center justify-center h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p>Cargando métricas de {currentBranch.name}...</p>
      </div>
    );
  }

  // 👇 LÓGICA CORREGIDA: Usamos 'data' en lugar de 'stats'
  const isDashboardEmpty =
    !loading &&
    data &&
    // Convertimos a Number por si el backend manda strings ("0.00")
    Number(data.kpis?.total_sales || 0) === 0 &&
    Number(data.kpis?.total_purchases || 0) === 0 &&
    Number(data.kpis?.product_count || 0) === 0;

  // 3️⃣ ESTADO: DASHBOARD VACÍO (Empty State)
  if (isDashboardEmpty) {
    return <EmptyDashboard />;
  }

  // Protección extra por si data es null aunque no esté cargando
  if (!data) return null;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">
            Panel de Control
          </h1>
          <BranchSelector />
        </div>

        <span className="text-sm text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
          Últimos 30 días
        </span>
      </div>

      {/* 4️⃣ KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Ventas Totales"
          value={`S/ ${Number(data.kpis?.total_sales || 0).toFixed(2)}`}
          icon={DollarSign}
          color="bg-green-500"
        />
        <KPICard
          title="Compras Totales"
          value={`S/ ${Number(data.kpis?.total_purchases || 0).toFixed(2)}`}
          icon={ShoppingBag}
          color="bg-blue-500"
        />
        <KPICard
          title="Productos en Sede"
          value={data.kpis?.product_count || 0}
          icon={Package}
          color="bg-purple-500"
        />
        <KPICard
          title="Stock Bajo (Alerta)"
          value={data.kpis?.low_stock_count || 0}
          icon={AlertTriangle}
          color={
            (data.kpis?.low_stock_count || 0) > 0
              ? "bg-red-500 animate-pulse"
              : "bg-slate-400"
          }
        />
      </div>

      {/* 5️⃣ Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Ventas */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-700 mb-4">
            Tendencia de Ventas (30 días)
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.sales_chart || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(str) =>
                    new Date(str).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} width={40} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px" }}
                  formatter={(value: any) => [
                    `S/ ${Number(value).toFixed(2)}`,
                    "Venta",
                  ]}
                  labelFormatter={(label) =>
                    new Date(label).toLocaleDateString()
                  }
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#2563eb"
                  strokeWidth={3}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Top Productos */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-700 mb-4">
            Top 5 Productos Más Vendidos
          </h3>
          <div className="h-80 w-full">
            {data.top_products && data.top_products.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.top_products}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="product__name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip cursor={{ fill: "transparent" }} />
                  <Bar
                    dataKey="total_sold"
                    fill="#8b5cf6"
                    radius={[0, 4, 4, 0]}
                    barSize={30}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                No hay ventas registradas en este periodo
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
