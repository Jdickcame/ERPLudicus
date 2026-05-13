import {
  CheckCircle,
  Loader2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";
import PaymentModal from "./components/PaymentModal";
import PosHeader from "./components/PosHeader";

// --- INTERFACES ---
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
  const { currentBranch } = useBranch();
  const { user } = useAuth();

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

  // 🔥 NUEVO: Estados para creación rápida de clientes
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    document_type: "DNI",
    tax_id: "",
    name: "",
    address: "",
    email: "",
    phone: "",
  });

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
        await api.get("/cash/shifts/current/");
        loadData();
      } catch (error: any) {
        if (error.response?.status === 404) {
          navigate("/pos/cash");
        }
      }
    };

    if (currentBranch) {
      verifyCashShift();
    }
  }, [currentBranch, navigate]);

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

  const handleOpenPayment = () => {
    if (cart.length === 0) return alert("⚠️ Carrito vacío");
    if (!currentBranch) return alert("⚠️ Selecciona una sede");
    setIsPaymentModalOpen(true);
  };

  const handleProcessSale = async (paymentData: any) => {
    setIsPaymentModalOpen(false);
    setIsLoading(true);

    try {
      const payload = {
        branch_id: currentBranch?.id,
        customer: selectedCustomerId,
        payments: paymentData.payments,
        invoice_type_code: paymentData.invoice_type_code,
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
      setLastSaleId(response.data.id);

      setCart([]);
      setSelectedCustomerId(null);
      setSaleNote("");
      loadData();

      setShowSuccessModal(true);
    } catch (error: any) {
      console.error(error);
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

  // 🔥 LÓGICA DE BÚSQUEDA Y CREACIÓN DE CLIENTE MEJORADA
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
      // 👇 MAGIA: Si no lo encuentra, abrimos el modal pre-llenado en vez de una alerta
      setNewCustomer({
        document_type: docNumber.length === 11 ? "RUC" : "DNI",
        tax_id: docNumber,
        name: "",
        address: "",
        email: "",
        phone: "",
      });
      setIsCustomerModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCreateCustomer = async () => {
    if (!newCustomer.name || !newCustomer.tax_id)
      return alert("⚠️ Nombre y Documento son obligatorios");
    setIsLoading(true);
    try {
      const res = await api.post("/sales/customers/", newCustomer);
      const createdCustomer = res.data;

      setCustomers((prev) => [...prev, createdCustomer]);
      setSelectedCustomerId(createdCustomer.id); // Lo auto-seleccionamos para la venta
      setIsCustomerModalOpen(false); // Cerramos el modal
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.error || "Error al crear cliente");
    } finally {
      setIsLoading(false);
    }
  };

  const openEmptyCustomerModal = () => {
    setNewCustomer({
      document_type: "DNI",
      tax_id: "",
      name: "",
      address: "",
      email: "",
      phone: "",
    });
    setIsCustomerModalOpen(true);
  };

  return (
    <div className="h-[calc(100vh)] flex flex-col bg-slate-100 overflow-hidden font-sans">
      <PosHeader />

      {/* --- MODAL CREACIÓN RÁPIDA CLIENTE --- */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="text-blue-600" /> Nuevo Cliente
              </h2>
              <button
                onClick={() => setIsCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Tipo Doc.
                  </label>
                  <select
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCustomer.document_type}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        document_type: e.target.value,
                      })
                    }
                  >
                    <option value="DNI">DNI</option>
                    <option value="RUC">RUC</option>
                    <option value="CE">CE</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Número <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCustomer.tax_id}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, tax_id: e.target.value })
                    }
                    placeholder="Escribe el documento..."
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Razón Social / Nombres <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCustomer.name}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, name: e.target.value })
                  }
                  placeholder="Nombre completo..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Dirección (Opcional)
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCustomer.address}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, address: e.target.value })
                  }
                  placeholder="Dirección..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCustomer.email}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, email: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setIsCustomerModalOpen(false)}
                className="flex-1 py-2.5 border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleQuickCreateCustomer}
                disabled={isLoading}
                className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 shadow-md"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  "Guardar Cliente"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPaymentModalOpen && (
        <PaymentModal
          total={totalToPay}
          selectedCustomer={selectedCustomer}
          isAdmin={isAdmin}
          onClose={() => setIsPaymentModalOpen(false)}
          onConfirm={handleProcessSale}
        />
      )}

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

      <div className="flex flex-1 overflow-hidden p-3 md:p-4 gap-3 md:gap-4">
        {/* IZQUIERDA: CATÁLOGO */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-3 md:p-4 border-b border-slate-100 z-10 bg-white">
            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={20}
              />
              <input
                type="text"
                placeholder="🔍 Buscar producto..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-50 custom-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`relative group bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-300 active:scale-95 flex flex-col justify-between h-36 transition-all ${product.stock <= 0 ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
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
                      <span className="text-blue-600 font-black text-lg leading-none">
                        S/ {parseFloat(product.price).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-blue-50 p-1.5 rounded-lg text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={16} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DERECHA: TICKET */}
        <div className="w-full md:w-[420px] flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden">
          {/* CABECERA DE VENTA Y BUSCADOR DE CLIENTE */}
          <div className="p-3 border-b border-slate-100 bg-white z-10 flex flex-col gap-2.5">
            <div className="flex justify-between items-center px-1">
              <h2 className="font-black text-slate-800 text-base flex items-center gap-2">
                <ShoppingCart className="text-blue-600" size={18} /> Ticket
              </h2>
              <span
                className={`text-[10px] px-2 py-1 rounded font-black tracking-wider uppercase ${invoiceType === "FACTURA" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}
              >
                {invoiceType}
              </span>
            </div>

            {!selectedCustomerId ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3 top-2.5 text-slate-400"
                    size={14}
                  />
                  <input
                    type="text"
                    placeholder="Agregar cliente (RUC/DNI) y Enter..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        searchCustomer((e.target as HTMLInputElement).value);
                    }}
                  />
                </div>
                <button
                  onClick={openEmptyCustomerModal}
                  className="bg-blue-50 text-blue-600 p-1.5 rounded hover:bg-blue-100 transition-colors border border-blue-100 shadow-sm flex items-center justify-center w-8"
                  title="Nuevo Cliente Manual"
                >
                  <Plus size={16} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 p-2 rounded flex justify-between items-center animate-in fade-in">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-blue-800 truncate">
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
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* LISTA DE PRODUCTOS COMPACTA */}
          <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <ShoppingCart size={40} className="opacity-20 mb-1" />
                <p className="text-sm font-bold text-slate-500">
                  Carrito vacío
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map((item, index) => (
                  <li
                    key={index}
                    className="p-3 hover:bg-slate-50 transition-colors group flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-xs text-slate-700 leading-tight line-clamp-2">
                        {item.product.name}
                      </span>
                      <span className="font-black text-sm text-slate-800 whitespace-nowrap">
                        S/ {(item.quantity * item.price).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
                        <button
                          onClick={() => updateQuantity(index, -1)}
                          className="px-2 py-1 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                        >
                          <Minus size={12} strokeWidth={3} />
                        </button>
                        <span className="w-8 text-center text-xs font-black text-slate-700">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(index, 1)}
                          className="px-2 py-1 bg-slate-50 hover:bg-green-50 text-slate-500 hover:text-green-600 transition-colors"
                        >
                          <Plus size={12} strokeWidth={3} />
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                          S/ {item.price.toFixed(2)} c/u
                        </span>
                        <button
                          onClick={() => removeFromCart(index)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* FOOTER DEL CARRITO */}
          <div className="bg-slate-50 border-t border-slate-200 z-20">
            <div className="px-3 py-1.5 border-b border-slate-200 bg-yellow-50/50">
              <input
                type="text"
                placeholder="✍️ Agregar nota a la venta..."
                className="w-full bg-transparent text-[11px] font-medium text-slate-600 outline-none placeholder:text-slate-400"
                value={saleNote}
                onChange={(e) => setSaleNote(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="p-3 md:p-4 flex flex-col gap-2">
              {/* 👇 AQUÍ SEPARAMOS SUBTOTAL E IGV Y AGREGAMOS UNA LÍNEA */}
              <div className="flex flex-col gap-1.5 px-1">
                <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
                  <span>Subtotal</span>
                  <span>S/ {baseImponible.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
                  <span>IGV (18%)</span>
                  <span>S/ {igvAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-slate-200/80 mx-1 my-0.5"></div>

              <div className="flex justify-between items-end px-1 mb-1">
                <span className="text-slate-800 font-black text-xs uppercase tracking-widest">
                  Total Pagar
                </span>
                <span className="text-3xl font-black text-blue-600 leading-none">
                  S/ {totalToPay.toFixed(2)}
                </span>
              </div>

              <button
                onClick={handleOpenPayment}
                disabled={cart.length === 0 || isLoading}
                className={`w-full mt-1 py-3.5 rounded-lg font-black text-base tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  isLoading || cart.length === 0
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200"
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
