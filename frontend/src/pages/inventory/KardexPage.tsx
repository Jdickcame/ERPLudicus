import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  FileText,
  Filter,
  Tag,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

interface KardexEntry {
  id: number;
  date: string;
  type: string;
  type_display: string;
  quantity: number;
  unit_cost: string;
  total_cost: string;
  balance_quantity: number;
  balance_unit_cost: string;
  balance_total_cost: string;
  user_name: string;
  reference_document: string | null; // 👈 NUEVO: Documento de respaldo
  description: string;
}

interface ProductInfo {
  name: string;
  sku: string;
  uom: string;
}

const KardexPage = () => {
  const { productId } = useParams();
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  const [movements, setMovements] = useState<KardexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);

  // --- Cargar Datos ---
  useEffect(() => {
    if (!currentBranch || !productId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Carga rápida y simultánea: Pedimos el producto y su historial a la vez
        const [prodRes, kardexRes] = await Promise.all([
          api.get(`/inventory/products/${productId}/`),
          api.get(
            `/inventory/kardex/?branch_id=${currentBranch.id}&product=${productId}`,
          ),
        ]);

        setProductInfo({
          name: prodRes.data.name,
          sku: prodRes.data.sku || "S/N",
          uom: prodRes.data.uom_display || "UND",
        });

        setMovements(kardexRes.data.results || kardexRes.data);
      } catch (error) {
        console.error("Error cargando kardex", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentBranch, productId]);

  const isEntry = (qty: number) => qty > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in slide-in-from-right-4 duration-500">
      {/* CABECERA CON NAVEGACIÓN */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/inventory/stocks")} // Volvemos a la vista de stocks
          className="flex items-center gap-1 text-slate-500 hover:text-blue-600 transition-colors mb-4 text-sm font-medium"
        >
          <ChevronLeft size={16} /> Volver al Inventario
        </button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              {productInfo ? productInfo.name : "Cargando..."}
            </h1>
            <p className="text-slate-500 mt-2 flex items-center gap-2">
              <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs font-mono font-bold text-slate-600 flex items-center gap-1">
                <Tag size={12} /> {productInfo?.sku}
              </span>
              <span>
                • Historial valorizado en <strong>{currentBranch?.name}</strong>
              </span>
            </p>
          </div>

          {/* Resumen Rápido (Último saldo) */}
          {movements.length > 0 && productInfo && (
            <div className="text-right bg-white p-3 px-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                Saldo Físico Actual
              </p>
              <p className="text-3xl font-black text-blue-600 leading-none">
                {movements[0].balance_quantity}{" "}
                <span className="text-sm text-slate-400 font-bold ml-1">
                  {productInfo.uom}
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
          <button className="text-xs flex items-center gap-1 text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded transition border border-transparent hover:border-blue-100">
            <Filter size={14} /> Filtrar Fechas
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider select-none">
              <tr>
                <th className="p-4 w-36">Fecha / Hora</th>
                <th className="p-4">Concepto y Referencia</th>
                <th className="p-4 text-center">Entrada / Salida</th>
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
                    Cargando historial de movimientos...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <Calendar size={48} className="text-slate-200" />
                      <p className="font-medium">
                        Este producto no tiene movimientos en esta sede.
                      </p>
                      <span className="text-xs">
                        Los movimientos aparecerán automáticamente al registrar
                        compras o ventas.
                      </span>
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
                      <div className="font-mono text-xs font-medium text-slate-600">
                        {new Date(mov.date).toLocaleDateString("es-PE")}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(mov.date).toLocaleTimeString("es-PE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-slate-700 text-xs">
                        {mov.type_display}
                      </div>

                      {/* Referencia del Documento Oficial (Ej: Factura o Traslado) */}
                      {mov.reference_document && (
                        <div className="text-[11px] font-mono font-medium text-blue-600 mt-0.5 bg-blue-50 w-fit px-1.5 rounded">
                          Ref: {mov.reference_document}
                        </div>
                      )}

                      {mov.description && (
                        <div className="text-xs text-slate-500 italic mt-0.5">
                          {mov.description}
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <User size={10} /> Registrado por {mov.user_name}
                      </div>
                    </td>

                    {/* CANTIDAD (ROJO/VERDE) */}
                    <td className="p-4 text-center">
                      <span
                        className={`flex items-center justify-center gap-1.5 font-bold text-xs px-2 py-1 rounded-full w-fit mx-auto ${
                          isEntry(mov.quantity)
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
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
                    <td className="p-4 text-right text-orange-800/80 font-mono bg-orange-50/20 text-xs font-medium">
                      S/ {parseFloat(mov.unit_cost).toFixed(4)}
                    </td>
                    <td className="p-4 text-right text-orange-800/80 font-mono font-bold bg-orange-50/20 text-xs">
                      S/ {parseFloat(mov.total_cost).toFixed(2)}
                    </td>

                    {/* COLUMNAS DE SALDO (AUDITORÍA) */}
                    <td className="p-4 text-center font-bold text-slate-800 bg-slate-50">
                      {mov.balance_quantity}
                    </td>
                    <td className="p-4 text-right font-mono text-slate-600 bg-slate-50 text-xs font-medium">
                      S/ {parseFloat(mov.balance_unit_cost).toFixed(4)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default KardexPage;
