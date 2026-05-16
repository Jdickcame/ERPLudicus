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

const ProductForm = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Estado del formulario ampliado
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    area: "",
    category: "",
    price: "",
    product_type: "STOCKED",
    unit_of_measure: "NIU",
    is_sellable: true,
    is_purchasable: true,
    manage_stock: true,
  });

  // Cargar Categorías y Áreas al montar
  useEffect(() => {
    // Cargar Categorías
    api
      .get("/inventory/categories/")
      .then((res) => setCategories(res.data.results || res.data))
      .catch((err) => console.error("Error cargando categorías:", err));

    // Cargar Áreas (Asegúrate de que la ruta coincida con tu endpoint en purchases)
    // Usamos el endpoint que configuraste en AreaBudgetViewSet
    api
      .get("/purchases/areas/")
      .then((res) => setAreas(res.data.results || res.data))
      .catch((err) => console.error("Error cargando áreas:", err));
  }, []);

  // Manejador inteligente de cambios
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    let newValue: any = value;

    // Manejar checkboxes
    if (type === "checkbox") {
      newValue = (e.target as HTMLInputElement).checked;
    }

    setFormData((prev) => {
      const updated = { ...prev, [name]: newValue };

      // Lógica automática de UX: Si es Servicio, no controla stock
      if (name === "product_type") {
        if (value === "SERVICE") {
          updated.manage_stock = false;
          updated.unit_of_measure = "ZZ"; // Mutuamente Exclusivo
        } else if (value === "FINISHED") {
          updated.is_purchasable = false; // No se compra, se cocina
          updated.manage_stock = true;
        } else {
          updated.manage_stock = true;
          updated.is_purchasable = true;
        }
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
        // Si el SKU está vacío, lo mandamos null para que el backend lo auto-genere
        sku: formData.sku.trim() === "" ? null : formData.sku.trim(),
      };

      await api.post("/inventory/products/", payload);
      // Regresamos al catálogo de productos
      navigate("/inventory/products");
    } catch (err: any) {
      console.error(err);
      if (err.response?.data?.sku) {
        setError(
          "El código SKU ya existe. Intenta con otro o déjalo en blanco.",
        );
      } else {
        setError(
          "Error al guardar el producto. Revisa los datos obligatorios.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in duration-300">
      {/* CABECERA */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Box className="text-blue-600" /> Nuevo Producto
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registra un ítem en el catálogo maestro y configura sus reglas de
            negocio.
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
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-3 text-sm border border-red-200">
            <AlertCircle size={20} className="shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SECCIÓN 1: Información Básica */}
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
                  placeholder="Ej: Pan con Pollo Clásico"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Precio Base de Venta (S/){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="price"
                  step="0.01"
                  min="0"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Clasificación */}
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
                  <option value="STOCKED">
                    Almacenable (Se compra y vende)
                  </option>
                  <option value="CONSUMABLE">
                    Insumo (Solo se compra/consume)
                  </option>
                  <option value="FINISHED">
                    Producto Terminado (Tiene Receta)
                  </option>
                  <option value="SERVICE">Servicio (Intangible)</option>
                </select>
              </div>

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
                  <option value="NIU">Unidades (NIU)</option>
                  <option value="KG">Kilogramos (KG)</option>
                  <option value="LTR">Litros (LTR)</option>
                  <option value="MTR">Metros (MTR)</option>
                  <option value="GLN">Galones (GLN)</option>
                  <option value="BX">Cajas (BX)</option>
                  <option value="ZZ">Servicio (ZZ)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Comportamientos (Switches) */}
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
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">
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
