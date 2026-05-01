import { AlertCircle, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";

interface Category {
  id: number;
  name: string;
}

const ProductForm = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Estado del formulario (SIN STOCK)
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    category: "",
    price: "",
    // stock: "",  <-- ELIMINADO
  });

  // Cargar categorías al montar
  useEffect(() => {
    api
      .get("/inventory/categories/")
      .then((res) => setCategories(res.data))
      .catch((err) => console.error(err));
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.post("/inventory/products/", {
        ...formData,
        category: parseInt(formData.category),
        price: parseFloat(formData.price),
        // stock: ... <-- YA NO SE ENVÍA
      });
      navigate("/inventory");
    } catch (err: any) {
      console.error(err);
      if (err.response?.data?.sku) {
        setError("El código SKU ya existe. Intenta con otro.");
      } else {
        setError("Error al guardar el producto. Revisa los datos.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nuevo Producto</h1>
          <p className="text-sm text-slate-500">
            Registra un producto en el catálogo global
          </p>
        </div>
        <button
          onClick={() => navigate("/inventory")}
          className="text-slate-500 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-full transition"
        >
          <X size={24} />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg flex items-center gap-2 text-sm border border-red-200">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fila 1: SKU y Categoría */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Código SKU
              </label>
              <input
                type="text"
                name="sku"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono text-sm"
                placeholder="PROD-001"
                value={formData.sku}
                onChange={handleChange}
              />
              <p className="text-xs text-slate-400 mt-1">
                Déjalo vacío para generar uno automático.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Categoría <span className="text-red-500">*</span>
              </label>
              <select
                name="category"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={formData.category}
                onChange={handleChange}
              >
                <option value="">Seleccione...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nombre del Producto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Ej: Laptop HP Pavilion 15"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          {/* Fila 3: Precio (El input de Stock se eliminó) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Precio de Venta (S/) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price"
                step="0.01"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0.00"
                value={formData.price}
                onChange={handleChange}
              />
            </div>

            {/* Nota informativa sobre el stock */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>
                El stock inicial se establecerá en <strong>0</strong>. Para
                agregar existencias, realiza una <strong>Compra</strong> o un{" "}
                <strong>Ajuste de Inventario</strong> después de crear el
                producto.
              </p>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={() => navigate("/inventory")}
              className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition disabled:opacity-50 font-medium shadow-sm hover:shadow"
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
