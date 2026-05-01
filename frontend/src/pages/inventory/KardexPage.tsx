import {
    ArrowDownLeft,
    ArrowUpRight,
    Calendar,
    ChevronLeft,
    FileText,
    Filter,
    User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

interface KardexEntry {
  id: number;
  date: string;
  type: string; // Código: "IN_PURCHASE"
  type_display: string; // Texto: "Entrada por Compra"
  quantity: number;
  unit_cost: string;
  total_cost: string;
  balance_quantity: number; // Saldo Físico
  balance_unit_cost: string; // Saldo Costo Promedio
  balance_total_cost: string; // Saldo Valorizado
  user_name: string;
  description: string;
}

const KardexPage = () => {
  const { productId } = useParams(); // Obtenemos el ID del producto de la URL
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  const [movements, setMovements] = useState<KardexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [productInfo, setProductInfo] = useState<{
    name: string;
    sku: string;
  } | null>(null);

  // --- Cargar Datos ---
  useEffect(() => {
    if (!currentBranch || !productId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Cargar Movimientos del Kardex
        const res = await api.get(
          `/inventory/kardex/?branch_id=${currentBranch.id}&product=${productId}`,
        );
        setMovements(res.data.results || res.data);

        // 2. Obtener info básica del producto (si hay movimientos, la sacamos del primero)
        if (res.data.results?.length > 0) {
          setProductInfo({
            name: res.data.results[0].product_name,
            sku: "SKU-REF", // Si el serializer lo manda, mejor
          });
        } else {
          // Si no hay movimientos, consultamos el producto directo (opcional)
          const prodRes = await api.get(`/inventory/products/${productId}/`);
          setProductInfo(prodRes.data);
        }
      } catch (error) {
        console.error("Error cargando kardex", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentBranch, productId]);

  // --- Helper para identificar tipo de movimiento ---
  const isEntry = (qty: number) => qty > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in slide-in-from-right-4 duration-500">
      {/* CABECERA CON NAVEGACIÓN */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/inventory")}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors mb-2 text-sm font-medium"
        >
          <ChevronLeft size={16} /> Volver al Inventario
        </button>

        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              {productInfo ? productInfo.name : "Cargando..."}
            </h1>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono font-bold text-slate-600">
                {productInfo?.sku || "..."}
              </span>
              <span>
                • Historial en <strong>{currentBranch?.name}</strong>
              </span>
            </p>
          </div>

          {/* Resumen Rápido (Último saldo) */}
          {movements.length > 0 && (
            <div className="text-right bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Saldo Actual
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {movements[0].balance_quantity}{" "}
                <span className="text-sm text-slate-400 font-normal">
                  unid.
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* TABLA DE KARDEX */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <FileText size={18} className="text-slate-400" /> Movimientos
            Registrados
          </h3>
          <button className="text-xs flex items-center gap-1 text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded transition">
            <Filter size={14} /> Filtrar Fecha
          </button>
        </div>

        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px]">
            <tr>
              <th className="p-4 w-40">Fecha / Hora</th>
              <th className="p-4">Concepto</th>
              <th className="p-4 text-center">Entrada/Salida</th>
              <th className="p-4 text-right bg-orange-50/50 text-orange-800">
                Costo Unit.
              </th>
              <th className="p-4 text-right bg-orange-50/50 text-orange-800">
                Costo Total
              </th>
              <th className="p-4 text-center bg-slate-100 text-slate-700">
                Saldo Físico
              </th>
              <th className="p-4 text-right bg-slate-100 text-slate-700">
                Costo Prom.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-slate-400">
                  Cargando historia...
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Calendar size={40} className="text-slate-200" />
                    <p>Este producto no tiene movimientos en esta sede.</p>
                  </div>
                </td>
              </tr>
            ) : (
              movements.map((mov) => (
                <tr
                  key={mov.id}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="p-4 text-slate-500">
                    <div className="font-mono text-xs">
                      {new Date(mov.date).toLocaleDateString()}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(mov.date).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="font-bold text-slate-700">
                      {mov.type_display}
                    </div>
                    {mov.description && (
                      <div className="text-xs text-slate-400 italic">
                        "{mov.description}"
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <User size={10} /> {mov.user_name}
                    </div>
                  </td>

                  {/* CANTIDAD (ROJO/VERDE) */}
                  <td className="p-4 text-center">
                    <span
                      className={`flex items-center justify-center gap-1 font-bold ${
                        isEntry(mov.quantity)
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {isEntry(mov.quantity) ? (
                        <ArrowDownLeft size={14} />
                      ) : (
                        <ArrowUpRight size={14} />
                      )}
                      {Math.abs(mov.quantity)}
                    </span>
                  </td>

                  {/* COLUMNAS FINANCIERAS (DEL MOVIMIENTO) */}
                  <td className="p-4 text-right text-orange-800/80 font-mono bg-orange-50/20 text-xs">
                    S/ {parseFloat(mov.unit_cost).toFixed(4)}
                  </td>
                  <td className="p-4 text-right text-orange-800/80 font-mono font-bold bg-orange-50/20 text-xs">
                    S/ {parseFloat(mov.total_cost).toFixed(2)}
                  </td>

                  {/* COLUMNAS DE SALDO (AUDITORÍA) */}
                  <td className="p-4 text-center font-bold text-slate-800 bg-slate-50">
                    {mov.balance_quantity}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-600 bg-slate-50 text-xs">
                    S/ {parseFloat(mov.balance_unit_cost).toFixed(4)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KardexPage;
