import { Calculator, FileText, Save, Search, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

// --- INTERFACES ---
interface ProductStock {
  quantity: number;
  price: number;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  stock: ProductStock | number;
  price?: number;
}

interface CartItem {
  product_id: number;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

const NewWebSale = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  // --- ESTADOS: CABECERA ---
  const [docType, setDocType] = useState("03"); // 03 = Boleta, 01 = Factura
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [customerDoc, setCustomerDoc] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [isSearchingClient, setIsSearchingClient] = useState(false);

  // --- ESTADOS: DETALLE (CARRITO) ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);

  // --- ESTADOS: TOTALES ---
  const [totals, setTotals] = useState({ subtotal: 0, igv: 0, total: 0 });
  const [isSaving, setIsSaving] = useState(false);

  // --- EFECTOS ---
  useEffect(() => {
    const total = cart.reduce((acc, item) => acc + item.subtotal, 0);
    const subtotal = total / 1.18;
    const igv = total - subtotal;
    setTotals({ subtotal, igv, total });
  }, [cart]);

  useEffect(() => {
    if (productSearch.length < 2 || !currentBranch) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(() => {
      setIsSearchingProduct(true);
      api
        .get(`/inventory/products/`, {
          params: {
            search: productSearch,
            for_pos: true,
            branch_id: currentBranch.id,
            page_size: 100,
          },
        })
        .then((res) => {
          setSearchResults(
            Array.isArray(res.data) ? res.data : res.data.results,
          );
        })
        .catch((err) => console.error(err))
        .finally(() => setIsSearchingProduct(false));
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [productSearch, currentBranch]);

  // --- FUNCIONES ---
  const searchClient = async () => {
    if (!customerDoc) return;
    setIsSearchingClient(true);
    try {
      const res = await api.get(
        `/sales/customers/search_doc/?doc=${customerDoc}`,
      );
      setCustomerName(res.data.data.name);

      if (res.data.exists_local && res.data.data.id) {
        setCustomerId(res.data.data.id);
      } else {
        setCustomerId(null);
      }

      if (customerDoc.length === 11) setDocType("01");
      if (customerDoc.length === 8) setDocType("03");
    } catch (error: any) {
      alert(error.response?.data?.error || "Cliente no encontrado");
      setCustomerName("");
      setCustomerId(null);
    } finally {
      setIsSearchingClient(false);
    }
  };

  const addProductToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.product_id === product.id);
    const getPrice = (p: Product) => {
      if (typeof p.stock === "object" && p.stock !== null) {
        return p.stock.price;
      }
      return p.price as number;
    };
    const price = getPrice(product);

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product_id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * price,
              }
            : item,
        ),
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          name: product.name,
          quantity: 1,
          price: price,
          subtotal: price,
        },
      ]);
    }
    setProductSearch("");
    setSearchResults([]);
  };

  const updateQuantity = (productId: number, newQty: number) => {
    if (newQty < 1) return;
    setCart(
      cart.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: newQty, subtotal: newQty * item.price }
          : item,
      ),
    );
  };

  const updatePrice = (productId: number, newPrice: number) => {
    if (newPrice < 0) return;
    setCart(
      cart.map((item) =>
        item.product_id === productId
          ? { ...item, price: newPrice, subtotal: item.quantity * newPrice }
          : item,
      ),
    );
  };

  const removeProduct = (productId: number) => {
    setCart(cart.filter((item) => item.product_id !== productId));
  };

  const handleGenerateSale = async () => {
    if (cart.length === 0) return alert("Agrega al menos un producto.");
    if (docType === "01" && customerDoc.length !== 11)
      return alert("La Factura requiere un RUC válido.");

    const cleanDoc = customerDoc.trim();
    setIsSaving(true);
    try {
      let finalCustomerId = customerId;
      if (!finalCustomerId && cleanDoc && customerName) {
        const newClientRes = await api.post("/sales/customers/", {
          name: customerName,
          tax_id: cleanDoc,
          document_type: cleanDoc.length >= 11 ? "RUC" : "DNI",
          address: "PERU",
        });
        finalCustomerId = newClientRes.data.id;
      }

      // 👇 AQUÍ ESTÁ EL AJUSTE PARA QUE HAGA MATCH PERFECTO CON DJANGO 👇
      const payload = {
        branch_id: currentBranch?.id,
        invoice_type_code: docType,
        customer: finalCustomerId || null,

        // Las llaves que el backend views.py está buscando
        customer_document: cleanDoc || "00000000",
        customer_name: customerName || "PÚBLICO GENERAL",
        customer_type:
          cleanDoc.length >= 11 ? "RUC" : cleanDoc.length === 9 ? "CE" : "DNI",
        // --------------------------------------------------------

        date: new Date().toISOString(),
        total: totals.total.toFixed(2),
        is_courtesy: false,
        payments: [
          {
            payment_method: paymentMethod,
            amount: totals.total.toFixed(2),
          },
        ],
        details: cart.map((item) => ({
          product: item.product_id,
          quantity: item.quantity,
          price: item.price.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
        })),
      };

      const saleRes = await api.post("/sales/sales/?origin=web", payload);

      const pdfRes = await api.get(
        `/sales/sales/${saleRes.data.id}/print/?papel=a4`,
        {
          responseType: "blob",
        },
      );
      const pdfUrl = window.URL.createObjectURL(
        new Blob([pdfRes.data], { type: "application/pdf" }),
      );
      window.open(pdfUrl, "_blank");

      navigate("/sales/list"); // Regresamos al historial
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.error || "Error al generar la venta.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
          <FileText size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Nueva Venta
          </h1>
          <p className="text-sm text-slate-500">
            Emisión de Boletas y Facturas
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <User size={16} /> 1. Datos del Comprobante
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Tipo de Documento
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                >
                  <option value="03">Boleta Electrónica</option>
                  <option value="01">Factura Electrónica</option>
                  <option value="99">Nota de Venta (Interna)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Buscar Cliente (DNI / RUC)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customerDoc}
                    onChange={(e) => setCustomerDoc(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchClient()}
                    placeholder="Ingrese número..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button
                    onClick={searchClient}
                    disabled={isSearchingClient}
                    className="bg-slate-800 text-white p-2.5 rounded-lg hover:bg-slate-900 transition flex items-center justify-center min-w-[44px]"
                  >
                    {isSearchingClient ? (
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <Search size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Razón Social / Nombre
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Público General"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[400px] flex flex-col">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileText size={16} /> 2. Detalle de Venta
            </h2>

            <div className="relative mb-6 z-10">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {isSearchingProduct ? (
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                ) : (
                  <Search size={18} className="text-slate-400" />
                )}
              </div>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar producto por nombre o SKU..."
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-blue-100 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium"
              />

              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden max-h-60 overflow-y-auto">
                  {searchResults.map((prod) => (
                    <button
                      key={prod.id}
                      onClick={() => addProductToCart(prod)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 flex justify-between items-center transition group"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700 group-hover:text-blue-600">
                          {prod.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {prod.sku}
                        </span>
                      </div>
                      <span className="font-bold text-green-600">
                        S/{" "}
                        {typeof prod.stock === "object"
                          ? prod.stock.price.toFixed(2)
                          : (prod.price || 0).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold sticky top-0 shadow-sm">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3 w-24">Cant.</th>
                    <th className="px-4 py-3 w-32">P. Unitario</th>
                    <th className="px-4 py-3 w-24 text-right">Subtotal</th>
                    <th className="px-4 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cart.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-slate-400"
                      >
                        No hay productos en el detalle.
                      </td>
                    </tr>
                  ) : (
                    cart.map((item) => (
                      <tr key={item.product_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {item.name}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateQuantity(
                                item.product_id,
                                parseInt(e.target.value) || 1,
                              )
                            }
                            className="w-full p-1.5 text-center bg-white border border-slate-300 rounded outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">S/</span>
                            <input
                              type="number"
                              min="0"
                              step="0.10"
                              value={item.price}
                              onChange={(e) =>
                                updatePrice(
                                  item.product_id,
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="w-full p-1.5 bg-white border border-slate-300 rounded outline-none focus:border-blue-500"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">
                          S/ {item.subtotal.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeProduct(item.product_id)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calculator size={16} /> 3. Resumen
            </h2>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-600 mb-2">
                Método de Pago
              </label>
              <div className="grid grid-cols-2 gap-2">
                {["CASH", "YAPE", "CARD", "TRANSFER"].map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`p-2 rounded-lg text-xs font-bold transition-all border ${
                      paymentMethod === method
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {method === "CASH"
                      ? "Efectivo"
                      : method === "CARD"
                      ? "Tarjeta"
                      : method === "YAPE"
                      ? "Yape/Plin"
                      : "Transfer."}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl space-y-3 mb-6">
              <div className="flex justify-between text-sm text-slate-500 font-medium">
                <span>Op. Gravada</span>
                <span>S/ {totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500 font-medium">
                <span>IGV (18%)</span>
                <span>S/ {totals.igv.toFixed(2)}</span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-end">
                <span className="text-sm font-bold text-slate-800 uppercase">
                  Total a Pagar
                </span>
                <span className="text-3xl font-black text-blue-600">
                  S/ {totals.total.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={handleGenerateSale}
              disabled={isSaving || cart.length === 0}
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20"
            >
              {isSaving ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <Save size={20} /> GENERAR E IMPRIMIR
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewWebSale;
