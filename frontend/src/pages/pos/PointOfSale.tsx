import {
  CheckCircle,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
// 👇 1. Fix the api and context imports (might need to go up one more level depending on your structure)
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";
// 👇 2. Fix the PaymentModal import (it is now in the local components folder)
import PaymentModal from "./components/PaymentModal";
// 👇 3. Import the new PosHeader
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import PosHeader from "./components/PosHeader";

// ... (Interfaces Product, Customer, CartItem remain exactly the same) ...
interface Product {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock: number;
  category_name: string;
}
interface Customer {
  id: number;
  name: string;
  tax_id: string;
  document_type: string;
  address?: string;
}
interface CartItem {
  product: Product;
  quantity: number;
  price: number;
}

const PointOfSale = () => {
  const navigate = useNavigate();
  // 👈 Renamed component
  const { currentBranch } = useBranch();

  // 👇 NUEVO: Sacamos al usuario logueado
  const { user } = useAuth();

  // 👇 NUEVO: Creamos la misma validación que usaste en la Nota de Crédito
  const isAdmin =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  // Estados
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<number | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [saleNote, setSaleNote] = useState("");

  // Carga inicial
  const loadData = async () => {
    if (!currentBranch) return;
    try {
      const [prodRes, custRes] = await Promise.all([
        api.get(`/inventory/products/?branch_id=${currentBranch.id}`),
        api.get("/sales/customers/"),
      ]);
      setProducts(prodRes.data.results || prodRes.data);
      setCustomers(custRes.data.results || custRes.data);
    } catch (error) {
      console.error("Error", error);
    }
  };

  useEffect(() => {
    const verifyCashShift = async () => {
      try {
        // Consultamos si hay un turno abierto
        await api.get("/cash/shifts/current/");
        // Si hay turno, cargamos los datos normalmente
        loadData();
      } catch (error: any) {
        // Si el backend responde 404, significa que no hay turno abierto
        if (error.response?.status === 404) {
          navigate("/pos/cash"); // Lo mandamos a aperturar
        }
      }
    };

    if (currentBranch) {
      verifyCashShift();
    }
  }, [currentBranch, navigate]);

  // Cliente seleccionado
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const invoiceType = useMemo(() => {
    if (selectedCustomer?.document_type === "RUC") return "FACTURA";
    return "BOLETA";
  }, [selectedCustomer]);

  // Lógica Carrito
  const addToCart = (product: Product) => {
    if (product.stock <= 0) return alert("❌ Producto Agotado");
    const idx = cart.findIndex((item) => item.product.id === product.id);
    if (idx >= 0) {
      if (cart[idx].quantity + 1 > product.stock)
        return alert("Stock insuficiente");
      const newCart = [...cart];
      newCart[idx].quantity += 1;
      setCart(newCart);
    } else {
      setCart([
        ...cart,
        { product, quantity: 1, price: parseFloat(product.price) },
      ]);
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    const newQty = item.quantity + delta;
    if (newQty > item.product.stock) return alert("Stock máximo");
    if (newQty > 0) {
      item.quantity = newQty;
      setCart(newCart);
    }
  };

  const removeFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  // Cálculos
  const totalToPay = cart.reduce(
    (acc, item) => acc + item.quantity * item.price,
    0,
  );
  const baseImponible = totalToPay / 1.18;
  const igvAmount = totalToPay - baseImponible;

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // 1. CLICK EN COBRAR -> ABRE MODAL
  const handleOpenPayment = () => {
    if (cart.length === 0) return alert("⚠️ Carrito vacío");
    if (!currentBranch) return alert("⚠️ Selecciona una sede");
    setIsPaymentModalOpen(true);
  };

  // 2. CONFIRMACIÓN DESDE EL MODAL -> ENVÍA AL BACKEND
  const handleProcessSale = async (paymentData: any) => {
    setIsPaymentModalOpen(false);
    setIsLoading(true);

    try {
      const payload = {
        branch_id: currentBranch?.id,
        customer: selectedCustomerId,
        payments: paymentData.payments,
        invoice_type_code:
          paymentData.invoice_type === "TICKET"
            ? "99"
            : paymentData.invoice_type === "FACTURA"
              ? "01"
              : "03",
        total: totalToPay.toFixed(2),
        notes: saleNote,
        details: cart.map((item) => ({
          product: item.product.id,
          quantity: item.quantity,
          price: item.price.toFixed(2),
        })),
        is_courtesy: paymentData.is_courtesy || false,
        supervisor_pin: paymentData.supervisor_pin || null,
      };

      const response = await api.post("/sales/sales/", payload);
      const saleData = response.data;

      setLastSaleId(saleData.id);

      // Limpiamos el carrito y datos
      setCart([]);
      setSelectedCustomerId(null);
      setSaleNote("");
      loadData();

      setShowSuccessModal(true);
    } catch (error: any) {
      console.error(error);
      // 👇 Mejorar el error para que te muestre si el PIN falló en Django
      const errorMsg = error.response?.data?.error || "Error al procesar venta";
      alert(`❌ ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const printTicket = async () => {
    const idToPrint = lastSaleId;
    if (!idToPrint) {
      alert("⚠️ No hay venta para imprimir. Haz una venta primero.");
      return;
    }

    try {
      console.log(`🖨️ Solicitando impresión directa para ID: ${idToPrint}`);
      const response = await api.get(`/sales/sales/${idToPrint}/print/`, {
        responseType: "blob",
      });

      const pdfBlob = new Blob([response.data], { type: "application/pdf" });
      const pdfUrl = window.URL.createObjectURL(pdfBlob);

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = pdfUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
      };

      setTimeout(() => {
        document.body.removeChild(iframe);
        window.URL.revokeObjectURL(pdfUrl);
      }, 60000);
    } catch (error) {
      console.error("❌ Error al imprimir:", error);
      alert("No se pudo iniciar la impresión directa.");
    }
  };

  const searchCustomer = async (docNumber: string) => {
    if (!docNumber) return;
    setIsLoading(true);
    try {
      const res = await api.get(
        `/sales/customers/search_doc/?doc=${docNumber}`,
      );
      const customerData = res.data;

      setCustomers((prev) => {
        const filtered = prev.filter((c) => c.id !== customerData.id);
        return [...filtered, customerData];
      });
      setSelectedCustomerId(customerData.id);
    } catch (error) {
      console.error(error);
      alert("❌ No se encontró información para este documento.");
      setSelectedCustomerId(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // 👇 Added flex-col so the header sits on top and the content takes the remaining height
    <div className="h-[calc(100vh)] flex flex-col bg-slate-100 overflow-hidden font-sans">
      {/* 👇 4. INJECT THE POS HEADER AT THE VERY TOP */}
      <PosHeader />

      {/* --- AQUÍ VA EL MODAL DE PAGO --- */}
      {isPaymentModalOpen && (
        <PaymentModal
          total={totalToPay}
          selectedCustomer={selectedCustomer}
          // 🔥 NUEVO: ¡Le pasamos el poder al modal!
          isAdmin={isAdmin}
          onClose={() => setIsPaymentModalOpen(false)}
          onConfirm={handleProcessSale}
        />
      )}

      {/* --- MODAL DE ÉXITO --- */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 text-center transform scale-100 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-100 mb-6">
              <CheckCircle
                className="h-10 w-10 text-green-600"
                strokeWidth={3}
              />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">
              ¡Venta Exitosa!
            </h2>
            <p className="text-slate-500 mb-8 font-medium">
              La transacción se ha registrado correctamente.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={printTicket}
                className="w-full bg-slate-900 text-white py-3.5 px-4 rounded-xl font-bold text-lg hover:bg-black transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                autoFocus
              >
                <Printer size={24} /> IMPRIMIR TICKET
              </button>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-white text-slate-600 py-3 px-4 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👇 Wrap the layout in a flex-1 container so it fills the screen below the header */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* IZQUIERDA: CATÁLOGO */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 z-10 bg-white">
            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={20}
              />
              <input
                type="text"
                placeholder="🔍 Buscar producto..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`relative group bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md active:scale-95 flex flex-col justify-between h-36 ${product.stock <= 0 ? "opacity-60 grayscale cursor-not-allowed" : ""}`}
                >
                  <div
                    className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${product.stock > 10 ? "bg-green-100 text-green-700" : product.stock > 0 ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}
                  >
                    {product.stock} un.
                  </div>
                  <div className="mt-4">
                    <h4 className="font-bold text-sm text-slate-700 line-clamp-2 leading-snug">
                      {product.name}
                    </h4>
                    <span className="text-xs text-slate-400 font-mono">
                      {product.sku}
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-50 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400">Precio</span>
                      <span className="text-blue-600 font-black text-lg">
                        S/ {parseFloat(product.price).toFixed(2)}
                      </span>
                    </div>
                    <Plus
                      size={18}
                      className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DERECHA: TICKET (CARRITO OPTIMIZADO) */}
        <div className="w-full md:w-[400px] flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 h-full overflow-hidden">
          {/* 1. CABECERA Y CLIENTE (Ultra Compacto) */}
          <div className="p-4 border-b border-slate-100 bg-white z-10 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h2 className="font-black text-slate-800 text-lg flex items-center gap-2">
                <ShoppingCart className="text-blue-600" size={20} /> Venta
              </h2>
              <span
                className={`text-[10px] px-2 py-1 rounded font-black tracking-wider uppercase ${
                  invoiceType === "FACTURA"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {invoiceType}
              </span>
            </div>

            {!selectedCustomerId ? (
              <div className="relative">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  id="client-search-input"
                  placeholder="Agregar cliente (RUC/DNI)..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      searchCustomer((e.target as HTMLInputElement).value);
                  }}
                />
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-lg flex justify-between items-center animate-in fade-in">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-blue-800 truncate">
                    {selectedCustomer?.name}
                  </p>
                  <p className="text-[10px] text-blue-600 font-mono">
                    {selectedCustomer?.document_type}:{" "}
                    {selectedCustomer?.tax_id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="text-blue-400 hover:text-red-500 shrink-0 ml-2 p-1 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* 2. LISTA DE PRODUCTOS (Expande todo el espacio restante) */}
          <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50 custom-scrollbar space-y-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <ShoppingCart size={48} className="opacity-20 mb-2" />
                <p className="text-sm font-bold text-slate-500">
                  El carrito está vacío
                </p>
                <p className="text-xs text-center px-8 opacity-60">
                  Agrega productos desde el catálogo a la izquierda.
                </p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={index}
                  className="flex flex-col p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-bold text-sm text-slate-700 leading-tight pr-2 line-clamp-2">
                      {item.product.name}
                    </p>
                    <button
                      onClick={() => removeFromCart(index)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex justify-between items-end">
                    {/* Controles de Cantidad */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                      <button
                        onClick={() => updateQuantity(index, -1)}
                        className="p-1 hover:bg-white rounded-md text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-black text-slate-700">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(index, 1)}
                        className="p-1 hover:bg-white rounded-md text-slate-500 hover:text-green-600 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {/* Precios */}
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-medium mb-0.5">
                        S/ {item.price.toFixed(2)} c/u
                      </p>
                      <p className="font-black text-slate-800">
                        S/ {(item.quantity * item.price).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 3. FOOTER DEL CARRITO: NOTA + TOTALES + BOTÓN */}
          <div className="bg-white border-t border-slate-200 z-20 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col">
            {/* Nota Compacta Integrada */}
            <div className="px-4 py-2.5 border-b border-slate-100 bg-yellow-50/30">
              <input
                type="text"
                placeholder="✍️ Nota opcional (Ej. Mesa 34, Cortesía staff...)"
                className="w-full bg-transparent text-xs font-medium text-slate-600 outline-none placeholder:text-slate-400"
                value={saleNote}
                onChange={(e) => setSaleNote(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Zona de Totales */}
            <div className="p-5">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
                <span>Op. Gravada</span>
                <span>S/ {baseImponible.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mb-3 font-medium">
                <span>IGV (18%)</span>
                <span>S/ {igvAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-end mb-5">
                <span className="text-slate-800 font-black text-sm uppercase tracking-wider">
                  TOTAL
                </span>
                <span className="text-4xl font-black text-blue-600 leading-none">
                  S/ {totalToPay.toFixed(2)}
                </span>
              </div>

              <button
                onClick={handleOpenPayment}
                disabled={cart.length === 0 || isLoading}
                className={`w-full py-4 rounded-xl font-black text-lg tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  isLoading || cart.length === 0
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
                }`}
              >
                {isLoading ? "PROCESANDO..." : "COBRAR AHORA"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PointOfSale;
