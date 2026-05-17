import {
  ArrowRightCircle,
  Calendar,
  Edit2,
  PlusCircle,
  Save,
  Target
} from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";

// 👇 ASEGÚRATE DE QUE LA RUTA SEA CORRECTA
import AreaExpensesTable from "../../components/budgets/AreaExpensesTable";

interface BudgetStatus {
  id?: number;
  area: string | number;
  area_label: string;
  limit: number;
  base_limit: number;
  extra_budget: number;
  spent: number;
  remaining: number;
  is_negative: boolean;
  percentage: number;
}

interface Option {
  value: string | number;
  label: string;
}

const Budgets = () => {
  const { currentBranch } = useBranch();
  const [stats, setStats] = useState<BudgetStatus[]>([]);
  const [availableAreas, setAvailableAreas] = useState<Option[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [editingArea, setEditingArea] = useState<string | number | null>(null);
  const [newLimit, setNewLimit] = useState("");
  const [selectedArea, setSelectedArea] = useState<any | null>(null);

  const loadData = async () => {
    if (!currentBranch) return;
    try {
      const [statusRes, choicesRes] = await Promise.all([
        api.get(
          `/purchases/budgets/status/?branch_id=${currentBranch.id}&month=${selectedMonth}`,
        ),
        api.get("/purchases/purchases/choices/"),
      ]);
      setStats(statusRes.data);
      setAvailableAreas(choicesRes.data.areas || []);
    } catch (error) {
      console.error("Error cargando presupuestos", error);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentBranch, selectedMonth]);

  // --- LÓGICA DE TRANSFERENCIA (ROLLOVER) ---
  const getNextMonthStr = (currentMonthStr: string) => {
    const [year, month] = currentMonthStr.split("-").map(Number);
    let nextMonth = month + 1;
    let nextYear = year;

    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  };

  const handleRollover = async (e: React.MouseEvent, stat: BudgetStatus) => {
    e.stopPropagation();

    const amountStr = prompt(
      `Cierre de mes: ${selectedMonth}\n` +
        `Te sobran S/ ${stat.remaining.toFixed(2)}.\n` +
        `¿Cuánto deseas transferir al mes siguiente?`,
      stat.remaining.toString(),
    );

    if (!amountStr) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return alert("Monto inválido");
    if (amount > stat.remaining)
      return alert("No puedes transferir más de lo que sobra");

    try {
      const targetMonth = getNextMonthStr(selectedMonth);

      await api.post("/purchases/budgets/rollover/", {
        area_id: stat.area,
        amount: amount,
        source_month: selectedMonth,
        target_month: targetMonth,
      });

      alert(
        `¡Cierre Exitoso!\nSe restaron S/ ${amount} de ${selectedMonth} y se pasaron a ${targetMonth}.`,
      );
      loadData();
    } catch (error) {
      console.error("Error en rollover", error);
      alert("Error al transferir saldo.");
    }
  };

  // --- EDICIÓN DEL LÍMITE BASE ---
  const handleSave = async (
    e: React.MouseEvent,
    areaValue: string | number,
  ) => {
    e.stopPropagation();
    if (!currentBranch) return alert("Selecciona una sede");

    try {
      await api.post("/purchases/budgets/set_limit/", {
        area_id: areaValue,
        amount: newLimit,
        branch_id: currentBranch.id, // 👈 Se asegura de enviar la sede actual
        month: selectedMonth,
      });

      setEditingArea(null);
      setNewLimit("");
      loadData();
    } catch (error) {
      console.error(error);
      alert("Error al guardar");
    }
  };

  // 👇 RENDERIZADO DE LA TABLA DE GASTOS
  if (selectedArea) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <AreaExpensesTable
          // Le pasamos todo el objeto (selectedArea) por si tu componente usa "label"
          area={selectedArea}
          month={selectedMonth}
          onBack={() => setSelectedArea(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Target className="text-blue-600" /> Control de Presupuestos
            </h1>
            <BranchSelector />
          </div>
          <p className="text-slate-500 mt-1">
            Límites de gasto en <strong>{currentBranch?.name}</strong>
          </p>
        </div>

        {/* FILTRO DE MES */}
        <div className="flex items-center gap-2 bg-white p-2 rounded shadow-sm border border-slate-200">
          <Calendar size={18} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-600">Periodo:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="outline-none text-slate-700 font-medium bg-transparent cursor-pointer"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {availableAreas.map((areaOpt) => {
          const stat = stats.find((s) => s.area == areaOpt.value);
          const isEditing = editingArea === areaOpt.value;

          const handleCardClick = () => {
            if (!isEditing) {
              setSelectedArea({
                value: areaOpt.value,
                label: areaOpt.label,
                remaining: stat ? stat.remaining : 0,
              });
            }
          };

          if (stat) {
            return (
              <div
                key={areaOpt.value}
                onClick={handleCardClick}
                className={`bg-white p-5 rounded-lg shadow-sm border border-slate-200 relative overflow-hidden transition-all ${
                  !isEditing
                    ? "cursor-pointer hover:shadow-md hover:border-blue-300 group"
                    : ""
                }`}
              >
                {/* CABECERA DE TARJETA CON PRESUPUESTO */}
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-700 transition-colors">
                      {areaOpt.label}
                    </h3>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                      Presupuesto {selectedMonth}
                    </p>
                  </div>

                  {isEditing ? (
                    <div
                      className="flex gap-2 bg-white p-1 rounded border shadow-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="number"
                        className="border p-1 rounded w-20 text-right text-sm"
                        value={newLimit}
                        onChange={(e) => setNewLimit(e.target.value)}
                        autoFocus
                      />
                      <button
                        onClick={(e) => handleSave(e, areaOpt.value)}
                        className="bg-green-600 text-white p-1.5 rounded hover:bg-green-700"
                      >
                        <Save size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 text-xl">
                          S/ {Number(stat.limit).toFixed(2)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingArea(areaOpt.value);
                            setNewLimit(stat.base_limit.toString());
                          }}
                          className="text-slate-400 hover:text-blue-600 bg-slate-50 p-1.5 rounded-full"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>

                      {stat.extra_budget !== 0 && (
                        <span
                          className={`text-[10px] font-medium px-1 rounded mt-1 ${stat.extra_budget > 0 ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50"}`}
                        >
                          Base: {stat.base_limit}{" "}
                          {stat.extra_budget > 0 ? "+" : "-"}{" "}
                          {Math.abs(stat.extra_budget)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* BARRA DE PROGRESO */}
                <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
                  <div
                    className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out ${
                      stat.is_negative
                        ? "bg-red-500"
                        : stat.percentage > 85
                          ? "bg-orange-400"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${Math.min(stat.percentage, 100)}%` }}
                  ></div>
                </div>

                {/* DATOS INFERIORES */}
                <div className="flex justify-between items-end text-sm font-medium border-t pt-3 border-slate-100">
                  <span className="text-slate-500 flex flex-col">
                    <span>Gastado:</span>
                    <span className="text-slate-900 font-bold text-base">
                      S/ {stat.spent.toFixed(2)}
                    </span>
                  </span>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`${stat.is_negative ? "text-red-600" : "text-green-600"} font-bold`}
                    >
                      {stat.is_negative ? "Exceso:" : "Queda:"} S/{" "}
                      {Math.abs(stat.remaining).toFixed(2)}
                    </span>

                    {!stat.is_negative && stat.remaining > 0 && (
                      <button
                        onClick={(e) => handleRollover(e, stat)}
                        className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-full flex items-center gap-1 transition border border-indigo-100 shadow-sm font-semibold"
                      >
                        Cerrar Mes <ArrowRightCircle size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // 👇 AQUÍ ESTÁ LA SOLUCIÓN AL PROBLEMA DE "TARJETA VACÍA" 👇
          return (
            <div
              key={areaOpt.value}
              className="bg-slate-50 p-5 rounded-lg border border-dashed border-slate-300 flex flex-col justify-center items-center text-center transition-all"
            >
              <h3 className="font-bold text-slate-600 text-lg mb-1">
                {areaOpt.label}
              </h3>

              {isEditing ? (
                // SI ESTÁ EDITANDO, MOSTRAMOS EL INPUT
                <div className="mt-3 flex gap-2 bg-white p-2 rounded-lg border shadow-sm w-full max-w-[200px] animate-in zoom-in-95">
                  <input
                    type="number"
                    className="w-full text-center text-sm outline-none font-bold text-slate-700"
                    placeholder="S/ 0.00"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    autoFocus
                  />
                  <button
                    onClick={(e) => handleSave(e, areaOpt.value)}
                    className="bg-green-600 hover:bg-green-700 text-white p-2 rounded transition"
                  >
                    <Save size={16} />
                  </button>
                </div>
              ) : (
                // SI NO ESTÁ EDITANDO, MOSTRAMOS EL BOTÓN
                <>
                  <p className="text-xs text-slate-400 mb-4">
                    Sin presupuesto asignado
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingArea(areaOpt.value);
                      setNewLimit("");
                    }}
                    className="bg-white text-blue-600 border border-blue-200 px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-blue-50 transition shadow-sm"
                  >
                    <PlusCircle size={16} /> Definir Límite
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Budgets;
