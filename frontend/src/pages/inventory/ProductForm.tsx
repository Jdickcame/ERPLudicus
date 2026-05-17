import { AlertCircle, Box, Info, Save, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";

interface Category {
  id: number;
  name: string;
}

interface Area {
  id: number;
  name: string;
}

interface Choice {
  value: string;
  label: string;
}

const ProductForm = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);

  // 👇 Nuevos estados para los datos dinámicos
  const [productTypes, setProductTypes] = useState<Choice[]>([]);
  const [uomChoices, setUomChoices] = useState<Choice[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    area: "",
    category: "",
    price: "",
    product_type: "STOCKED", // Default
    unit_of_measure: "NIU", // Default
    is_sellable: true,
    is_purchasable: true,
    manage_stock: true,
  });

  useEffect(() => {
    // Cargar Categorías
    api
      .get("/inventory/categories/")
      .then((res) => setCategories(res.data.results || res.data))
      .catch((err) => console.error("Error categorías:", err));

    // Cargar Áreas
    api
      .get("/purchases/budgets/")
      .then((res) => setAreas(res.data.results || res.data))
      .catch((err) => console.error("Error áreas:", err));

    // 👇 NUEVO: Cargar Opciones Dinámicas (Tipos y Unidades)
    api
      .get("/inventory/products/choices/")
      .then((res) => {
        setProductTypes(res.data.product_types);
        setUomChoices(res.data.uom_choices);
      })
      .catch((err) => console.error("Error opciones dinámicas:", err));
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    let newValue: any = value;

    if (type === "checkbox") {
      newValue = (e.target as HTMLInputElement).checked;
    }

    setFormData((prev) => {
      const updated = { ...prev, [name]: newValue };

      // Lógica automática de UX según el Tipo de Producto
      if (name === "product_type") {
        if (value === "SERVICE") {
          updated.manage_stock = false;
          updated.unit_of_measure = "ZZ"; // Mutuamente Exclusivo
          updated.is_sellable = true;
          updated.is_purchasable = true;
        } else if (value === "FINISHED") {
          updated.is_purchasable = false;
          updated.manage_stock = true;
          updated.is_sellable = true;
        } else if (value === "CONSUMABLE") {
          updated.manage_stock = true;
          updated.is_purchasable = true;
          updated.is_sellable = false; // Insumos no se venden
          updated.price = "0";
        } else {
          updated.manage_stock = true;
          updated.is_purchasable = true;
          updated.is_sellable = true;
        }
      }

      if (name === "is_sellable" && !newValue) {
        updated.price = "0";
      }

      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload = {
        ...formData,
        category: parseInt(formData.category),
        area: formData.area ? parseInt(formData.area) : null,
        price: parseFloat(formData.price || "0"),
        sku: formData.sku.trim() === "" ? null : formData.sku.trim(),
      };

      await api.post("/inventory/products/", payload);
      navigate("/inventory/products");
    } catch (err: any) {
      console.error(err);
      if (err.response?.data?.sku) {
        setError("El código SKU ya existe.");
      } else {
        // Mejoramos el manejo de errores para ver qué falló exactamente
        setError(
          JSON.stringify(err.response?.data) || "Error al guardar el producto.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Box className="text-blue-600" /> Nuevo Producto
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registra un ítem en el catálogo maestro.
          </p>
        </div>
        <button
          onClick={() => navigate("/inventory/products")}
          className="text-slate-500 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-full transition"
        >
          <X size={24} />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 text-sm border border-red-200">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span className="font-medium break-all">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SECCIÓN 1 */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2">
              <Info size={18} className="text-slate-400" /> Información General
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del Producto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Código SKU
                </label>
                <input
                  type="text"
                  name="sku"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono text-sm transition"
                  placeholder="Dejar vacío para autogenerar..."
                  value={formData.sku}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${formData.is_sellable ? "text-slate-700" : "text-slate-400"}`}
                >
                  Precio Base de Venta (S/){" "}
                  {formData.is_sellable && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="number"
                  name="price"
                  step="0.01"
                  min="0"
                  required={formData.is_sellable}
                  disabled={!formData.is_sellable}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-60 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={handleChange}
                />
                {!formData.is_sellable && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    No aplicable para este tipo de ítem.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN 2 */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2">
              <Settings2 size={18} className="text-slate-400" /> Clasificación y
              Logística
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Área (Presupuesto / Ingreso)
                </label>
                <select
                  name="area"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                  value={formData.area}
                  onChange={handleChange}
                >
                  <option value="">-- Sin Área Específica --</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Categoría <span className="text-red-500">*</span>
                </label>
                <select
                  name="category"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                  value={formData.category}
                  onChange={handleChange}
                >
                  <option value="">Seleccione una categoría...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 👇 SELECT DINÁMICO DE TIPOS 👇 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tipo de Producto <span className="text-red-500">*</span>
                </label>
                <select
                  name="product_type"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                  value={formData.product_type}
                  onChange={handleChange}
                >
                  {productTypes.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 👇 SELECT DINÁMICO DE UNIDADES DE MEDIDA 👇 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Unidad de Medida <span className="text-red-500">*</span>
                </label>
                <select
                  name="unit_of_measure"
                  required
                  disabled={formData.product_type === "SERVICE"}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-50"
                  value={formData.unit_of_measure}
                  onChange={handleChange}
                >
                  {uomChoices.map((uom) => (
                    <option key={uom.value} value={uom.value}>
                      {uom.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Comportamientos */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
              Reglas de Negocio
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition">
                <input
                  type="checkbox"
                  name="is_sellable"
                  checked={formData.is_sellable}
                  onChange={handleChange}
                  disabled={formData.product_type === "CONSUMABLE"}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                />
                <span
                  className={`text-sm font-medium ${formData.product_type === "CONSUMABLE" ? "text-slate-400" : "text-slate-700"}`}
                >
                  Disponible para Venta
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition">
                <input
                  type="checkbox"
                  name="is_purchasable"
                  checked={formData.is_purchasable}
                  onChange={handleChange}
                  disabled={formData.product_type === "FINISHED"}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                />
                <span
                  className={`text-sm font-medium ${formData.product_type === "FINISHED" ? "text-slate-400" : "text-slate-700"}`}
                >
                  Se compra a Proveedor
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-slate-100 transition">
                <input
                  type="checkbox"
                  name="manage_stock"
                  checked={formData.manage_stock}
                  onChange={handleChange}
                  disabled={formData.product_type === "SERVICE"}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                />
                <span
                  className={`text-sm font-medium ${formData.product_type === "SERVICE" ? "text-slate-400" : "text-slate-700"}`}
                >
                  Controlar Stock (Inventario)
                </span>
              </label>
            </div>
          </div>

          {/* BOTONES */}
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-8">
            <button
              type="button"
              onClick={() => navigate("/inventory/products")}
              className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg transition font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg flex items-center gap-2 transition disabled:opacity-50 font-medium shadow-sm hover:shadow-md"
            >
              <Save size={18} />
              {loading ? "Guardando..." : "Guardar Producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductForm;
