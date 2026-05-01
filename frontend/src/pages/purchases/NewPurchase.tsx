import {
  AlertTriangle,
  Calculator,
  Calendar,
  DollarSign,
  FileText,
  PackagePlus,
  Plus, // Nuevo icono
  RefreshCw,
  Save,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import SearchableSelect from "../../components/common/SearchableSelect";
import { useBranch } from "../../context/BranchContext";

// --- INTERFACES ---
interface Option {
  value: string | number;
  label: string;
}

interface Supplier {
  id: number;
  name: string;
  tax_id: string;
  balance?: string;
}

interface ExpenseCategory {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  stock: number;
}

interface PurchaseDetail {
  product_id: number | null;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  tax_percentage: number;
}

// INTERFAZ PRESUPUESTO
interface BudgetStatus {
  area: string;
  remaining: number;
  limit: number;
  area_label: string;
}

const NewPurchase = () => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();

  // --- ESTADOS DE DATOS MAESTROS ---
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);

  // --- ESTADOS PARA OPCIONES DINÁMICAS ---
  const [areaOptions, setAreaOptions] = useState<Option[]>([]);
  const [docTypeOptions, setDocTypeOptions] = useState<Option[]>([]);
  const [paymentConditionOptions, setPaymentConditionOptions] = useState<
    Option[]
  >([]);
  const [paymentStatusOptions, setPaymentStatusOptions] = useState<Option[]>(
    [],
  );
  const [igvOptions, setIgvOptions] = useState<Option[]>([]);
  const [costTypeOptions, setCostTypeOptions] = useState<Option[]>([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<Option[]>(
    [],
  );

  // --- ESTADOS DEL PROVEEDOR ---
  const [rucSearch, setRucSearch] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [isNewSupplier, setIsNewSupplier] = useState(false);
  const [supplierId, setSupplierId] = useState<number | null>(null);

  // --- ESTADOS DE IMPUESTOS ADICIONALES ---
  const [extraTaxType, setExtraTaxType] = useState("NONE");
  const [extraTaxRate, setExtraTaxRate] = useState(0);
  const [extraTaxAmount, setExtraTaxAmount] = useState("0");

  // --- 🔥 ESTADOS DE MONEDA Y TIPO DE CAMBIO (NUEVO) ---
  const [currency, setCurrency] = useState<"PEN" | "USD">("PEN");
  const [exchangeRate, setExchangeRate] = useState<string>("1.000");
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  // --- CABECERA ---
  const [header, setHeader] = useState({
    document_type: "FACTURA",
    series: "",
    number: "",
    issue_date: new Date().toISOString().split("T")[0],
    budget_period: new Date().toISOString().slice(0, 7),
    due_date: new Date().toISOString().split("T")[0],
    category: "",
    area: "",
    tax_rate: 0.18,
    payment_condition: "CASH",
    payment_status: "PAID",
    cost_type: "CF",
    payment_method: "TRANSFER",
  });

  // --- DETALLES ---
  const [details, setDetails] = useState<PurchaseDetail[]>([
    {
      product_id: null,
      description: "",
      quantity: 1,
      unit_value: 0,
      total_value: 0,
      tax_percentage: 18,
    },
  ]);

  // --- 1. CARGAR DATOS INICIALES ---
  useEffect(() => {
    if (!currentBranch) return;

    const loadData = async () => {
      try {
        const [supRes, catRes, prodRes, choicesRes, budgetsRes] =
          await Promise.all([
            api.get("/purchases/suppliers/"),
            api.get("/purchases/categories/"),
            api.get("/inventory/products/"),
            api.get("/purchases/purchases/choices/"),
            api.get(`/purchases/budgets/status/?branch_id=${currentBranch.id}`),
            // Solo cargamos presupuesto si hay fecha
            header.budget_period
              ? api.get(
                  `/purchases/budgets/status/?branch_id=${currentBranch.id}&month=${header.budget_period}`,
                )
              : Promise.resolve({ data: [] }),
          ]);

        setSuppliersList(
          Array.isArray(supRes.data) ? supRes.data : supRes.data.results,
        );
        setCategories(
          Array.isArray(catRes.data) ? catRes.data : catRes.data.results,
        );
        setProducts(
          Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.results,
        );
        setBudgets(budgetsRes.data || []);

        setAreaOptions(choicesRes.data.areas || []);
        setDocTypeOptions(choicesRes.data.document_types || []);
        setPaymentConditionOptions(choicesRes.data.payment_conditions || []);
        setPaymentStatusOptions(choicesRes.data.payment_status || []);
        setIgvOptions(choicesRes.data.igv_rates || []);
        setCostTypeOptions(choicesRes.data.cost_types || []);
        setPaymentMethodOptions(choicesRes.data.payment_methods || []);

        if (choicesRes.data.areas?.length > 0 && !header.area) {
          setHeader((prev) => ({
            ...prev,
            area: choicesRes.data.areas[0].value,
          }));
        }
      } catch (error) {
        console.error("Error cargando datos", error);
      }
    };
    loadData();
  }, [currentBranch, header.budget_period]);

  // --- 🔥 2. LÓGICA TIPO DE CAMBIO ---
  const fetchExchangeRate = async (dateStr: string) => {
    if (!dateStr) return;
    setIsLoadingRate(true);
    try {
      // 🔴 CORRECCIÓN AQUÍ: Es 'get_rate' (guion bajo), no 'get-rate'
      // Esto conecta directo con tu tabla global de Core
      const response = await api.get(
        `/exchange-rate/get_rate/?date=${dateStr}`,
      );

      if (response.data) {
        // Usamos el 'sell_rate' (Venta) de tu tabla global
        setExchangeRate(String(response.data.sell_rate));

        // Opcional: Si quieres ser muy estricto y que NO se pueda editar si viene del global:
        // Pero recomiendo dejarlo editable por si el banco te dio un precio especial ese día.
      }
    } catch (error) {
      console.error("Error buscando TC Global:", error);
      // Si falla, se queda en 1.000 o lo que el usuario escriba
    } finally {
      setIsLoadingRate(false);
    }
  };

  // Efecto: Cuando cambia la fecha de emisión, buscamos el TC
  useEffect(() => {
    if (header.issue_date) {
      fetchExchangeRate(header.issue_date);
    }
  }, [header.issue_date]);

  // --- BÚSQUEDA PROVEEDOR ---
  const handleSearchRuc = () => {
    if (!rucSearch) return;
    const found = suppliersList.find((s) => s.tax_id === rucSearch);
    if (found) {
      setSupplierId(found.id);
      setSupplierName(found.name);
      setIsNewSupplier(false);
    } else {
      setSupplierId(null);
      setSupplierName("");
      setIsNewSupplier(true);
    }
  };

  const handleSearchName = () => {
    if (!supplierName) return;
    const found = suppliersList.find(
      (s) => s.name.trim().toLowerCase() === supplierName.trim().toLowerCase(),
    );

    if (found) {
      setSupplierId(found.id);
      setRucSearch(found.tax_id);
      setIsNewSupplier(false);
    } else {
      setSupplierId(null);
      setIsNewSupplier(true);
    }
  };

  const clearSupplierSelection = () => {
    setRucSearch("");
    setSupplierName("");
    setSupplierId(null);
    setIsNewSupplier(false);
  };

  const selectedSupplierObj = suppliersList.find((s) => s.id === supplierId);
  const currentBalance = selectedSupplierObj?.balance
    ? parseFloat(selectedSupplierObj.balance)
    : 0;

  // --- 🧮 CÁLCULOS MATEMÁTICOS ---

  const subtotal = details.reduce(
    (sum, item) => sum + Number(item.total_value),
    0,
  );

  const taxAmount = details.reduce(
    (sum, item) =>
      sum + Number(item.total_value) * (Number(item.tax_percentage) / 100),
    0,
  );

  const totalDocument = subtotal + taxAmount;

  // Efecto secundario para impuestos extra
  useEffect(() => {
    if (extraTaxType === "RETENTION" || extraTaxType === "DETRACTION") {
      let calculatedAmount = totalDocument * (extraTaxRate / 100);
      if (extraTaxType === "DETRACTION") {
        calculatedAmount = Math.round(calculatedAmount);
        setExtraTaxAmount(calculatedAmount.toFixed(0));
      } else {
        setExtraTaxAmount(calculatedAmount.toFixed(2));
      }
    } else if (extraTaxType === "NONE") {
      setExtraTaxAmount("0");
      setExtraTaxRate(0);
    }
  }, [totalDocument, extraTaxRate, extraTaxType]);

  const extraTaxNum = parseFloat(extraTaxAmount) || 0;
  let totalNetPay = totalDocument;

  if (extraTaxType === "PERCEPTION") {
    totalNetPay = totalDocument + extraTaxNum;
  } else if (extraTaxType === "RETENTION" || extraTaxType === "DETRACTION") {
    totalNetPay = totalDocument - extraTaxNum;
  }

  // --- MANEJO DE TABLA ---
  const updateRow = (
    index: number,
    field: keyof PurchaseDetail,
    value: any,
  ) => {
    const newDetails = [...details];
    // Creamos una copia de la fila actual con el valor modificado
    const row = { ...newDetails[index], [field]: value };

    // 🧠 LÓGICA CENTRALIZADA PARA PRODUCTOS
    if (field === "product_id") {
      const prod = products.find((p) => p.id === Number(value));

      if (prod) {
        // ✅ Si eligió producto: Llenamos nombre y precio (si existe)
        row.description = prod.name;
        // @ts-ignore (Si last_cost no está en tu interfaz Product aun, esto evita error)
        if (prod.last_cost) row.unit_value = prod.last_cost;
      } else {
        // 🧹 Si eligió "Solo Gasto" (value vacío): Limpiamos
        row.description = "";
        row.unit_value = 0;
      }
    }

    // 🧮 Recálculo automático de totales
    if (
      field === "quantity" ||
      field === "unit_value" ||
      field === "product_id"
    ) {
      row.total_value = Number(row.quantity) * Number(row.unit_value);
    }

    newDetails[index] = row;
    setDetails(newDetails);
  };

  const addRow = () => {
    setDetails([
      ...details,
      {
        product_id: null,
        description: "",
        quantity: 1,
        unit_value: 0,
        total_value: 0,
        tax_percentage: 18,
      },
    ]);
  };

  const removeRow = (index: number) => {
    if (details.length > 1) {
      setDetails(details.filter((_, i) => i !== index));
    }
  };

  // --- GUARDAR ---
  const handleSubmit = async () => {
    if (!currentBranch) return alert("⚠️ Selecciona una Sede");
    if (!rucSearch || !supplierName)
      return alert("⚠️ Falta información del proveedor");
    if (!header.category) return alert("⚠️ Selecciona una Categoría");
    if (!header.area) return alert("⚠️ Selecciona un Área de destino");

    try {
      let finalSupplierId = supplierId;

      if (isNewSupplier && !supplierId) {
        const supRes = await api.post("/purchases/suppliers/", {
          name: supplierName,
          tax_id: rucSearch,
        });
        finalSupplierId = supRes.data.id;
      }

      const payload = {
        ...header,
        supplier: finalSupplierId,
        branch_id: currentBranch.id,
        due_date: header.payment_status === "PENDING" ? header.due_date : null,
        budget_period: `${header.budget_period}-01`,

        // 🔥 NUEVOS CAMPOS DE MONEDA
        currency: currency,
        exchange_rate: currency === "PEN" ? "1.000" : exchangeRate,

        subtotal: subtotal.toFixed(2),
        tax_amount: taxAmount.toFixed(2),
        total: totalDocument.toFixed(2),

        extra_tax_type: extraTaxType,
        extra_tax_rate: extraTaxRate.toFixed(2),
        extra_tax_amount: parseFloat(extraTaxAmount).toFixed(2),
        total_net_pay: totalNetPay.toFixed(2),

        details: details.map((d) => ({
          product: d.product_id ? Number(d.product_id) : null,
          description: d.description,
          quantity: d.quantity,
          unit_value: Number(d.unit_value).toFixed(2),
          total_value: Number(d.total_value).toFixed(2),
          tax_percentage: d.tax_percentage,
        })),
      };

      await api.post("/purchases/purchases/", payload);
      alert("¡Compra registrada exitosamente! 🚀");
      navigate("/purchases");
    } catch (error: any) {
      console.error(error);
      alert("Error: " + JSON.stringify(error.response?.data || error.message));
    }
  };

  const handleNumberBlur = () => {
    if (header.number && header.number.length > 0) {
      const padded = header.number.padStart(8, "0");
      setHeader({ ...header, number: padded });
    }
  };

  const renderBudgetAlert = () => {
    const areaBudget = budgets.find((b) => b.area == header.area);
    if (!areaBudget || !header.area) return null;

    // 🔥 IMPORTANTE: Si es USD, convertimos a Soles para comparar con el presupuesto
    const currentTotalInSoles =
      currency === "USD"
        ? totalDocument * parseFloat(exchangeRate)
        : totalDocument;

    const futureRemaining = areaBudget.remaining - currentTotalInSoles;
    const isExceeded = futureRemaining < 0;

    if (isExceeded) {
      return (
        <div className="mt-1.5 p-2 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs flex items-start gap-2 animate-in zoom-in">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">¡Presupuesto Excedido!</p>
            <p>Faltan: S/ {Math.abs(futureRemaining).toFixed(2)}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-1 text-xs flex justify-between px-1 text-slate-500">
        <span>Disponible:</span>
        <span className="font-bold text-green-600">
          S/ {areaBudget.remaining.toFixed(2)}
        </span>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Save className="text-blue-600" /> Registrar Compra / Gasto
          </h1>
          <BranchSelector />
        </div>
        <div className="text-sm text-slate-500">
          Registrando en: <strong>{currentBranch?.name}</strong>
        </div>
      </div>

      {/* SECCIÓN PROVEEDOR */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6 relative">
        {supplierId && (
          <button
            onClick={clearSupplierSelection}
            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 flex items-center gap-1 text-xs font-bold bg-slate-50 px-2 py-1 rounded-full border border-slate-200 transition-colors"
          >
            <X size={14} /> LIMPIAR / CAMBIAR
          </button>
        )}

        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 border-b pb-2 flex items-center gap-2">
          <Search size={16} /> Datos del Proveedor
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">
              RUC / DNI
            </label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                className={`w-full border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500 ${
                  supplierId ? "bg-slate-100 text-slate-500" : "bg-white"
                }`}
                placeholder="Escribe y Enter..."
                value={rucSearch}
                onChange={(e) => setRucSearch(e.target.value)}
                onBlur={handleSearchRuc}
                onKeyDown={(e) => e.key === "Enter" && handleSearchRuc()}
                readOnly={supplierId !== null && !isNewSupplier}
              />
              <button
                onClick={handleSearchRuc}
                disabled={supplierId !== null}
                className="bg-blue-100 text-blue-600 p-2 rounded hover:bg-blue-200 disabled:opacity-50"
              >
                <Search size={20} />
              </button>
            </div>
          </div>

          <div className="col-span-2">
            <label className="text-sm font-medium text-slate-700">
              Razón Social{" "}
              {isNewSupplier && (
                <span className="text-green-600 text-xs ml-2 font-bold animate-pulse">
                  (Nuevo Registro)
                </span>
              )}
            </label>
            <datalist id="suppliers-list">
              {suppliersList.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.tax_id}
                </option>
              ))}
            </datalist>
            <input
              type="text"
              list="suppliers-list"
              className={`w-full border p-2 rounded mt-1 outline-none focus:ring-2 focus:ring-blue-500 ${
                !isNewSupplier && supplierId
                  ? "bg-slate-100 text-slate-500"
                  : "bg-white border-blue-400"
              }`}
              placeholder="Escribe el nombre del proveedor..."
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              onBlur={handleSearchName}
              readOnly={!isNewSupplier && supplierId !== null}
            />
          </div>
        </div>
      </div>

      {/* 💰 SECCIÓN: MONEDA Y TIPO DE CAMBIO (NUEVO) */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6">
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 border-b pb-2 flex items-center gap-2">
          <DollarSign size={16} className="text-green-600" /> Configuración de
          Moneda
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          {/* 1. SELECTOR DE MONEDA */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Moneda de la Factura
            </label>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setCurrency("PEN")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  currency === "PEN"
                    ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                S/ Soles
              </button>
              <button
                onClick={() => setCurrency("USD")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  currency === "USD"
                    ? "bg-white text-green-600 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                $ Dólares
              </button>
            </div>
          </div>

          {/* 2. INPUT TIPO DE CAMBIO */}
          <div
            className={`transition-opacity duration-200 ${currency === "PEN" ? "opacity-50 grayscale" : "opacity-100"}`}
          >
            <label className="text-sm font-medium text-slate-700 flex justify-between">
              Tipo de Cambio
              {isLoadingRate && (
                <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" /> Buscando...
                </span>
              )}
            </label>
            <div className="relative mt-1">
              <input
                type="number"
                step="0.001"
                className="w-full border p-2 pl-8 rounded outline-none font-mono text-right bg-slate-100 text-slate-600 cursor-not-allowed"
                value={exchangeRate}
                readOnly
                disabled={currency === "PEN"}
              />
              <span className="absolute left-3 top-2 text-slate-400 font-bold">
                T.C.
              </span>
            </div>
          </div>

          {/* 3. VISUALIZADOR RÁPIDO */}
          {currency === "USD" && (
            <div className="bg-orange-50 border border-orange-100 p-3 rounded-md text-right">
              <span className="text-xs text-orange-400 font-bold block">
                CONVERSIÓN APROX.
              </span>
              <span className="text-lg font-bold text-orange-600">
                S/ {(totalNetPay * parseFloat(exchangeRate || "0")).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN DOCUMENTO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-5 border-b pb-3 flex items-center gap-2">
          <FileText size={18} className="text-blue-600" /> Información del
          Documento
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Fecha Emisión
            </label>
            <input
              type="date"
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none"
              value={header.issue_date}
              onChange={(e) =>
                setHeader({ ...header, issue_date: e.target.value })
              }
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1 block">
              Periodo
            </label>
            <input
              type="month"
              className="w-full border border-blue-200 bg-blue-50 p-2.5 rounded-lg text-sm font-semibold text-blue-700 focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer"
              value={header.budget_period}
              onChange={(e) =>
                setHeader({ ...header, budget_period: e.target.value })
              }
            />
          </div>

          <div className="md:col-span-3">
            <SearchableSelect
              label="Tipo Doc."
              options={docTypeOptions}
              value={header.document_type}
              onChange={(val) =>
                setHeader({ ...header, document_type: val as string })
              }
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Serie
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm text-center uppercase font-medium focus:ring-2 focus:ring-blue-100 outline-none"
              placeholder="F001"
              value={header.series}
              onChange={(e) =>
                setHeader({ ...header, series: e.target.value.toUpperCase() })
              }
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Número
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-100 outline-none"
              placeholder="00000123"
              value={header.number}
              onChange={(e) => setHeader({ ...header, number: e.target.value })}
              onBlur={handleNumberBlur}
            />
          </div>

          {/* FILA 2 */}
          <div className="md:col-span-3">
            <SearchableSelect
              label="Tipo de Costo"
              options={costTypeOptions}
              value={header.cost_type}
              onChange={(val) =>
                setHeader({ ...header, cost_type: val as string })
              }
            />
          </div>
          <div className="md:col-span-3">
            <SearchableSelect
              label="Método de Pago"
              options={paymentMethodOptions}
              value={header.payment_method}
              onChange={(val) =>
                setHeader({ ...header, payment_method: val as string })
              }
            />
          </div>
          <div className="md:col-span-6">
            <SearchableSelect
              label="Categoría"
              placeholder="Buscar categoría de gasto..."
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              value={header.category}
              onChange={(val) =>
                setHeader({ ...header, category: val as string })
              }
            />
          </div>

          {/* FILA 3 */}
          <div className="md:col-span-4 relative">
            <SearchableSelect
              label="Área Destino"
              placeholder="Seleccionar área..."
              options={areaOptions}
              value={header.area}
              onChange={(val) => setHeader({ ...header, area: val as string })}
            />
            {renderBudgetAlert()}
          </div>

          <div className="md:col-span-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Condición
            </label>
            <select
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
              value={header.payment_condition}
              onChange={(e) =>
                setHeader({ ...header, payment_condition: e.target.value })
              }
            >
              {paymentConditionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Estado Pago
            </label>
            <select
              className={`w-full border p-2.5 rounded-lg text-sm font-bold outline-none transition-colors ${
                header.payment_status === "PENDING"
                  ? "text-red-600 bg-red-50 border-red-200 focus:ring-red-100"
                  : "text-green-600 bg-green-50 border-green-200 focus:ring-green-100"
              }`}
              value={header.payment_status}
              onChange={(e) =>
                setHeader({ ...header, payment_status: e.target.value })
              }
            >
              {paymentStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {header.payment_status === "PENDING" && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-2 bg-red-50 p-2 rounded border border-red-100">
                  <Calendar size={14} className="text-red-500" />
                  <span className="text-xs text-red-500 font-bold whitespace-nowrap">
                    Vence:
                  </span>
                  <input
                    type="date"
                    className="bg-transparent text-xs font-bold text-red-700 outline-none w-full"
                    value={header.due_date}
                    onChange={(e) =>
                      setHeader({ ...header, due_date: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DETALLE */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-6">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold uppercase">
            <tr>
              <th className="p-3 w-1/3">Producto / Descripción</th>
              <th className="p-3 w-20 text-center">Cant.</th>
              <th className="p-3 w-28 text-center">Valor Unit.</th>
              <th className="p-3 text-center w-24">IGV</th>
              <th className="p-3 w-32 text-right">Subtotal</th>
              {/* 👇 NUEVA COLUMNA TOTAL */}
              <th className="p-3 w-32 text-right text-blue-600">Total</th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {details.map((row, index) => {
              // 🧮 CÁLCULO: Subtotal + Impuesto
              const rowTotalWithTax =
                Number(row.total_value) *
                (1 + Number(row.tax_percentage) / 100);

              return (
                <tr key={index}>
                  <td className="p-2 align-top">
                    <div className="flex flex-col gap-1 relative">
                      <div className="flex gap-2 items-start">
                        <div className="w-full min-w-[200px]">
                          <SearchableSelect
                            placeholder="Buscar producto..."
                            options={[
                              {
                                value: "",
                                label: "-- Solo Gasto --", // Opción 1: Gasto Puro
                              },
                              ...products.map((p) => ({
                                value: p.id,
                                label: `${p.sku} - ${p.name}`, // Opción 2: Producto de Inventario
                              })),
                            ]}
                            value={row.product_id || ""}
                            onChange={(val) => {
                              // 1. Actualizamos el ID del producto
                              updateRow(index, "product_id", val);
                            }}
                          />
                        </div>
                        <button
                          onClick={() =>
                            window.open("/inventory/new", "_blank")
                          }
                          className="bg-slate-100 p-1 rounded hover:bg-slate-200 text-slate-600"
                          title="Crear Nuevo Producto"
                        >
                          <PackagePlus size={18} />
                        </button>
                      </div>
                      <input
                        type="text"
                        className="border p-1 rounded w-full"
                        placeholder={
                          row.product_id
                            ? "Descripción automática..."
                            : "Describe el gasto..."
                        }
                        value={row.description}
                        onChange={(e) =>
                          updateRow(index, "description", e.target.value)
                        }
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="border p-1 rounded w-full text-center"
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(index, "quantity", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="border p-1 rounded w-full text-right"
                      value={row.unit_value}
                      onChange={(e) =>
                        updateRow(index, "unit_value", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <select
                      className="border p-1 rounded w-full text-xs bg-white font-bold text-blue-700"
                      value={row.tax_percentage}
                      onChange={(e) =>
                        updateRow(
                          index,
                          "tax_percentage",
                          Number(e.target.value),
                        )
                      }
                    >
                      {igvOptions.map((opt) => (
                        <option key={opt.value} value={Number(opt.value) * 100}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* COLUMNA SUBTOTAL */}
                  <td className="p-2 text-right font-medium text-slate-700 align-middle">
                    <div className="flex flex-col">
                      <span>
                        {currency === "PEN" ? "S/" : "$"}{" "}
                        {Number(row.total_value).toFixed(2)}
                      </span>
                    </div>
                  </td>

                  {/* 👇 COLUMNA TOTAL + IGV (CORREGIDA) */}
                  <td className="p-2 text-right align-middle bg-blue-50/30">
                    <div className="flex flex-col">
                      <span className="font-bold text-blue-700">
                        {currency === "PEN" ? "S/" : "$"}{" "}
                        {rowTotalWithTax.toFixed(2)}
                      </span>
                    </div>
                  </td>

                  <td className="p-2 text-center align-middle">
                    <button
                      onClick={() => removeRow(index)}
                      className="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-3 bg-slate-50 border-t border-slate-200">
          <button
            onClick={addRow}
            className="text-blue-600 font-medium flex items-center gap-1"
          >
            <Plus size={18} /> Agregar Línea
          </button>
        </div>
      </div>
      {/* ZONA DE TOTALES */}
      <div className="flex justify-end">
        <div className="w-full md:w-[450px] bg-white p-6 rounded-2xl shadow-xl border border-slate-200">
          {/* 1. Totales Básicos */}
          <div className="space-y-2 mb-4 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-medium">
                {currency === "PEN" ? "S/" : "$"} {subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>IGV:</span>
              <span className="font-medium">
                {currency === "PEN" ? "S/" : "$"} {taxAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-t border-slate-100 font-bold text-slate-800 text-base">
              <span>Total:</span>
              <span>
                {currency === "PEN" ? "S/" : "$"} {totalDocument.toFixed(2)}
              </span>
            </div>
          </div>

          {/* 2. SELECTOR DE IMPUESTO EXTRA */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1">
              <Calculator size={14} /> Impuestos Adicionales
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="extraTax"
                  className="accent-slate-600"
                  checked={extraTaxType === "NONE"}
                  onChange={() => setExtraTaxType("NONE")}
                />
                <span>Ninguno</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="extraTax"
                  className="accent-purple-600"
                  checked={extraTaxType === "PERCEPTION"}
                  onChange={() => {
                    setExtraTaxType("PERCEPTION");
                    setExtraTaxRate(0);
                    setExtraTaxAmount("0");
                  }}
                />
                <span className="text-purple-700 font-bold">Percepción</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="extraTax"
                  className="accent-orange-600"
                  checked={extraTaxType === "RETENTION"}
                  onChange={() => {
                    setExtraTaxType("RETENTION");
                    setExtraTaxRate(3);
                  }}
                />
                <span className="text-orange-700 font-bold">Retención</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="extraTax"
                  className="accent-blue-600"
                  checked={extraTaxType === "DETRACTION"}
                  onChange={() => {
                    setExtraTaxType("DETRACTION");
                    setExtraTaxRate(10);
                  }}
                />
                <span className="text-blue-700 font-bold">Detracción</span>
              </label>
            </div>

            {extraTaxType !== "NONE" && (
              <div className="mt-4 pt-3 border-t border-slate-200 animate-in slide-in-from-top-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">
                    {extraTaxType === "PERCEPTION"
                      ? "Monto Fijo:"
                      : `Porcentaje (${extraTaxType === "RETENTION" ? "Retención" : "Detracción"}):`}
                  </span>
                  <div className="flex items-center gap-2">
                    {extraTaxType !== "PERCEPTION" && (
                      <div className="relative">
                        <input
                          type="number"
                          className="w-16 p-1 text-right border rounded font-bold text-slate-700 pr-5"
                          value={extraTaxRate}
                          onChange={(e) =>
                            setExtraTaxRate(Number(e.target.value))
                          }
                        />
                        <span className="absolute right-1.5 top-1.5 text-xs text-slate-400">
                          %
                        </span>
                      </div>
                    )}
                    <span className="text-slate-400">=</span>
                    <div className="relative">
                      <span className="absolute left-2 top-1.5 text-xs text-slate-500">
                        {currency === "PEN" ? "S/" : "$"}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        className={`w-24 p-1 pl-6 text-right border rounded font-bold ${extraTaxType === "PERCEPTION" ? "bg-white border-purple-300 text-purple-700" : "bg-slate-100 text-slate-600"}`}
                        value={extraTaxAmount}
                        readOnly={extraTaxType !== "PERCEPTION"}
                        onChange={(e) =>
                          extraTaxType === "PERCEPTION" &&
                          setExtraTaxAmount(e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. TOTAL FINAL A PAGAR (Multimoneda) */}
          <div className="flex justify-between pt-4 border-t-2 border-slate-800">
            <span className="font-black text-xl text-slate-900">
              TOTAL NETO:
            </span>
            <div className="text-right">
              <div className="font-black text-2xl text-blue-600">
                {currency === "PEN" ? "S/" : "$"} {totalNetPay.toFixed(2)}
              </div>

              {/* 👇 TOTAL FANTASMA EN SOLES (SI ES DÓLARES) */}
              {currency === "USD" && (
                <div className="text-sm font-medium text-slate-400 mt-1">
                  (Contable: S/{" "}
                  {(totalNetPay * parseFloat(exchangeRate || "0")).toFixed(2)})
                </div>
              )}
            </div>
          </div>

          {/* MENSAJE DE SALDO */}
          {currentBalance > 0 && header.payment_status === "PAID" && (
            <div className="mt-4 p-3 bg-green-100 text-green-800 rounded border border-green-300 text-xs flex flex-col gap-1">
              <div className="flex items-center gap-2 font-bold">
                <Wallet size={16} />
                <span>Saldo a favor disponible</span>
              </div>
              <p>
                El proveedor tiene{" "}
                <strong>S/ {currentBalance.toFixed(2)}</strong> a favor.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            className="w-full mt-6 bg-blue-600 text-white py-4 rounded-xl font-black hover:bg-blue-700 shadow-lg shadow-blue-100 flex items-center justify-center gap-2 uppercase tracking-widest transition-all active:scale-95"
          >
            <Save size={20} /> REGISTRAR COMPRA
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewPurchase;
