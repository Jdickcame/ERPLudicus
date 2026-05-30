import { AlertCircle, ChefHat, Plus, Trash2, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";

interface Product {
  id: number;
  name: string;
  product_type: string;
  uom_display: string;
}

interface RecipeItem {
  id: number;
  ingredient: number;
  ingredient_name: string; // Asumiendo que tu serializador devuelve esto
  ingredient_uom: string;
  quantity: string | number;
}

const RecipeManager = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedFinishedProduct, setSelectedFinishedProduct] = useState<
    number | ""
  >("");

  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Estado del formulario de nuevo ingrediente
  const [newIngredient, setNewIngredient] = useState("");
  const [newQuantity, setNewQuantity] = useState("");

  // 1. Cargar todos los productos al iniciar
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        console.log("=== RecipeManager: Fetching products ===");
        console.log("URL:", "/inventory/products/?is_active=&page_size=1000");

        const res = await api.get(
          "/inventory/products/?is_active=&page_size=1000",
        );

        console.log("Response status:", res.status);
        console.log("Response data:", res.data);

        const data = res.data.results || res.data;
        console.log("Products loaded:", data.length);
        console.log("First 5 products:", data.slice(0, 5));

        setProducts(data);
      } catch (err: any) {
        console.error("Error cargando productos:", err);
        console.error("Error response:", err.response?.data);
      }
    };
    fetchProducts();
  }, []);

  // 2. Cargar la receta cuando se selecciona un Producto Terminado
  useEffect(() => {
    if (!selectedFinishedProduct) {
      setRecipeItems([]);
      return;
    }

    const fetchRecipe = async () => {
      setLoading(true);
      try {
        // Asumiendo que tu endpoint de recetas filtra por finished_product
        const res = await api.get(
          `/inventory/recipes/?finished_product=${selectedFinishedProduct}`,
        );
        setRecipeItems(res.data.results || res.data);
      } catch (err) {
        console.error("Error cargando receta:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipe();
  }, [selectedFinishedProduct]);

  // Filtramos los productos que PUEDEN TENER una receta (Padres)
  const finishedProducts = products.filter(
    (p) => p.product_type === "FINISHED" || p.product_type === "INTERMEDIATE",
  );

  // Debug: ver todos los tipos disponibles
  const productTypes = [...new Set(products.map((p) => p.product_type))];
  console.log("Tipos de productos en BD:", productTypes);

  // Filtramos los productos que pueden USARSE como ingredientes (Hijos)
  const ingredients = products.filter(
    (p) =>
      p.product_type === "STOCKED" ||
      p.product_type === "CONSUMABLE" ||
      p.product_type === "INTERMEDIATE" ||
      p.product_type === "FINISHED",
  );

  // 3. Agregar un ingrediente a la receta
  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedFinishedProduct || !newIngredient || !newQuantity) {
      setError("Por favor completa todos los campos del ingrediente.");
      return;
    }

    try {
      const payload = {
        finished_product: selectedFinishedProduct,
        ingredient: parseInt(newIngredient),
        quantity: parseFloat(newQuantity),
      };

      const res = await api.post("/inventory/recipes/", payload);

      // Agregamos el nuevo item a la lista visualmente
      // (Si tu backend no devuelve el nombre, hacemos un pequeño cruce con la lista de productos)
      const addedIngredient = ingredients.find(
        (i) => i.id === payload.ingredient,
      );

      const newItem: RecipeItem = {
        id: res.data.id,
        ingredient: payload.ingredient,
        ingredient_name: addedIngredient?.name || "Ingrediente",
        ingredient_uom: addedIngredient?.uom_display || "UND",
        quantity: payload.quantity,
      };

      setRecipeItems([...recipeItems, newItem]);

      // Limpiamos el formulario
      setNewIngredient("");
      setNewQuantity("");
    } catch (err: any) {
      console.error(err);
      setError(
        "Error al agregar el ingrediente. ¿Quizás ya está en la receta?",
      );
    }
  };

  // 4. Eliminar un ingrediente de la receta
  const handleDeleteIngredient = async (recipeId: number) => {
    try {
      await api.delete(`/inventory/recipes/${recipeId}/`);
      setRecipeItems(recipeItems.filter((item) => item.id !== recipeId));
    } catch (err) {
      console.error("Error eliminando ingrediente", err);
      alert("No se pudo eliminar el ingrediente.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ChefHat className="text-purple-600" /> Gestor de Recetas
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Configura la lista de materiales (BOM) para tus productos terminados.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* COLUMNA IZQUIERDA: Controles */}
        <div className="md:col-span-1 space-y-6">
          {/* Tarjeta 1: Seleccionar Producto */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <label className="block text-sm font-bold text-slate-700 mb-2">
              1. Selecciona un Producto a Preparar
            </label>
            <select
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition"
              value={selectedFinishedProduct}
              onChange={(e) =>
                setSelectedFinishedProduct(
                  e.target.value ? parseInt(e.target.value) : "",
                )
              }
            >
              <option value="">-- Elige un producto --</option>
              {finishedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {finishedProducts.length === 0 && (
              <p className="text-xs text-orange-500 mt-2">
                No tienes productos tipo "Terminado" en tu catálogo.
              </p>
            )}
          </div>

          {/* Tarjeta 2: Agregar Ingrediente (Solo visible si hay producto seleccionado) */}
          {selectedFinishedProduct && (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 border-t-4 border-t-purple-500">
              <h3 className="text-sm font-bold text-slate-700 mb-4">
                2. Agregar Insumo a la receta
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-start gap-2 text-xs border border-red-200">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleAddIngredient} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Insumo / Material
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg outline-none text-sm"
                    value={newIngredient}
                    onChange={(e) => setNewIngredient(e.target.value)}
                    required
                  >
                    <option value="">-- Buscar insumo --</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.uom_display})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Cantidad Necesaria
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg outline-none text-sm"
                      placeholder="Ej: 0.150"
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(e.target.value)}
                      required
                    />
                    <span className="inline-flex items-center px-3 bg-slate-100 border border-slate-300 rounded-lg text-xs text-slate-500 font-bold">
                      {newIngredient
                        ? ingredients.find(
                            (i) => i.id === parseInt(newIngredient),
                          )?.uom_display
                        : "U.M."}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg flex justify-center items-center gap-2 transition text-sm font-medium shadow-sm"
                >
                  <Plus size={16} /> Añadir a la Receta
                </button>
              </form>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: La Receta Visual */}
        <div className="md:col-span-2">
          {!selectedFinishedProduct ? (
            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl h-full min-h-[300px] flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <Utensils size={48} className="mb-4 text-slate-300" />
              <p className="text-lg font-medium text-slate-500">
                Ningún producto seleccionado
              </p>
              <p className="text-sm mt-1">
                Selecciona un producto a la izquierda para ver o editar su
                receta.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                  <h2 className="font-bold text-slate-800 text-lg">
                    Lista de Materiales
                  </h2>
                  <p className="text-xs text-slate-500">
                    Lo que se descontará del inventario por cada unidad vendida.
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="p-10 text-center text-slate-500">
                  Cargando receta...
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b">
                    <tr>
                      <th className="p-4">Insumo</th>
                      <th className="p-4 text-center">Cantidad</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recipeItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-10 text-center text-slate-400 italic"
                        >
                          Esta receta aún no tiene ingredientes.
                        </td>
                      </tr>
                    ) : (
                      recipeItems.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50 transition group"
                        >
                          <td className="p-4 font-medium text-slate-700">
                            {item.ingredient_name ||
                              `Insumo ID: ${item.ingredient}`}
                          </td>
                          <td className="p-4 text-center">
                            <span className="bg-slate-100 px-3 py-1 rounded-full text-slate-800 font-bold text-xs border border-slate-200">
                              {item.quantity} {item.ingredient_uom}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteIngredient(item.id)}
                              className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition opacity-0 group-hover:opacity-100"
                              title="Quitar de la receta"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipeManager;
