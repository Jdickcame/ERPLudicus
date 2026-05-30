import { Capacitor } from "@capacitor/core";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckCircle,
  Clock,
  Loader2,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  UserPlus,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";
import { db } from "../../db/database";
import { BluetoothPrinter } from "../../utils/BluetoothPrinter";
import { numeroALetras } from "../../utils/numeroALetras";
import PaymentModal from "./components/PaymentModal";
import PosHeader from "./components/PosHeader";

// --- INTERFACES ---
interface ProductStock {
  stock_id: number;
  is_enabled: boolean;
  quantity: number;
  selling_price: number | null;
  price: number;
  average_cost: number;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  price: string | number;
  product_type: string;
  manage_stock: boolean;
  is_sellable: boolean;
  stock: ProductStock | number;
  category_name?: string;
  colab_price?: string | number | null;
  is_group?: boolean;
  parent?: number | null;
}

interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  cartItemId?: string;
}

interface PosTab {
  id: string;
  label: string;
  cart: CartItem[];
  selectedCustomerId: number | null;
  saleNote: string;
  appliedDiscount: {
    amount: number;
    reason: string;
    authorizedById: number | null;
  };
}

const ClockWidget = ({ isAndroid }: { isAndroid: boolean }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  let hours = time.getHours();
  const isPM = hours >= 12;
  const ampm = isPM ? "P. M." : "A. M.";

  hours = hours % 12;
  hours = hours ? hours : 12;

  const hh = hours.toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");
  const ss = time.getSeconds().toString().padStart(2, "0");

  const iconColor = isAndroid ? "text-pink-500" : "text-cyan-500";
  const mainColor = isAndroid ? "text-pink-400" : "text-cyan-400";
  const subColor = isAndroid ? "text-pink-600" : "text-cyan-600";

  return (
    <div className="flex items-center gap-2.5 bg-slate-900 px-4 py-1.5 rounded-xl border border-slate-700/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] shrink-0">
      <Clock size={20} className={`${iconColor} shrink-0`} />
      <div
        className="flex items-baseline justify-center whitespace-nowrap select-none"
        style={{ fontFamily: "'RelojDigital', monospace" }}
      >
        <div
          className={`flex items-center justify-center text-[20px] tracking-wider leading-none ${mainColor}`}
        >
          <span className="w-[36px] text-center inline-block shrink-0">
            {hh}
          </span>
          <span className="w-[12px] text-center inline-block shrink-0 opacity-80 pb-0.5">
            :
          </span>
          <span className="w-[36px] text-center inline-block shrink-0">
            {mm}
          </span>
          <span className="w-[12px] text-center inline-block shrink-0 opacity-80 pb-0.5 ml-1">
            :
          </span>
          <span className="w-[36px] text-center inline-block shrink-0">
            {ss}
          </span>
        </div>
        <span
          className={`text-[11px] font-black ml-2 mb-0.5 leading-none ${subColor}`}
        >
          {ampm}
        </span>
      </div>
    </div>
  );
};

