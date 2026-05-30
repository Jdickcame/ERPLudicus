import {
  AlertCircle,
  Box,
  CircleDollarSign,
  Info,
  Save,
  Settings2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

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
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const { currentBranch } = useBranch();

  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);

  const [productTypes, setProductTypes] = useState<Choice[]>([]);
  const [uomChoices, setUomChoices] = useState<Choice[]>([]);

  const [groupProducts, setGroupProducts] = useState<
    { id: number; name: string }[]
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [sellingPrice, setSellingPrice] = useState<string>("");

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
    colab_price: "", // 👈 Estado inicial integrado
    is_group: false,
    parent: "",
  });

  useEffect(() => {
    // Cargar Categorías
    api
      .get("/inventory/categories/")
      .then((res) => setCategories(res.data.results || res.data))
      .catch((err) => console.error("Error categorías:", err));

    // Cargar Áreas
    api
      .get("/purchases/purchases/choices/")
      .then((res) => {
        const areasFormateadas = res.data.areas.map((a: any) => ({
          id: a.value,
          name: a.label,
        }));
        setAreas(areasFormateadas);
      })
      .catch((err) => console.error("Error áreas:", err));

    // Cargar Opciones Dinámicas (Tipos y Unidades)
    api
      .get("/inventory/products/choices/")
      .then((res) => {
        setProductTypes(res.data.product_types);
        setUomChoices(res.data.uom_choices);
      })
      .catch((err) => console.error("Error opciones dinámicas:", err));

    // Cargar Grupos (Carpetas)
    api
      .get("/inventory/products/?page_size=1000")
      .then((res) => {
        const allProducts = res.data.results || res.data;
        const groupsOnly = allProducts.filter((p: any) => p.is_group);
        setGroupProducts(groupsOnly);
      })
      .catch((err) => console.error("Error cargando grupos:", err));

    // Si estamos editando, cargar datos del producto
    if (id) {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      api
        .get(`/inventory/products/${id}/`, { params })
        .then((res) => {
          const p = res.data;
          setFormData({
            name: p.name || "",
            sku: p.sku || "",
            area: p.area || "",
            category: p.category || "",
            price: p.price ? parseFloat(p.price).toFixed(2) : "",
            product_type: p.product_type || "STOCKED",
            unit_of_measure: p.unit_of_measure || "NIU",
            is_sellable: p.is_sellable ?? true,
            is_purchasable: p.is_purchasable ?? true,
            manage_stock: p.manage_stock ?? true,
            colab_price: p.colab_price
              ? parseFloat(p.colab_price).toFixed(2)
              : "", // 👈 Cargar precio staff
            is_group: p.is_group ?? false,
            parent: p.parent ? p.parent.toString() : "",
          });

          if (p.stock?.selling_price) {
            setSellingPrice(parseFloat(p.stock.selling_price).toFixed(2));
          } else {
            setSellingPrice("");
          }
        })
        .catch((err) => console.error("Error cargando producto:", err));
    }
  }, [id, currentBranch]);

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

      if (name === "product_type") {
        if (value === "SERVICE") {
          updated.manage_stock = false;
          updated.unit_of_measure = "ZZ";
          updated.is_sellable = true;
          updated.is_purchasable = true;
        } else if (value === "FINISHED") {
          updated.is_purchasable = false;
          updated.manage_stock = true;
          updated.is_sellable = true;
        } else if (value === "INTERMEDIATE") {
          updated.is_purchasable = false;
          updated.is_sellable = false;
          updated.manage_stock = true;
          updated.price = "0.00";
        } else if (value === "CONSUMABLE") {
          updated.manage_stock = true;
          updated.is_purchasable = true;
          updated.is_sellable = false;
          updated.price = "0.00";
        } else {
          updated.manage_stock = true;
          updated.is_purchasable = true;
          updated.is_sellable = true;
        }
      }

      // 🔥 FIX: Si no es para venta, limpiamos los TRES precios
      if (name === "is_sellable" && !newValue) {
        updated.price = "0.00";
        updated.colab_price = ""; // 👈 Limpiar colab_price
        setSellingPrice("");
      }

      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: any = {
        ...formData,
        category: parseInt(formData.category),
        area: formData.area ? parseInt(formData.area) : null,
        price: parseFloat(formData.price || "0"),
        sku: formData.sku.trim() === "" ? null : formData.sku.trim(),
        colab_price: formData.colab_price
          ? parseFloat(formData.colab_price)
          : null, // 👈 Se envía limpio a Django
        is_group: formData.is_group,
        parent: formData.parent ? parseInt(formData.parent) : null,
      };

      if (currentBranch && sellingPrice) {
        payload.branch_id = currentBranch.id;
        payload.selling_price = parseFloat(sellingPrice);
      }

      if (isEditing) {
        await api.put(`/inventory/products/${id}/`, payload);
      } else {
        await api.post("/inventory/products/", payload);
      }
      navigate("/inventory/products");
    } catch (err: any) {
      console.error(err);
      if (err.response?.data?.sku) {
        setError("El código SKU ya existe.");
      } else {
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
            <Box className="text-blue-600" />{" "}
            {isEditing ? "Editar Producto" : "Nuevo Producto"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isEditing
              ? "Modifica los datos del producto."
              : "Registra un ítem en el catálogo maestro."}
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
          {/* SECCIÓN 1: GENERAL */}
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

              {/* SELECTOR: PERTENECE A GRUPO */}
              {!formData.is_group && (
                <div className="md:col-span-2 bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                  <label className="block text-sm font-bold text-purple-900 mb-1">
                    Carpeta Contenedora
                  </label>
                  <select
                    name="parent"
                    className="w-full px-4 py-2.5 bg-white border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition"
                    value={formData.parent}
                    onChange={handleChange}
                  >
                    <option value="">
                      -- Mostrar en pantalla principal --
                    </option>
                    {groupProducts.map((g) => (
                      <option key={g.id} value={g.id}>
                        📁 Dentro de: {g.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-purple-600 mt-1.5 font-medium">
                    Si eliges una carpeta, este producto se ocultará de la vista
                    principal y solo aparecerá al presionar su carpeta.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN 1.5: ESTRUCTURA DE PRECIOS */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2">
              <CircleDollarSign size={18} className="text-slate-400" /> Tarifas
              y Precios
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-5 bg-slate-50 border border-slate-200 rounded-xl">
              {/* Precio Base */}
              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${
                    formData.is_sellable ? "text-slate-700" : "text-slate-400"
                  }`}
                >
                  Precio Público (S/){" "}
                  {formData.is_sellable && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  name="price"
                  required={formData.is_sellable}
                  disabled={!formData.is_sellable}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-60 disabled:bg-slate-100 disabled:cursor-not-allowed font-medium"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    const parts = val.split(".");
                    if (parts.length > 2) return;
                    if (parts[1] && parts[1].length > 2) return;
                    setFormData((prev) => ({ ...prev, price: val }));
                  }}
                  onBlur={() => {
                    if (formData.price && formData.price !== ".") {
                      setFormData((prev) => ({
                        ...prev,
                        price: parseFloat(formData.price).toFixed(2),
                      }));
                    }
                  }}
                />
              </div>

              {/* Precio Colaborador */}
              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${
                    formData.is_sellable ? "text-slate-700" : "text-slate-400"
                  }`}
                >
                  Precio Staff (S/)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  name="colab_price"
                  disabled={!formData.is_sellable}
                  className="w-full px-4 py-2.5 bg-purple-50/50 border border-purple-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition disabled:opacity-60 disabled:bg-slate-100 disabled:border-slate-300 disabled:cursor-not-allowed font-medium text-purple-900"
                  placeholder="Ej: 3.00"
                  value={formData.colab_price}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    const parts = val.split(".");
                    if (parts.length > 2) return;
                    if (parts[1] && parts[1].length > 2) return;
                    setFormData((prev) => ({ ...prev, colab_price: val }));
                  }}
                  onBlur={() => {
                    if (formData.colab_price && formData.colab_price !== ".") {
                      setFormData((prev) => ({
                        ...prev,
                        colab_price: parseFloat(formData.colab_price).toFixed(
                          2,
                        ),
                      }));
                    }
                  }}
                />
              </div>

              {/* Precio de Sede (Si aplica) */}
              {currentBranch && (
                <div>
                  <label
                    className={`block text-sm font-medium mb-1 ${
                      formData.is_sellable ? "text-slate-700" : "text-slate-400"
                    }`}
                  >
                    Precio en {currentBranch.name} (S/)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!formData.is_sellable}
                    className="w-full px-4 py-2.5 bg-green-50 border border-green-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-green-500 outline-none transition disabled:opacity-60 disabled:bg-slate-100 disabled:border-slate-300 disabled:cursor-not-allowed font-medium text-green-900"
                    placeholder="Ej: 5.00"
                    value={sellingPrice}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, "");
                      const parts = val.split(".");
                      if (parts.length > 2) return;
                      if (parts[1] && parts[1].length > 2) return;
                      setSellingPrice(val);
                    }}
                    onBlur={() => {
                      if (sellingPrice && sellingPrice !== ".") {
                        setSellingPrice(parseFloat(sellingPrice).toFixed(2));
                      }
                    }}
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
                    Si está vacío, se usará el Público. Solo afecta a{" "}
                    {currentBranch.name}.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN 2: LOGÍSTICA */}
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

              {/* SELECT DINÁMICO DE TIPOS */}
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

              {/* SELECT DINÁMICO DE UNIDADES DE MEDIDA */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white transition border border-transparent hover:border-slate-200">
                <input
                  type="checkbox"
                  name="is_sellable"
                  checked={formData.is_sellable}
                  onChange={handleChange}
                  disabled={
                    formData.product_type === "CONSUMABLE" ||
                    formData.product_type === "INTERMEDIATE"
                  }
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                />
                <span
                  className={`text-sm font-medium ${
                    formData.product_type === "CONSUMABLE" ||
                    formData.product_type === "INTERMEDIATE"
                      ? "text-slate-400"
                      : "text-slate-700"
                  }`}
                >
                  Disponible Venta
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white transition border border-transparent hover:border-slate-200">
                <input
                  type="checkbox"
                  name="is_purchasable"
                  checked={formData.is_purchasable}
                  onChange={handleChange}
                  disabled={
                    formData.product_type === "FINISHED" ||
                    formData.product_type === "INTERMEDIATE"
                  }
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                />
                <span
                  className={`text-sm font-medium ${
                    formData.product_type === "FINISHED" ||
                    formData.product_type === "INTERMEDIATE"
                      ? "text-slate-400"
                      : "text-slate-700"
                  }`}
                >
                  Se Compra (Prov.)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white transition border border-transparent hover:border-slate-200">
                <input
                  type="checkbox"
                  name="manage_stock"
                  checked={formData.manage_stock}
                  onChange={handleChange}
                  disabled={formData.product_type === "SERVICE"}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                />
                <span
                  className={`text-sm font-medium ${
                    formData.product_type === "SERVICE"
                      ? "text-slate-400"
                      : "text-slate-700"
                  }`}
                >
                  Controlar Stock
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-purple-50 transition border border-transparent hover:border-purple-200">
                <input
                  type="checkbox"
                  name="is_group"
                  checked={formData.is_group}
                  onChange={handleChange}
                  disabled={Boolean(formData.parent)}
                  className="w-5 h-5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 disabled:opacity-50"
                />
                <span
                  className={`text-sm font-bold ${
                    Boolean(formData.parent)
                      ? "text-slate-400"
                      : "text-purple-700"
                  }`}
                >
                  Es Carpeta
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
