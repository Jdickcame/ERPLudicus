import { AlertTriangle, ArrowRightLeft, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext"; // Ajusta la ruta de tu contexto si es diferente

interface Product {
  id: number;
  name: string;
  sku: string;
  uom_display: string;
  product_type: string;
}

interface AdjustmentDetail {
  product: Product;
  quantity: string;
}

const NewAdjustment = () => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  // Formulario Cabecera
  const [type, setType] = useState("MERMA_OUT");
  const [reason, setReason] = useState("");

  // Detalles
  const [details, setDetails] = useState<AdjustmentDetail[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qtyInput, setQtyInput] = useState("");

  useEffect(() => {
    // Cargamos productos que manejan stock
    api
      .get("/inventory/products/?page_size=500")
      .then((res) => {
        // Filtramos para no mostrar servicios, solo productos físicos
        const filtered = (res.data.results || res.data).filter(
          (p: Product) =>
            p.product_type === "STOCKED" ||
            p.product_type === "CONSUMABLE" ||
            p.product_type === "FINISHED" ||
            p.product_type === "INTERMEDIATE",
        );
        setProducts(filtered);
      })
      .catch((err) => console.error("Error cargando productos:", err));
  }, []);

  const handleAddLine = () => {
    if (!selectedProductId || !qtyInput || parseFloat(qtyInput) <= 0) {
      return; // Prevenir añadir vacíos o ceros
    }

    const prod = products.find((p) => p.id === parseInt(selectedProductId));
    if (!prod) return;

    // Evitar duplicados en la lista temporal
    if (details.some((d) => d.product.id === prod.id)) {
      alert(
        "Este producto ya está en la lista. Si deseas cambiar la cantidad, elimínalo y vuelve a agregarlo.",
      );
      return;
    }

    setDetails([...details, { product: prod, quantity: qtyInput }]);

    // Limpiamos los inputs de la fila
    setSelectedProductId("");
    setQtyInput("");
  };

  const handleRemoveLine = (index: number) => {
    setDetails(details.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch)
      return alert("Selecciona una sede en la barra superior.");
    if (details.length === 0)
      return alert("Agrega al menos un producto al ajuste.");

    setLoading(true);
    try {
      // 👇 PAYLOAD EXACTO PARA TU MOTOR BACKEND 👇
      const payload = {
        branch_id: currentBranch.id, // Coincide con request.data.get("branch_id")
        type: type,
        reason: reason || "Sin especificar",
        details: details.map((d) => ({
          product_id: d.product.id, // Coincide con item.get("product_id")
          quantity: parseFloat(d.quantity),
        })),
      };

      await api.post("/inventory/adjustments/", payload);
      alert("Ajuste de inventario registrado con éxito.");
      navigate("/inventory"); // Volvemos a la pantalla principal de inventario
    } catch (error: any) {
      console.error(error);
      // Mostramos el error exacto que nos devuelva tu backend (ej. "Stock insuficiente")
      alert(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          "Error registrando el ajuste.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="text-orange-500" /> Registro de Ajuste /
            Merma
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Modifica el inventario físico (conteo o mermas) en{" "}
            <strong>{currentBranch?.name || "la sede actual"}</strong>.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* CABECERA */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Tipo de Movimiento
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 transition"
            >
              {/* 👇 NUEVO GRUPO DE PRODUCCIÓN 👇 */}
              <optgroup label="Cocina / Fabricación (BOM)">
                <option value="PRODUCTION">
                  👨‍🍳 Orden de Producción (Preparar Receta/Subreceta)
                </option>
              </optgroup>

              <optgroup label="Salidas (Disminuye Stock)">
                <option value="MERMA_OUT">
                  Salida por Merma / Vencimiento / Rotura
                </option>
                <option value="INTERNAL">
                  Consumo Interno (Muestra, Degustación)
                </option>
                <option value="ADJUST_OUT">
                  Ajuste de Salida (Faltante en Inventario)
                </option>
              </optgroup>
              <optgroup label="Entradas (Aumenta Stock)">
                <option value="ADJUST_IN">
                  Ajuste de Entrada (Sobrante en Inventario)
                </option>
                <option value="INITIAL">Inventario Inicial</option>
                <option value="MERMA_RETURN">
                  Devolución por Merma (Reingreso)
                </option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Motivo / Observación <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Se vencieron 5 unidades de pan en vitrina..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 transition"
            />
          </div>
        </div>

        {/* BUSCADOR DE PRODUCTOS (AÑADIR LÍNEA) */}
        <div className="bg-orange-50 p-6 rounded-xl border border-orange-200 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold text-orange-800 uppercase tracking-wider mb-2">
              Seleccionar Producto
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full p-2.5 border border-orange-300 bg-white rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">-- Buscar... --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku ? `[${p.sku}] ` : ""}
                  {p.name} ({p.uom_display})
                </option>
              ))}
            </select>
          </div>

          <div className="w-32">
            <label className="block text-xs font-bold text-orange-800 uppercase tracking-wider mb-2">
              Cantidad
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              placeholder="0.00"
              className="w-full p-2.5 border border-orange-300 bg-white rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-center font-bold"
            />
          </div>

          <button
            type="button"
            onClick={handleAddLine}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 px-6 rounded-lg transition h-[46px] shadow-sm hover:shadow-md"
          >
            Agregar
          </button>
        </div>

        {/* TABLA DE DETALLES */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4">Producto</th>
                <th className="p-4 text-center">Cantidad a Ajustar</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {details.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="p-12 text-center text-slate-400 bg-slate-50/50"
                  >
                    <AlertTriangle
                      size={32}
                      className="mx-auto mb-3 text-slate-300"
                    />
                    No hay productos agregados al ajuste.
                  </td>
                </tr>
              ) : (
                details.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition group">
                    <td className="p-4">
                      <div className="font-bold text-slate-800">
                        {item.product.name}
                      </div>
                      {item.product.sku && (
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {item.product.sku}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className="bg-orange-100 text-orange-800 font-bold px-3 py-1 rounded-full text-sm border border-orange-200">
                        {item.quantity}{" "}
                        <span className="text-xs font-normal ml-1">
                          {item.product.uom_display}
                        </span>
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-slate-300 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition opacity-0 group-hover:opacity-100"
                        title="Quitar fila"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* BOTON GUARDAR */}
        <div className="flex justify-end pt-4 border-t border-slate-200 mt-6">
          <button
            type="submit"
            disabled={loading || details.length === 0}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 transition disabled:opacity-50 shadow-sm hover:shadow-md"
          >
            <Save size={20} />{" "}
            {loading ? "Procesando Kardex..." : "Registrar Ajuste"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewAdjustment;