const PointOfSale = () => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const { user } = useAuth();

  const isAndroid = Capacitor.getPlatform() === "android";

  const isAdmin =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  const products = useLiveQuery(() => db.products.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  const [searchTerm, setSearchTerm] = useState("");

  const [isColabMode, setIsColabMode] = useState(false);

  const getInitialTabs = (): PosTab[] => {
    const savedTabs = localStorage.getItem("pos_saved_tabs");
    if (savedTabs) {
      try {
        const parsed = JSON.parse(savedTabs) as PosTab[];
        if (parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Error leyendo pestañas guardadas", e);
      }
    }
    return [
      {
        id: uuidv4(),
        label: "Ticket 1",
        cart: [],
        selectedCustomerId: null,
        saleNote: "",
        appliedDiscount: { amount: 0, reason: "", authorizedById: null },
      },
    ];
  };

  const [tabs, setTabs] = useState<PosTab[]>(getInitialTabs);

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const savedId = localStorage.getItem("pos_active_tab_id");
    const exists = getInitialTabs().some((t) => t.id === savedId);
    return exists ? savedId! : getInitialTabs()[0].id;
  });

  useEffect(() => {
    localStorage.setItem("pos_saved_tabs", JSON.stringify(tabs));
    localStorage.setItem("pos_active_tab_id", activeTabId);
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const cart = activeTab.cart;
  const selectedCustomerId = activeTab.selectedCustomerId;
  const saleNote = activeTab.saleNote;

  const appliedDiscount = activeTab.appliedDiscount || {
    amount: 0,
    reason: "",
    authorizedById: null,
  };

  const updateActiveTab = (updates: Partial<PosTab>) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, ...updates } : t)),
    );
  };

  const handleAddTab = () => {
    if (tabs.length >= 8)
      return toast.error("Límite de tickets en espera alcanzado");
    const newTab = {
      id: uuidv4(),
      label: `Ticket ${tabs.length + 1}`,
      cart: [],
      selectedCustomerId: null,
      saleNote: "",
      appliedDiscount: { amount: 0, reason: "", authorizedById: null },
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      updateActiveTab({
        cart: [],
        selectedCustomerId: null,
        saleNote: "",
        appliedDiscount: { amount: 0, reason: "", authorizedById: null },
      });
      return;
    }
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const isProcessingRef = useRef(false);

  const [lastSaleId, setLastSaleId] = useState<number | null>(null);
  const [lastTicketSnapshot, setLastTicketSnapshot] = useState<any>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [openPriceProduct, setOpenPriceProduct] = useState<Product | null>(
    null,
  );
  const [openPriceValue, setOpenPriceValue] = useState<string>("");

  const [activeGroupProduct, setActiveGroupProduct] = useState<Product | null>(
    null,
  );

  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    document_type: "DNI",
    tax_id: "",
    name: "",
    address: "",
    email: "",
    phone: "",
  });

  const [activeCategory, setActiveCategory] = useState<string>("Todas");

  useEffect(() => {
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncLocalCatalog = async (isManual = false) => {
    if (!currentBranch) {
      if (isManual) toast.error("No hay sucursal seleccionada.");
      return;
    }

    if (isManual) setIsSyncingCatalog(true);

    try {
      const currentCashRegisterId = localStorage.getItem(
        "pos_cash_register_id",
      );
      let urlProducts = `/inventory/products/?branch_id=${currentBranch.id}&for_pos=true`;

      if (currentCashRegisterId) {
        urlProducts += `&cash_register_id=${currentCashRegisterId}`;
      }

      const [prodRes, custRes, usersRes, companyRes] = await Promise.all([
        api.get(urlProducts),
        api.get("/sales/customers/"),
        api.get("/users/users/"),
        api.get("/company/company/"),
      ]);

      const fetchedProducts = prodRes.data.results || prodRes.data;
      const fetchedCustomers = custRes.data.results || custRes.data;
      const fetchedUsers = usersRes.data.results || usersRes.data;

      await db.transaction(
        "rw",
        db.products,
        db.customers,
        db.users,
        async () => {
          await db.products.clear();
          await db.products.bulkPut(fetchedProducts);

          await db.customers.clear();
          await db.customers.bulkPut(fetchedCustomers);

          await db.users.clear();
          await db.users.bulkPut(fetchedUsers);
        },
      );

      const companyData =
        companyRes.data.results && companyRes.data.results.length > 0
          ? companyRes.data.results[0]
          : companyRes.data;

      if (companyData) {
        localStorage.setItem(
          "company_name",
          companyData.name || "EMPRESA S.A.",
        );
        localStorage.setItem(
          "company_short_name",
          companyData.short_name || "EMPRESA",
        );
        localStorage.setItem("company_ruc", companyData.ruc || "00000000000");
      }

      setActiveCategory("Todas");
      setIsOfflineMode(false);
      if (isManual) toast.success("Catálogo actualizado.");
    } catch (error) {
      console.error("Error sincronizando catálogo offline:", error);
      setIsOfflineMode(true);
      if (isManual) toast.error("Trabajando sin conexión (Catálogo local).");
    } finally {
      if (isManual) setIsSyncingCatalog(false);
    }
  };

  useEffect(() => {
    const verifyCashShift = async () => {
      try {
        const res = await api.get("/cash/shifts/current/");
        if (res.data && res.data.cash_register) {
          localStorage.setItem(
            "pos_cash_register_id",
            res.data.cash_register.toString(),
          );
        }
        syncLocalCatalog();
      } catch (error: any) {
        if (error.response) {
          setIsOfflineMode(false);
          if (error.response.status === 404) navigate("/pos/cash");
        } else {
          setIsOfflineMode(true);
        }
      }
    };
    if (currentBranch) verifyCashShift();
  }, [currentBranch, navigate]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const previewInvoiceType = useMemo(() => {
    if (selectedCustomer?.document_type === "RUC") return "FACTURA";
    return "BOLETA";
  }, [selectedCustomer]);

  const getStockQty = (product: Product) => {
    if (!product.manage_stock) return 9999;
    if (typeof product.stock === "object" && product.stock !== null) {
      return product.stock.quantity;
    }
    return typeof product.stock === "number" ? product.stock : 0;
  };

  const getProductPrice = (product: Product): number => {
    if (typeof product.stock === "object" && product.stock !== null) {
      return typeof product.stock.price === "string"
        ? parseFloat(product.stock.price)
        : product.stock.price;
    }
    return typeof product.price === "string"
      ? parseFloat(product.price)
      : product.price;
  };

  const addToCart = (product: Product) => {
    if (product.is_group) {
      setActiveGroupProduct(product);
      return;
    }

    // 👇 1. BLOQUEO DE STOCK AL AGREGAR 👇
    if (product.manage_stock) {
      // Buscar si el producto ya está en el carrito para sumar la cantidad actual
      const currentQty =
        cart.find((item) => item.product.id === product.id && !item.cartItemId)
          ?.quantity || 0;

      const maxStock = getStockQty(product);

      if (currentQty >= maxStock) {
        toast.error(`Stock insuficiente. Solo quedan ${maxStock} unidades.`, {
          icon: "📦",
        });
        return; // Detiene la ejecución y no lo agrega
      }
    }

    let productPrice = getProductPrice(product);

    if (
      isColabMode &&
      product.colab_price !== null &&
      product.colab_price !== undefined &&
      product.colab_price !== ""
    ) {
      productPrice =
        typeof product.colab_price === "string"
          ? parseFloat(product.colab_price)
          : product.colab_price;
    }

    const isOpenPrice =
      product.product_type === "SERVICE" && productPrice === 0;

    if (isOpenPrice) {
      setOpenPriceProduct(product);
      setOpenPriceValue("");
      return;
    }

    const idx = cart.findIndex(
      (item) => item.product.id === product.id && !item.cartItemId,
    );

    if (idx >= 0) {
      const newCart = [...cart];
      newCart[idx].quantity += 1;
      updateActiveTab({ cart: newCart });
    } else {
      updateActiveTab({
        cart: [...cart, { product, quantity: 1, price: productPrice }],
      });
    }
  };

  const handleConfirmOpenPrice = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!openPriceProduct) return;

    const precioFinal = parseFloat(openPriceValue.replace(",", "."));
    if (isNaN(precioFinal) || precioFinal <= 0) {
      return toast.error("Por favor, ingrese un monto válido mayor a 0.");
    }

    const uniqueCartId = `${openPriceProduct.id}-${Date.now()}`;

    updateActiveTab({
      cart: [
        ...cart,
        {
          product: openPriceProduct,
          quantity: 1,
          price: precioFinal,
          cartItemId: uniqueCartId,
        },
      ],
    });

    setOpenPriceProduct(null);
    setOpenPriceValue("");
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    const newQty = item.quantity + delta;

    // 👇 2. BLOQUEO DE STOCK AL SUMAR CON EL BOTÓN "+" 👇
    if (delta > 0 && item.product.manage_stock) {
      const maxStock = getStockQty(item.product);
      if (newQty > maxStock) {
        toast.error(`Límite alcanzado. Solo tienes ${maxStock} en stock.`, {
          icon: "📦",
        });
        return; // Detiene la suma
      }
    }

    if (newQty > 0) {
      item.quantity = newQty;
      updateActiveTab({ cart: newCart });
    }
  };

  const removeFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    updateActiveTab({ cart: newCart });
  };

  const totalToPay = cart.reduce(
    (acc, item) => acc + item.quantity * item.price,
    0,
  );
  const finalTotal = Math.max(0, totalToPay - appliedDiscount.amount);
  const baseImponible = finalTotal / 1.18;
  const igvAmount = finalTotal - baseImponible;

  const categories = useMemo(() => {
    const catSet = new Set<string>();
    products.forEach((p) => {
      if (p.is_sellable && !p.parent) catSet.add(p.category_name || "Otros");
    });
    return ["Todas", ...Array.from(catSet).sort()];
  }, [products]);

  const filteredProducts = products.filter((p) => {
    if (!p.is_sellable) return false;
    if (p.parent) return false;

    const catName = p.category_name || "Otros";
    if (activeCategory !== "Todas" && catName !== activeCategory) return false;

    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    const isEnabledInBranch =
      typeof p.stock === "object" && p.stock !== null
        ? p.stock.is_enabled !== undefined
          ? p.stock.is_enabled
          : true
        : true;

    return isEnabledInBranch;
  });

  const handleOpenPayment = () => {
    if (cart.length === 0) return toast.error("El carrito está vacío.");
    if (!currentBranch) return toast.error("Selecciona una sede.");

    if (totalToPay - appliedDiscount.amount < 0) {
      return toast.error(
        "El descuento no puede ser mayor al total de la venta.",
        {
          icon: "🚫",
          duration: 4000,
        },
      );
    }

    if (finalTotal >= 700) {
      const docLength = selectedCustomer?.tax_id?.length || 0;
      if (
        !selectedCustomer ||
        selectedCustomer.tax_id === "00000000" ||
        docLength < 8
      ) {
        return toast.error(
          "SUNAT exige identificar al cliente (DNI/CE/RUC) para montos a partir de S/ 700.",
          {
            icon: "👮",
            duration: 6000,
          },
        );
      }
    }

    setIsPaymentModalOpen(true);
  };

  const handleProcessSale = async (paymentData: any) => {
    if (isProcessingRef.current) return;

    if (totalToPay - (paymentData.discount_amount || 0) < 0) {
      toast.error("El total no puede ser negativo.");
      setIsPaymentModalOpen(false);
      return;
    }

    isProcessingRef.current = true;

    setIsPaymentModalOpen(false);
    setIsLoading(true);

    try {
      const saleUuid = uuidv4();

      const tipoSeleccionado = paymentData.invoice_type;
      let serie = "B001";

      if (tipoSeleccionado === "FACTURA") {
        serie = localStorage.getItem("pos_factura_serie") || "F001";
      } else if (tipoSeleccionado === "BOLETA") {
        serie = localStorage.getItem("pos_boleta_serie") || "B001";
      } else if (tipoSeleccionado === "NOTA_VENTA") {
        serie = localStorage.getItem("pos_nota_serie") || "NV01";
      } else if (tipoSeleccionado === "TICKET") {
        serie = localStorage.getItem("pos_ticket_serie") || "TK01";
      }

      const ventasLocales = await db.sales.toArray();
      const maxDexieCounter = ventasLocales
        .filter(
          (s) =>
            s.local_invoice_number &&
            s.local_invoice_number.startsWith(`${serie}-`),
        )
        .reduce((max, s) => {
          const num = parseInt(s.local_invoice_number.split("-")[1], 10);
          return num > max ? num : max;
        }, 0);

      let localCounter = parseInt(
        localStorage.getItem(`contador_${serie}`) || "1",
      );

      localCounter = Math.max(
        localCounter,
        maxDexieCounter > 0 ? maxDexieCounter + 1 : 1,
      );

      const correlativo = String(localCounter).padStart(8, "0");
      const numeroOficial = `${serie}-${correlativo}`;

      const isTempCustomer = selectedCustomerId && selectedCustomerId < 0;

      const payload: any = {
        uuid: saleUuid,
        local_invoice_number: numeroOficial,
        date: new Date().toISOString(),
        branch_id: currentBranch?.id,
        cash_register: localStorage.getItem("pos_cash_register_id") || null,
        customer: isTempCustomer ? null : selectedCustomerId,
        customer_document: selectedCustomer?.tax_id || "",
        customer_name: selectedCustomer?.name || "",
        customer_type: selectedCustomer?.document_type || "DNI",

        payments:
          paymentData.payments && paymentData.payments.length > 0
            ? paymentData.payments.map((p: any) => ({
                payment_method: p.payment_method,
                amount: Number(p.amount).toFixed(2),
              }))
            : [
                {
                  payment_method: "CASH",
                  amount: Number(totalToPay).toFixed(2),
                },
              ],

        invoice_type_code: paymentData.invoice_type_code || "03",
        is_courtesy: paymentData.is_courtesy || false,
        total: paymentData.final_total
          ? Number(paymentData.final_total).toFixed(2)
          : Number(totalToPay).toFixed(2),
        discount_amount: Number(paymentData.discount_amount || 0).toFixed(2),
        discount_reason: paymentData.discount_reason || "",
        discount_authorized_by_id:
          paymentData.discount_authorized_by_id || null,
        notes: saleNote ? saleNote.toUpperCase() : "",
        details: cart.map((item) => ({
          product: item.product.id,
          quantity: item.quantity,
          price: Number(item.price).toFixed(2),
        })),
      };

      if (paymentData.supervisor_pin) {
        payload.supervisor_pin = paymentData.supervisor_pin;
      }

      const formatPaymentMethod = (methodCode: string) => {
        if (methodCode === "CASH") return "EFECTIVO";
        if (methodCode === "CARD") return "VISA/YAPE";
        if (methodCode === "TRANSFER") return "TRANSFERENCIA";
        if (methodCode === "COURTESY") return "CORTESÍA";
        if (methodCode === "PAGO_LINK") return "PAGO LINK";
        return methodCode || "EFECTIVO";
      };

      const pagosFormateados =
        paymentData.payments && paymentData.payments.length > 0
          ? paymentData.payments.map((p: any) => ({
              method: formatPaymentMethod(p.payment_method),
              amount: p.amount || totalToPay,
            }))
          : [{ method: "EFECTIVO", amount: totalToPay }];

      const isCourtesySale = paymentData.is_courtesy || false;

      const ticketData = {
        isCourtesy: isCourtesySale,
        invoiceTypeCode: isCourtesySale
          ? "99"
          : paymentData.invoice_type_code || "03",
        invoiceNumber: numeroOficial,
        invoiceTypeLabel: isCourtesySale
          ? "TICKET DE CORTESÍA"
          : paymentData.invoice_type_code === "00"
          ? "NOTA DE VENTA"
          : paymentData.invoice_type_code === "01"
          ? "FACTURA ELECTRÓNICA"
          : "BOLETA DE VENTA ELECTRÓNICA",
        date: new Date().toLocaleString("es-PE"),
        customer: selectedCustomer
          ? selectedCustomer.name.substring(0, 35)
          : "PÚBLICO GENERAL",
        customerDoc: selectedCustomer ? selectedCustomer.tax_id : "-",
        address: selectedCustomer?.address?.substring(0, 35) || "-",
        paymentTypeStr: isCourtesySale
          ? "CORTESÍA"
          : pagosFormateados[0].method,
        items: cart.map((item) => ({
          qty: item.quantity,
          name: item.product.name,
          price: item.price,
          subtotal: item.quantity * item.price,
        })),
        subtotalBruto: totalToPay,
        descuentoGlobal: paymentData.discount_amount || 0,
        opGravada: paymentData.is_courtesy
          ? 0
          : (paymentData.final_total || totalToPay) / 1.18,
        igv: paymentData.is_courtesy
          ? 0
          : (paymentData.final_total || totalToPay) -
            (paymentData.final_total || totalToPay) / 1.18,
        total: paymentData.is_courtesy
          ? 0
          : paymentData.final_total || totalToPay,
        realValue: paymentData.is_courtesy
          ? 0
          : paymentData.final_total || totalToPay,
        amountInWords: numeroALetras(
          paymentData.is_courtesy ? 0 : paymentData.final_total || totalToPay,
        ),
        payments: isCourtesySale
          ? [{ method: "CORTESÍA", amount: 0 }]
          : pagosFormateados,
        branch: currentBranch
          ? {
              name: currentBranch.name,
              address: currentBranch.address,
              phone: currentBranch.phone,
            }
          : null,
        tenderedAmount: paymentData.tenderedAmount,
        changeAmount: paymentData.changeAmount,
      };

      try {
        await db.transaction("rw", db.sales, db.products, async () => {
          await db.sales.add({
            uuid: saleUuid,
            local_invoice_number: numeroOficial,
            date: new Date().toISOString(),
            total: totalToPay,
            sync_status: "PENDING",
            payload: payload,
          });

          for (const item of cart) {
            if (item.product.manage_stock) {
              const prod = await db.products.get(item.product.id);
              if (prod && prod.stock !== undefined) {
                if (typeof prod.stock === "number") {
                  await db.products.update(item.product.id, {
                    stock: prod.stock - item.quantity,
                  });
                } else if (
                  typeof prod.stock === "object" &&
                  prod.stock !== null
                ) {
                  await db.products.update(item.product.id, {
                    stock: {
                      ...prod.stock,
                      quantity: prod.stock.quantity - item.quantity,
                    },
                  });
                }
              }
            }
          }
        });
      } catch (dexieError) {
        console.error("🔥 Error crítico guardando en Dexie:", dexieError);
        throw new Error("Fallo la escritura en la base de datos local");
      }

      localStorage.setItem(`contador_${serie}`, (localCounter + 1).toString());
      setLastTicketSnapshot(ticketData);

      if (tabs.length > 1) {
        const newTabs = tabs.filter((t) => t.id !== activeTabId);
        setTabs(newTabs);
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else {
        updateActiveTab({
          cart: [],
          selectedCustomerId: null,
          saleNote: "",
          appliedDiscount: { amount: 0, reason: "", authorizedById: null },
        });
      }

      setShowSuccessModal(true);

      if (!isOfflineMode) {
        api
          .post("/sales/sales/", payload)
          .then(async (response) => {
            if (response.data && response.data.id) {
              await db.sales.update(saleUuid, {
                sync_status: "SYNCED",
                id: response.data.id,
              });
              setLastSaleId(response.data.id);
            } else {
              throw new Error("Respuesta inválida del servidor");
            }
          })
          .catch((error) => {
            console.warn(`Venta guardada como PENDING local.`, error);
          });
      }
    } catch (error: any) {
      console.error("Error crítico local:", error);
      toast.error("Error al procesar la venta local.", { duration: 6000 });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 500);
    }
  };

  const printTicket = async () => {
    const isElectron = /electron/i.test(navigator.userAgent);
    const isNativeMobile = Capacitor.isNativePlatform();

    if (isElectron && lastTicketSnapshot && window.electronAPI) {
      window.electronAPI.printLocalTicket(lastTicketSnapshot);
    } else if (isNativeMobile && lastTicketSnapshot) {
      try {
        const macImpresora = localStorage.getItem("impresora_mac");

        if (!macImpresora) {
          toast.error("Configura una impresora Bluetooth.");
          setIsPrinting(false);
          return;
        }

        toast.loading("Conectando...", { id: "print-toast" });

        const yaConectado = await BluetoothPrinter.isDeviceConnected();
        if (!yaConectado) {
          await BluetoothPrinter.connect(macImpresora);
        }

        try {
          await BluetoothPrinter.printTicketESC(lastTicketSnapshot);
          toast.success("¡Ticket Impreso!", { id: "print-toast" });
        } catch (firstError) {
          await BluetoothPrinter.disconnect().catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 500));
          await BluetoothPrinter.connect(macImpresora);
          await BluetoothPrinter.printTicketESC(lastTicketSnapshot);
          toast.success("¡Ticket Impreso!", { id: "print-toast" });
        }
      } catch (error: any) {
        toast.error("Error Bluetooth", { id: "print-toast" });
      }
    } else if (lastSaleId) {
      try {
        const response = await api.get(`/sales/sales/${lastSaleId}/print/`, {
          responseType: "blob",
        });
        const pdfUrl = window.URL.createObjectURL(
          new Blob([response.data], { type: "application/pdf" }),
        );
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        };
      } catch (error) {
        toast.error("Error PDF");
      }
    } else {
      toast.success("Venta offline generada.", { duration: 4000 });
    }
  };

  const searchCustomer = async (docNumber: string) => {
    if (!docNumber) return;
    setIsLoading(true);
    try {
      if (isOfflineMode) throw new Error("Offline");

      const res = await api.get(
        `/sales/customers/search_doc/?doc=${docNumber}`,
      );
      const { exists_local, data } = res.data;

      if (exists_local) {
        await db.customers.put(data);
        updateActiveTab({ selectedCustomerId: data.id });
      } else {
        setNewCustomer({
          document_type:
            data.document_type ||
            (docNumber.length === 11
              ? "RUC"
              : docNumber.length === 9
              ? "CE"
              : "DNI"),
          tax_id: data.tax_id || docNumber,
          name: data.name?.toUpperCase() || "",
          address: data.address?.toUpperCase() || "",
          email: "",
          phone: "",
        });
        setIsCustomerModalOpen(true);
      }
    } catch (error) {
      const localCust = await db.customers
        .where("tax_id")
        .equals(docNumber)
        .first();
      if (localCust) {
        updateActiveTab({ selectedCustomerId: localCust.id });
      } else {
        setNewCustomer({
          document_type:
            docNumber.length === 11
              ? "RUC"
              : docNumber.length === 9
              ? "CE"
              : "DNI",
          tax_id: docNumber,
          name: "",
          address: "",
          email: "",
          phone: "",
        });
        setIsCustomerModalOpen(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCreateCustomer = async () => {
    if (!newCustomer.name || !newCustomer.tax_id)
      return toast.error("Datos incompletos");

    if (
      newCustomer.document_type === "DNI" &&
      newCustomer.tax_id.length !== 8
    ) {
      return toast.error("El DNI debe tener exactamente 8 dígitos.");
    }
    if (
      newCustomer.document_type === "RUC" &&
      newCustomer.tax_id.length !== 11
    ) {
      return toast.error("El RUC debe tener exactamente 11 dígitos.");
    }
    if (newCustomer.document_type === "CE" && newCustomer.tax_id.length !== 9) {
      return toast.error("El Carné de Extranjería debe tener 9 caracteres.");
    }

    setIsLoading(true);

    try {
      const payload: any = {
        ...newCustomer,
        // Guardamos todo limpio en mayúsculas en la BD
        name: newCustomer.name.toUpperCase(),
        address: newCustomer.address.toUpperCase(),
        email: newCustomer.email.toUpperCase(),
      };
      if (!payload.email) delete payload.email;
      if (!payload.phone) delete payload.phone;
      if (!payload.address) delete payload.address;

      const tempId = -Date.now();
      const localCustomer = { ...payload, id: tempId, sync_status: "PENDING" };

      await db.customers.put(localCustomer);
      updateActiveTab({ selectedCustomerId: tempId });
      setIsCustomerModalOpen(false);
      toast.success(isOfflineMode ? "Guardado offline." : "Registrado.");

      if (!isOfflineMode) {
        api
          .post("/sales/customers/", payload)
          .then(async (res) => {
            const realCustomer = res.data;
            await db.customers.delete(tempId);
            await db.customers.put(realCustomer);
            setTabs((prev) =>
              prev.map((t) =>
                t.selectedCustomerId === tempId
                  ? { ...t, selectedCustomerId: realCustomer.id }
                  : t,
              ),
            );
          })
          .catch((err) => console.warn("Offline por microcorte.", err));
      }
    } catch (error: any) {
      toast.error("Error crítico.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh)] flex flex-col bg-slate-100 overflow-hidden font-sans relative">
      {isOfflineMode && (
        <div className="absolute top-0 left-0 w-full bg-red-500 text-white text-xs font-bold py-1 flex justify-center items-center gap-2 z-50">
          <WifiOff size={14} /> Trabajando sin conexión a internet. Ventas
          locales activadas.
        </div>
      )}

      <PosHeader />

      {/* --- MODALES --- */}
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
                        tax_id: "",
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
                  {/* 👇 INPUT TIPO TELÉFONO PARA QUE SALGA TECLADO NUMÉRICO EN TABLET 👇 */}
                  <input
                    type={newCustomer.document_type === "CE" ? "text" : "tel"}
                    maxLength={
                      newCustomer.document_type === "DNI"
                        ? 8
                        : newCustomer.document_type === "RUC"
                        ? 11
                        : 9
                    }
                    autoCapitalize="characters"
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                    value={newCustomer.tax_id}
                    onChange={(e) => {
                      let val = e.target.value.toUpperCase();
                      if (newCustomer.document_type !== "CE") {
                        val = val.replace(/[^0-9]/g, ""); // Solo números
                      } else {
                        val = val.replace(/[^0-9A-Z]/g, ""); // Alfanumérico
                      }
                      setNewCustomer({ ...newCustomer, tax_id: val });
                    }}
                    placeholder={`Escribe el ${newCustomer.document_type}...`}
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
                  autoCapitalize="characters"
                  className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 uppercase"
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
                  autoCapitalize="characters"
                  className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 uppercase"
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
                    type="tel"
                    maxLength={9}
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer({
                        ...newCustomer,
                        phone: e.target.value.replace(/[^0-9]/g, ""),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    autoCapitalize="characters"
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 uppercase"
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
                className="flex-1 py-2.5 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 shadow-md bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  "Guardar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {openPriceProduct && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black text-slate-800">
                Monto del Servicio
              </h2>
              <button
                onClick={() => setOpenPriceProduct(null)}
                className="text-slate-400 hover:bg-slate-100 hover:text-slate-600 p-1.5 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm font-bold text-blue-600 bg-blue-50 p-2 rounded-lg mb-4 text-center">
              {openPriceProduct.name}
            </p>

            <form onSubmit={handleConfirmOpenPrice}>
              <div className="mb-6 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">
                  S/
                </span>
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xl font-black outline-none focus:border-blue-500 focus:bg-white transition-colors"
                  placeholder="0.00"
                  value={openPriceValue}
                  onChange={(e) => setOpenPriceValue(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpenPriceProduct(null)}
                  className="flex-1 py-3 text-slate-500 font-bold bg-white border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!openPriceValue}
                  className="flex-1 py-3 text-white font-bold bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Agregar a Caja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeGroupProduct && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                  {activeGroupProduct.name}
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  Elija la variante o sabor a cobrar
                </p>
              </div>
              <button
                onClick={() => setActiveGroupProduct(null)}
                className="bg-white text-slate-400 hover:bg-slate-200 hover:text-slate-700 p-2.5 rounded-xl transition shadow-sm border border-slate-200"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-100 custom-scrollbar">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {products
                  .filter(
                    (p) => p.parent === activeGroupProduct.id && p.is_sellable,
                  )
                  .map((variant) => {
                    const stockQty = getStockQty(variant);

                    let vPrice = getProductPrice(variant);
                    if (
                      isColabMode &&
                      variant.colab_price !== null &&
                      variant.colab_price !== undefined &&
                      variant.colab_price !== ""
                    ) {
                      vPrice =
                        typeof variant.colab_price === "string"
                          ? parseFloat(variant.colab_price)
                          : variant.colab_price;
                    }

                    const isMTO = !variant.manage_stock;

                    return (
                      <div
                        key={variant.id}
                        onClick={() => {
                          addToCart(variant);
                          setActiveGroupProduct(null);
                        }}
                        className={`relative group bg-white p-3 md:p-4 rounded-2xl border-2 shadow-sm cursor-pointer active:scale-95 flex flex-col h-full min-h-[130px] transition-all ${
                          stockQty <= 0 && !isMTO
                            ? "border-red-200 bg-red-50/50 hover:border-red-400"
                            : isColabMode
                            ? "border-purple-200 hover:border-purple-500"
                            : "border-slate-200 hover:border-blue-500"
                        }`}
                      >
                        <div className="pr-2 flex-1">
                          <h4 className="font-bold text-xs md:text-sm text-slate-800 line-clamp-3 leading-snug">
                            {variant.name}
                          </h4>
                        </div>
                        <div className="mt-3 pt-2 md:pt-3 border-t border-slate-100 flex justify-between items-end shrink-0 gap-1">
                          <span
                            className={`${
                              isColabMode ? "text-purple-600" : "text-blue-600"
                            } font-black text-base md:text-lg leading-none truncate`}
                          >
                            S/{" "}
                            {typeof vPrice === "string"
                              ? vPrice
                              : vPrice.toFixed(2)}
                          </span>
                          <div
                            className={`text-[8px] md:text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider shadow-sm shrink-0 ${
                              isMTO
                                ? "bg-purple-100 text-purple-700"
                                : stockQty > 0
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {isMTO ? "LISTO" : `${stockQty} un.`}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {products.filter((p) => p.parent === activeGroupProduct.id)
                  .length === 0 && (
                  <div className="col-span-full py-10 text-center text-slate-400">
                    <Tag size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="font-bold">No hay opciones configuradas.</p>
                    <p className="text-xs mt-1">
                      Asigna productos a este grupo en el administrador.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isPaymentModalOpen && (
        <PaymentModal
          total={totalToPay}
          selectedCustomer={selectedCustomer}
          isAdmin={isAdmin}
          appliedDiscount={appliedDiscount}
          onUpdateDiscount={(discount) =>
            updateActiveTab({ appliedDiscount: discount })
          }
          onClose={() => setIsPaymentModalOpen(false)}
          onConfirm={handleProcessSale}
        />
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-3">
          <div className="bg-white p-4 md:p-6 rounded-3xl shadow-2xl w-full max-w-3xl transform scale-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3 shrink-0 gap-4">
              <h2 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                <div className="bg-green-100 p-1.5 rounded-full border-2 border-green-50">
                  <CheckCircle
                    className="text-green-600"
                    size={24}
                    strokeWidth={3}
                  />
                </div>
                ¡Venta Exitosa!
              </h2>
              <ClockWidget isAndroid={isAndroid} />
            </div>

            <div className="flex flex-row gap-4 overflow-hidden flex-1">
              <div className="flex-[3] bg-slate-50 rounded-2xl border border-slate-200 p-3 flex flex-col overflow-hidden">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-2 flex items-center gap-1.5 shrink-0">
                  <ShoppingCart size={14} /> Productos a entregar:
                </h3>
                <ul className="overflow-y-auto custom-scrollbar space-y-2 pr-1 flex-1">
                  {lastTicketSnapshot?.items?.map((item: any, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="bg-blue-100 text-blue-700 font-black px-1.5 py-0.5 rounded-md text-[11px] min-w-[2rem] text-center shrink-0 mt-0.5">
                        {item.qty}x
                      </span>
                      <span className="font-bold text-slate-700 text-sm leading-tight">
                        {item.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex-[2] flex flex-col gap-3 justify-center shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    if (isPrinting) return;
                    setIsPrinting(true);
                    try {
                      await printTicket();
                      await new Promise((resolve) => setTimeout(resolve, 1500));
                    } finally {
                      setIsPrinting(false);
                    }
                  }}
                  disabled={isPrinting}
                  className="w-full bg-slate-900 text-white py-4 px-2 rounded-xl font-bold flex flex-col xl:flex-row items-center justify-center gap-1 xl:gap-2 shadow-lg hover:bg-black active:scale-95 transition-all text-xs md:text-sm"
                >
                  {isPrinting ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>IMPRIMIENDO...</span>
                    </>
                  ) : (
                    <>
                      <Printer size={20} />
                      <span className="text-center">IMPRIMIR TICKET</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  disabled={isPrinting}
                  className="w-full bg-white text-slate-600 py-4 px-2 rounded-xl font-bold border-2 border-slate-200 hover:bg-slate-50 active:scale-95 text-xs md:text-sm transition-all"
                >
                  Nueva Venta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- PANTALLA PRINCIPAL --- */}
      <div
        className={`flex flex-1 overflow-hidden p-3 md:p-4 gap-3 md:gap-4 ${
          isOfflineMode ? "mt-4" : ""
        }`}
      >
        <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-3 md:p-4 border-b border-slate-100 z-10 bg-white shrink-0">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3.5 top-3 text-slate-400"
                  size={20}
                />
                <input
                  type="text"
                  autoCapitalize="characters"
                  placeholder="🔍 BUSCAR PRODUCTO..."
                  className="w-full pl-11 pr-4 py-2.5 border-2 border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 bg-slate-50 focus:bg-white uppercase"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                onClick={() => syncLocalCatalog(true)}
                disabled={isSyncingCatalog}
                className="p-3 bg-white border-2 border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-300 rounded-xl transition-all shadow-sm active:scale-95"
              >
                <RefreshCw
                  size={20}
                  className={
                    isSyncingCatalog ? "animate-spin text-blue-600" : ""
                  }
                />
              </button>
            </div>
          </div>

          <div className="flex px-4 py-3 bg-slate-50/80 border-b border-slate-200 shrink-0 items-center justify-between">
            <div className="flex overflow-x-auto gap-2 [&::-webkit-scrollbar]:hidden mr-3">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`whitespace-nowrap px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 active:scale-95 ${
                    activeCategory === cat
                      ? "bg-slate-900 text-white shadow-md transform"
                      : "bg-white text-slate-600 border border-slate-300"
                  }`}
                >
                  {activeCategory === cat && <Tag size={14} />} {cat}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsColabMode(!isColabMode)}
              className={`shrink-0 px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-2 border-2 transition-all active:scale-95 ${
                isColabMode
                  ? "bg-purple-100 text-purple-700 border-purple-300 shadow-inner"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <UserPlus size={16} />
              {isColabMode ? "STAFF ACTIVO" : "VENTA STAFF"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 custom-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredProducts.map((product) => {
                const stockQty = getStockQty(product);

                let productPrice = getProductPrice(product);
                if (
                  isColabMode &&
                  product.colab_price !== null &&
                  product.colab_price !== undefined &&
                  product.colab_price !== ""
                ) {
                  productPrice =
                    typeof product.colab_price === "string"
                      ? parseFloat(product.colab_price)
                      : product.colab_price;
                }

                const isMTO = !product.manage_stock;

                return (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`relative group bg-white p-3 md:p-4 rounded-2xl border-2 shadow-[0_2px_10px_rgba(0,0,0,0.04)] cursor-pointer hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] active:scale-[0.98] flex flex-col h-full min-h-[140px] transition-all ${
                      stockQty <= 0 && !isMTO
                        ? "border-red-200 bg-red-50/50 hover:border-red-400"
                        : isColabMode
                        ? "border-transparent hover:border-purple-400"
                        : "border-transparent hover:border-blue-400"
                    }`}
                  >
                    <div
                      className={`absolute top-2 right-2 md:top-3 md:right-3 text-[9px] md:text-[10px] px-2 py-1 rounded-full font-black uppercase tracking-wider shadow-sm ${
                        isMTO
                          ? "bg-purple-100 text-purple-700"
                          : stockQty > 10
                          ? "bg-emerald-100 text-emerald-700"
                          : stockQty > 0
                          ? "bg-orange-100 text-orange-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {isMTO ? "LISTO" : `${stockQty} un.`}
                    </div>

                    <div className="mt-4 md:mt-5 pr-6 md:pr-8 flex-1">
                      <h4 className="font-bold text-xs md:text-sm text-slate-800 line-clamp-3 leading-snug">
                        {product.name}
                      </h4>
                      <span className="text-[9px] md:text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1 block">
                        {product.sku}
                      </span>
                    </div>

                    <div className="mt-3 pt-2 md:pt-3 border-t border-slate-100 flex justify-between items-end shrink-0">
                      <div className="flex flex-col min-w-0">
                        {!product.is_group && (
                          <span
                            className={`${
                              isColabMode ? "text-purple-600" : "text-blue-600"
                            } font-black text-base md:text-xl leading-none truncate`}
                          >
                            S/{" "}
                            {typeof productPrice === "string"
                              ? productPrice
                              : productPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div
                        className={`p-1.5 md:p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all shrink-0 ${
                          isColabMode
                            ? "text-purple-500 bg-purple-50"
                            : "text-blue-500 bg-blue-50"
                        }`}
                      >
                        <Plus
                          size={16}
                          className="md:w-[18px] md:h-[18px]"
                          strokeWidth={3}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: TICKET Y TABS */}
        <div className="w-full md:w-[420px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 h-full overflow-hidden">
          <div className="flex bg-slate-200 p-1.5 gap-1 overflow-x-auto custom-scrollbar shrink-0">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-sm select-none ${
                  activeTabId === tab.id
                    ? "bg-white font-bold text-blue-600 border border-slate-300"
                    : "bg-slate-300/50 text-slate-500 hover:bg-slate-300 border border-transparent"
                }`}
              >
                <span className="text-[11px] whitespace-nowrap">
                  {tab.label}
                </span>
                {tab.cart.length > 0 && (
                  <span
                    className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                      activeTabId === tab.id
                        ? "bg-blue-100 text-blue-600"
                        : "bg-slate-400 text-white"
                    }`}
                  >
                    {tab.cart.length}
                  </span>
                )}
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    className="ml-1.5 p-0.5 rounded-md hover:bg-red-100 hover:text-red-500 transition-colors text-slate-400"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={handleAddTab}
              className="px-2 py-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-300 rounded-lg transition-colors flex items-center justify-center shrink-0"
              title="Nueva Venta en Espera"
            >
              <Plus size={16} strokeWidth={3} />
            </button>
          </div>

          <div className="p-4 border-b border-slate-100 bg-white z-10 flex flex-col gap-3">
            {!selectedCustomerId ? (
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3 top-2.5 text-slate-400"
                    size={16}
                  />
                  {/* 👇 INPUT TIPO TELÉFONO PARA BÚSQUEDA 👇 */}
                  <input
                    type="tel"
                    maxLength={11}
                    placeholder="AGREGAR CLIENTE (RUC/DNI)..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        searchCustomer((e.target as HTMLInputElement).value);
                    }}
                    onChange={(e) => {
                      e.target.value = e.target.value.replace(/[^0-9]/g, "");
                    }}
                  />
                </div>
                <button
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="bg-white border-2 border-slate-200 text-slate-500 p-2 rounded-xl hover:bg-slate-50 hover:text-blue-600 shadow-sm active:scale-95"
                >
                  <UserPlus size={18} />
                </button>
                <span className="text-[10px] px-2.5 py-2.5 rounded-xl font-black tracking-widest uppercase shadow-sm bg-blue-100 text-blue-700 border border-blue-200">
                  {previewInvoiceType}
                </span>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex justify-between items-center shadow-sm animate-in fade-in">
                <div className="min-w-0">
                  <p className="text-xs font-black text-blue-900 truncate tracking-wide">
                    {selectedCustomer?.name}
                  </p>
                  <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-0.5">
                    {selectedCustomer?.document_type}:{" "}
                    {selectedCustomer?.tax_id}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[9px] px-2 py-1 rounded-md font-black tracking-widest uppercase bg-white text-blue-700 border border-blue-100 shadow-sm">
                    {previewInvoiceType}
                  </span>
                  <button
                    onClick={() =>
                      updateActiveTab({ selectedCustomerId: null })
                    }
                    className="bg-white text-blue-400 border border-blue-100 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg active:scale-95 transition-all shadow-sm"
                  >
                    <X size={16} strokeWidth={3} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                <ShoppingCart size={48} className="opacity-20 mb-1" />
                <p className="text-sm font-bold text-slate-500">
                  Carrito vacío
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100/80">
                {cart.map((item, index) => (
                  <li
                    key={index}
                    className="p-4 hover:bg-white transition-colors flex flex-col gap-2.5"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-sm text-slate-700 leading-tight">
                        {item.product.name}
                      </span>
                      <span className="font-black text-base text-slate-800">
                        S/ {(item.quantity * item.price).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                        <button
                          onClick={() => updateQuantity(index, -1)}
                          className="px-3 py-1.5 bg-white text-slate-600 hover:text-red-600 active:bg-slate-200"
                        >
                          <Minus size={14} strokeWidth={3} />
                        </button>
                        <input
                          type="number"
                          className="w-12 text-center text-sm font-black text-slate-800 border-x border-slate-200 bg-slate-50/50 outline-none focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={item.quantity || ""}
                          onChange={(e) => {
                            const newCart = [...cart];
                            const currentItem = newCart[index];
                            let val = parseInt(e.target.value, 10);

                            if (isNaN(val)) val = 0;

                            // 👇 3. BLOQUEO DE STOCK AL ESCRIBIR MANUALMENTE 👇
                            if (currentItem.product.manage_stock) {
                              const maxStock = getStockQty(currentItem.product);
                              if (val > maxStock) {
                                toast.error(
                                  `Stock máximo es de ${maxStock} unidades.`,
                                  { icon: "📦" },
                                );
                                val = maxStock; // Lo fuerza al máximo permitido
                              }
                            }

                            currentItem.quantity = val;
                            updateActiveTab({ cart: newCart });
                          }}
                          onBlur={() => {
                            if (!item.quantity || item.quantity <= 0) {
                              const newCart = [...cart];
                              newCart[index].quantity = 1;
                              updateActiveTab({ cart: newCart });
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          onClick={() => updateQuantity(index, 1)}
                          className="px-3 py-1.5 bg-white text-slate-600 hover:text-green-600 active:bg-slate-200"
                        >
                          <Plus size={14} strokeWidth={3} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-500 font-bold bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm">
                          S/ {item.price.toFixed(2)} c/u
                        </span>
                        <button
                          onClick={() => removeFromCart(index)}
                          className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg active:scale-95"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border-t border-slate-200 z-20">
            <div className="px-3 py-2 border-b border-slate-100 bg-yellow-50/50 flex items-center">
              <input
                type="text"
                autoCapitalize="characters"
                placeholder="✍️ AGREGAR NOTA A LA VENTA..."
                className="w-full bg-transparent text-xs font-bold text-slate-700 outline-none placeholder:text-slate-400 uppercase"
                value={saleNote}
                onChange={(e) => updateActiveTab({ saleNote: e.target.value })}
                maxLength={200}
              />
            </div>

            <div className="p-3 flex flex-col gap-2">
              <div className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex gap-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Subtotal
                    </span>
                    <span className="text-xs font-black text-slate-600">
                      S/ {baseImponible.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-col border-l border-slate-200 pl-4">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      IGV (18%)
                    </span>
                    <span className="text-xs font-black text-slate-600">
                      S/ {igvAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    {cart.reduce((acc, i) => acc + i.quantity, 0)} art.
                  </div>
                  {appliedDiscount.amount > 0 && (
                    <div className="text-[10px] font-black text-purple-600 mt-1 animate-in slide-in-from-right-2">
                      - S/ {appliedDiscount.amount.toFixed(2)} Dscto.
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleOpenPayment}
                disabled={cart.length === 0 || isLoading}
                className={`w-full py-3.5 px-4 rounded-xl shadow-lg active:scale-[0.98] flex items-center justify-between transition-all ${
                  isLoading || cart.length === 0
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-slate-900 text-white hover:bg-black hover:shadow-xl"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <ShoppingCart size={20} />
                  )}
                  <span className="font-black tracking-widest uppercase text-sm">
                    Cobrar
                  </span>
                </div>

                <span className="text-2xl font-black tracking-tight bg-white/10 px-3 py-1 rounded-lg">
                  S/ {finalTotal.toFixed(2)}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PointOfSale;
