import {
  AlertTriangle,
  Calculator,
  Calendar,
  DollarSign,
  FileText,
  Link,
  Loader2,
  PackagePlus,
  PieChart,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  last_cost?: number | string;
}
interface PurchaseDetail {
  product_id: number | null;
  description: string;
  category: string | number;
  area: string | number;
  quantity: number | string;
  unit_value: number | string;
  total_value: number | string;
  tax_percentage: number;
  max_quantity?: number;
}
interface BudgetStatus {
  area: string | number;
  remaining: number;
  limit: number;
  area_label: string;
}

const NewPurchase = () => {
  const { currentBranch } = useBranch();
  const topRef = useRef<HTMLDivElement>(null);

  // --- ESTADOS DE DATOS MAESTROS ---
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);

  // --- OPCIONES DINÁMICAS ---
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

  // --- LÓGICA DE NOTAS ---
  const [referencePurchases, setReferencePurchases] = useState<any[]>([]);
  const [selectedReferenceId, setSelectedReferenceId] = useState<number | null>(
    null,
  );
  const [affectsInventory, setAffectsInventory] = useState(true);

  // --- MONEDA E IMPUESTOS ---
  const [extraTaxType, setExtraTaxType] = useState("NONE");
  const [extraTaxRate, setExtraTaxRate] = useState(0);
  const [extraTaxAmount, setExtraTaxAmount] = useState("0");
  const [currency, setCurrency] = useState<"PEN" | "USD">("PEN");
  const [exchangeRate, setExchangeRate] = useState<string>("1.000");
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  // --- BUSQUEDA ---
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);

  // --- CABECERA ---
  const [header, setHeader] = useState({
    document_type: "FACTURA",
    series: "",
    number: "",
    issue_date: new Date().toISOString().split("T")[0],
    budget_period: new Date().toISOString().slice(0, 7),
    due_date: new Date().toISOString().split("T")[0],
    tax_rate: 0.18,
    payment_condition: "CASH",
    payment_status: "PAID",
    cost_type: "CF",
    payment_method: "TRANSFER",
  });

  const isNoteDocument =
    header.document_type === "NOTA_CREDITO" ||
    header.document_type === "NOTA_DEBITO";
  const selectedRefObj = referencePurchases.find(
    (p) => p.id === selectedReferenceId,
  );

  // --- DETALLES ---
  const [details, setDetails] = useState<PurchaseDetail[]>([
    {
      product_id: null,
      description: "",
      category: "",
      area: "",
      quantity: 1,
      unit_value: 0,
      total_value: 0,
      tax_percentage: 18,
    },
  ]);

  // --- 1. CARGA INICIAL ---
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
      } catch (error) {
        console.error("Error cargando datos", error);
      }
    };
    loadData();
  }, [currentBranch, header.budget_period]);

  // --- BUSCAR TIPO DE CAMBIO ---
  useEffect(() => {
    const fetchExchangeRate = async (dateStr: string) => {
      if (!dateStr) return;
      setIsLoadingRate(true);
      try {
        const response = await api.get(
          `/exchange-rate/get_rate/?date=${dateStr}`,
        );
        if (response.data) setExchangeRate(String(response.data.sell_rate));
      } catch (error) {
        console.error("Error TC:", error);
      } finally {
        setIsLoadingRate(false);
      }
    };
    if (header.issue_date) fetchExchangeRate(header.issue_date);
  }, [header.issue_date]);

  // --- BUSCAR FACTURAS PREVIAS SI ES NOTA ---
  useEffect(() => {
    if (isNoteDocument && supplierId) {
      api
        .get(
          `/purchases/purchases/?supplier=${supplierId}&branch_id=${currentBranch?.id}`,
        )
        .then((res) => {
          const results = Array.isArray(res.data) ? res.data : res.data.results;
          const validRefs = results.filter(
            (p: any) =>
              p.document_type === "FACTURA" || p.document_type === "BOLETA",
          );
          setReferencePurchases(validRefs);
        })
        .catch(console.error);
    } else {
      setReferencePurchases([]);
      setSelectedReferenceId(null);
    }
  }, [isNoteDocument, supplierId, currentBranch]);

  // --- LÓGICA DE PROVEEDORES MEJORADA ---
  const handleSearchRuc = async () => {
    if (!rucSearch) return;

    // 1. Búsqueda rápida en la memoria local (tus 400 proveedores)
    const localFound = suppliersList.find((s) => s.tax_id === rucSearch);
    if (localFound) {
      setSupplierId(localFound.id);
      setSupplierName(localFound.name);
      setIsNewSupplier(false);
      return;
    }

    // 2. Si no está local, buscamos en SUNAT/RENIEC mediante nuestro Backend
    setIsSearchingSupplier(true);
    try {
      const response = await api.get(
        `/purchases/suppliers/search_doc/?doc=${rucSearch}`,
      );
      const supplierData = response.data;

      // Autocompletamos con la data real de SUNAT
      setSupplierId(supplierData.id);
      setSupplierName(supplierData.name);
      setIsNewSupplier(false);

      // Lo agregamos a la lista local para no tener que volver a buscarlo si borramos
      setSuppliersList((prev) => [...prev, supplierData]);
    } catch (error) {
      console.error("No encontrado en SUNAT/RENIEC", error);
      // 3. Si falla (RUC inválido o API caída), pasamos a creación manual
      setSupplierId(null);
      setSupplierName("");
      setIsNewSupplier(true);
    } finally {
      setIsSearchingSupplier(false);
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
    setSelectedReferenceId(null);
  };

  const selectedSupplierObj = suppliersList.find((s) => s.id === supplierId);
  const currentBalance = selectedSupplierObj?.balance
    ? parseFloat(selectedSupplierObj.balance)
    : 0;

  // --- CÁLCULOS MATEMÁTICOS ---
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

  useEffect(() => {
    if (extraTaxType === "RETENTION" || extraTaxType === "DETRACTION") {
      let calc = totalDocument * (extraTaxRate / 100);
      setExtraTaxAmount(
        extraTaxType === "DETRACTION"
          ? Math.round(calc).toFixed(0)
          : calc.toFixed(2),
      );
    } else if (extraTaxType === "NONE") {
      setExtraTaxAmount("0");
      setExtraTaxRate(0);
    }
  }, [totalDocument, extraTaxRate, extraTaxType]);

  const totalNetPay =
    extraTaxType === "PERCEPTION"
      ? totalDocument + parseFloat(extraTaxAmount || "0")
      : extraTaxType !== "NONE"
        ? totalDocument - parseFloat(extraTaxAmount || "0")
        : totalDocument;

  // --- MANEJO DE TABLA DETALLES ---
  const updateRow = (
    index: number,
    field: keyof PurchaseDetail,
    value: any,
  ) => {
    const newDetails = [...details];
    const row = { ...newDetails[index], [field]: value };

    if (field === "product_id") {
      const prod = products.find((p) => p.id === Number(value));
      if (prod) {
        row.description = prod.name;
        if (prod.last_cost) row.unit_value = Number(prod.last_cost);
      } else {
        row.description = "";
        row.unit_value = 0;
      }
    }

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

  const addRow = () =>
    setDetails([
      ...details,
      {
        product_id: null,
        description: "",
        category: "",
        area: "",
        quantity: 1,
        unit_value: 0,
        total_value: 0,
        tax_percentage: 18,
      },
    ]);
  const removeRow = (index: number) => {
    if (details.length > 1) setDetails(details.filter((_, i) => i !== index));
  };

  // --- SELECCIONAR REFERENCIA PARA NOTA ---
  const handleReferenceSelect = (val: string) => {
    const refId = Number(val);
    setSelectedReferenceId(refId);

    const refDoc = referencePurchases.find((p) => p.id === refId);
    if (refDoc) {
      const firstLetter = refDoc.series ? refDoc.series.charAt(0) : "F";
      setHeader((prev) => ({
        ...prev,
        series: `${firstLetter}C01`,
        currency: refDoc.currency || "PEN",
      }));
      setCurrency(refDoc.currency || "PEN");

      if (refDoc.details && refDoc.details.length > 0) {
        const mappedDetails = refDoc.details
          .filter((d: any) => d.remaining_quantity > 0)
          .map((d: any) => ({
            product_id: d.product,
            description: d.description || d.product_name,
            category: d.category || "",
            area: d.area || "",
            quantity: d.remaining_quantity,
            max_quantity: d.remaining_quantity,
            unit_value: d.unit_value,
            total_value: Number(d.remaining_quantity) * Number(d.unit_value),
            tax_percentage: d.tax_percentage || 18,
          }));

        if (mappedDetails.length === 0) {
          alert(
            "⚠️ Esta factura ya ha sido devuelta en su totalidad en notas anteriores.",
          );
          setDetails([
            {
              product_id: null,
              description: "",
              category: "",
              area: "",
              quantity: 1,
              unit_value: 0,
              total_value: 0,
              tax_percentage: 18,
            },
          ]);
          setSelectedReferenceId(null);
          return;
        }

        setDetails(mappedDetails);
      }
    }
  };

  // --- BUSCAR CORRELATIVO AUTOMÁTICO PARA DOCS INTERNOS ---
  useEffect(() => {
    if (header.document_type === "SIN_ESPECIFICAR" && currentBranch) {
      api
        .get(
          `/purchases/purchases/next_sequence/?document_type=SIN_ESPECIFICAR&branch_id=${currentBranch.id}`,
        )
        .then((res) => {
          if (res.data.series && res.data.number) {
            setHeader((prev) => ({
              ...prev,
              series: res.data.series,
              number: res.data.number,
            }));
          }
        })
        .catch(console.error);
    }
  }, [header.document_type, currentBranch]);

  const handleNumberBlur = () => {
    if (header.number && header.number.length > 0) {
      const padded = header.number.padStart(8, "0");
      setHeader({ ...header, number: padded });
    }
  };

  const resetForm = () => {
    clearSupplierSelection();
    setHeader({
      document_type: "FACTURA",
      series: "",
      number: "",
      issue_date: new Date().toISOString().split("T")[0],
      budget_period: new Date().toISOString().slice(0, 7),
      due_date: new Date().toISOString().split("T")[0],
      tax_rate: 0.18,
      payment_condition: "CASH",
      payment_status: "PAID",
      cost_type: "CF",
      payment_method: "TRANSFER",
    });
    setDetails([
      {
        product_id: null,
        description: "",
        category: "",
        area: "",
        quantity: 1,
        unit_value: 0,
        total_value: 0,
        tax_percentage: 18,
      },
    ]);
    setCurrency("PEN");
    setExtraTaxType("NONE");
    setExtraTaxRate(0);
    setExtraTaxAmount("0");
    setSelectedReferenceId(null);
    setAffectsInventory(true);
  };

  const handleSubmit = async () => {
    if (!currentBranch) return alert("⚠️ Selecciona una Sede");
    if (!rucSearch || !supplierName)
      return alert("⚠️ Falta información del proveedor");

    if (!isNoteDocument) {
      const hasEmptyLine = details.some((d) => !d.category || !d.area);
      if (hasEmptyLine)
        return alert(
          "⚠️ Todas las líneas deben tener asignada un Área y una Categoría.",
        );
    } else {
      if (!selectedReferenceId)
        return alert(
          "⚠️ Debes seleccionar el documento original de referencia.",
        );
    }

    try {
      let finalSupplierId = supplierId;
      if (isNewSupplier && !supplierId) {
        const supRes = await api.post("/purchases/suppliers/", {
          name: supplierName,
          tax_id: rucSearch,
        });
        finalSupplierId = supRes.data.id;
      }

      const detailsPayload = details
        .filter((d) => Number(d.quantity) > 0 || !affectsInventory)
        .map((d) => ({
          product: d.product_id ? Number(d.product_id) : null,
          description: d.description,
          category: d.category || null,
          area: d.area || null,
          quantity: d.quantity,
          unit_value: Number(d.unit_value).toFixed(2),
          total_value: Number(d.total_value).toFixed(2),
          tax_percentage: d.tax_percentage,
        }));

      if (detailsPayload.length === 0)
        return alert("La compra/nota no puede estar vacía.");

      if (isNoteDocument) {
        const notePayload = {
          purchase: selectedReferenceId,
          note_type: header.document_type === "NOTA_CREDITO" ? "07" : "08",
          series: header.series.toUpperCase(),
          number: header.number.padStart(8, "0"),
          issue_date: header.issue_date,
          reason: "Emisión manual desde Compras",
          affects_inventory: affectsInventory,
          currency: currency,
          exchange_rate: currency === "PEN" ? "1.000" : exchangeRate,
          subtotal: subtotal.toFixed(2),
          tax_amount: taxAmount.toFixed(2),
          total: totalDocument.toFixed(2),
          details: detailsPayload,
        };
        await api.post("/purchases/notes/", notePayload);
        alert(`¡${header.document_type} registrada correctamente!`);
      } else {
        const payload = {
          ...header,
          supplier: finalSupplierId,
          branch_id: currentBranch.id,
          due_date:
            header.payment_status === "PENDING" ? header.due_date : null,
          budget_period: `${header.budget_period}-01`,
          currency: currency,
          exchange_rate: currency === "PEN" ? "1.000" : exchangeRate,
          subtotal: subtotal.toFixed(2),
          tax_amount: taxAmount.toFixed(2),
          total: totalDocument.toFixed(2),
          extra_tax_type: extraTaxType,
          extra_tax_rate: extraTaxRate.toFixed(2),
          extra_tax_amount: parseFloat(extraTaxAmount).toFixed(2),
          total_net_pay: totalNetPay.toFixed(2),
          details: detailsPayload,
        };
        await api.post("/purchases/purchases/", payload);
        alert("¡Compra registrada exitosamente! 🚀");
      }

      resetForm();
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (error: any) {
      alert("Error: " + JSON.stringify(error.response?.data || error.message));
    }
  };

  // 🔥 NUEVA VERSIÓN: PANEL ELEGANTE DE PRESUPUESTO
  const renderBudgetAlerts = () => {
    if (isNoteDocument) return null;

    const areaTotals: Record<string, number> = {};
    let hasAreasSelected = false;

    details.forEach((row) => {
      if (
        row.area &&
        (Number(row.quantity) > 0 || Number(row.total_value) > 0)
      ) {
        hasAreasSelected = true;
        const rowTotal =
          Number(row.total_value) * (1 + Number(row.tax_percentage) / 100);
        const rowTotalSoles =
          currency === "USD" ? rowTotal * parseFloat(exchangeRate) : rowTotal;
        areaTotals[row.area] = (areaTotals[row.area] || 0) + rowTotalSoles;
      }
    });

    if (!hasAreasSelected) return null;

    return (
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in">
        <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
          <PieChart size={18} className="text-blue-500" />
          Impacto en Presupuestos
        </h4>
        <div className="space-y-3">
          {Object.entries(areaTotals).map(([areaId, spentAmount]) => {
            const budget = budgets.find(
              (b) => String(b.area) === String(areaId),
            );
            if (!budget) return null;

            const futureRemaining = budget.remaining - spentAmount;
            const isExceeded = futureRemaining < 0;

            return (
              <div
                key={areaId}
                className={`p-3 rounded-xl border flex justify-between items-center transition-colors ${
                  isExceeded
                    ? "bg-red-50 border-red-200"
                    : "bg-green-50 border-green-200"
                }`}
              >
                <span className="font-bold text-slate-700 text-sm">
                  {budget.area_label}
                </span>
                {isExceeded ? (
                  <span className="font-black text-red-600 text-sm flex items-center gap-1.5">
                    <AlertTriangle size={16} />
                    Excedido: S/ {Math.abs(futureRemaining).toFixed(2)}
                  </span>
                ) : (
                  <span className="font-bold text-green-700 text-sm">
                    Sobra: S/ {futureRemaining.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={topRef}
      className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500"
    >
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Save className="text-blue-600" /> Registrar Compra / Gasto
          </h1>
          <BranchSelector />
        </div>
      </div>

      {/* --- SECCIÓN PROVEEDOR --- */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6 relative z-10">
        {supplierId && (
          <button
            onClick={clearSupplierSelection}
            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 flex items-center gap-1 text-xs font-bold bg-slate-50 px-2 py-1 rounded-full border border-slate-200"
          >
            <X size={14} /> LIMPIAR
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
                className={`w-full border p-2 rounded outline-none ${supplierId ? "bg-slate-100 text-slate-500" : "bg-white"}`}
                placeholder="Escribe y Enter..."
                value={rucSearch}
                onChange={(e) => setRucSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchRuc()}
                readOnly={supplierId !== null && !isNewSupplier}
              />
              {/* 👇 BOTÓN ACTUALIZADO 👇 */}
              <button
                onClick={handleSearchRuc}
                disabled={supplierId !== null || isSearchingSupplier}
                className="bg-blue-100 text-blue-600 p-2 rounded hover:bg-blue-200 disabled:opacity-50 min-w-[40px] flex justify-center items-center"
              >
                {isSearchingSupplier ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Search size={20} />
                )}
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
              className={`w-full border p-2 rounded mt-1 outline-none ${!isNewSupplier && supplierId ? "bg-slate-100 text-slate-500" : "bg-white border-blue-400"}`}
              placeholder="Escribe el nombre del proveedor..."
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              onBlur={handleSearchName}
              readOnly={!isNewSupplier && supplierId !== null}
            />
          </div>
        </div>
      </div>

      {/* --- SECCIÓN MONEDA --- */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6 z-10 relative">
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 border-b pb-2 flex items-center gap-2">
          <DollarSign size={16} className="text-green-600" /> Configuración de
          Moneda
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Moneda de la Factura
            </label>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setCurrency("PEN")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${currency === "PEN" ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}
              >
                S/ Soles
              </button>
              <button
                onClick={() => setCurrency("USD")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${currency === "USD" ? "bg-white text-green-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}
              >
                $ Dólares
              </button>
            </div>
          </div>
          <div
            className={`transition-opacity duration-200 ${currency === "PEN" ? "opacity-50 grayscale" : "opacity-100"}`}
          >
            <label className="text-sm font-medium text-slate-700 flex justify-between">
              Tipo de Cambio{" "}
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

      {/* --- SECCIÓN DOCUMENTO --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 z-10 relative">
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

          {!isNoteDocument && (
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
          )}

          <div className={isNoteDocument ? "md:col-span-5" : "md:col-span-3"}>
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
              className={`w-full border p-2.5 rounded-lg text-sm text-center uppercase font-medium focus:ring-2 focus:ring-blue-100 outline-none transition-colors ${
                header.document_type === "SIN_ESPECIFICAR"
                  ? "bg-slate-100 text-blue-700 border-slate-300 font-bold"
                  : "border-slate-300 bg-white"
              }`}
              placeholder={isNoteDocument ? "FC01" : "F001"}
              value={header.series}
              onChange={(e) =>
                setHeader({ ...header, series: e.target.value.toUpperCase() })
              }
              readOnly={header.document_type === "SIN_ESPECIFICAR"}
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Número
            </label>
            <input
              type="text"
              className={`w-full border p-2.5 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-100 outline-none transition-colors ${
                header.document_type === "SIN_ESPECIFICAR"
                  ? "bg-slate-100 text-blue-700 border-slate-300 font-bold"
                  : "border-slate-300 bg-white"
              }`}
              placeholder="00000123"
              value={header.number}
              onChange={(e) => setHeader({ ...header, number: e.target.value })}
              onBlur={handleNumberBlur}
              readOnly={header.document_type === "SIN_ESPECIFICAR"}
            />
          </div>

          {/* 🔥 CUADRO NARANJA PARA NOTAS DE CRÉDITO */}
          {isNoteDocument && (
            <div className="md:col-span-12 mt-2 bg-orange-50 border border-orange-200 p-4 rounded-xl animate-in fade-in slide-in-from-top-2">
              <h4 className="text-sm font-bold text-orange-800 flex items-center gap-2 mb-3">
                <Link size={18} /> Documento Original a Afectar (Referencia)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-4">
                  <select
                    className={`w-full border p-2.5 rounded-lg text-sm font-medium outline-none transition-all ${!supplierId ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" : "border-orange-300 bg-white focus:ring-2 focus:ring-orange-400 text-slate-700"}`}
                    value={selectedReferenceId || ""}
                    onChange={(e) => handleReferenceSelect(e.target.value)}
                    disabled={!supplierId}
                  >
                    {!supplierId ? (
                      <option value="">👆 Primero busca un Proveedor</option>
                    ) : referencePurchases.length === 0 ? (
                      <option value="">
                        ⚠️ Este proveedor no tiene compras previas
                      </option>
                    ) : (
                      <>
                        <option value="">
                          -- Selecciona el documento original --
                        </option>
                        {referencePurchases.map((rp) => (
                          <option key={rp.id} value={rp.id}>
                            {rp.document_type} {rp.series}-{rp.number} |{" "}
                            {rp.issue_date}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-orange-600 uppercase mb-1 block">
                    Serie Orig.
                  </label>
                  <input
                    readOnly
                    className="w-full p-2.5 bg-orange-100/50 border border-orange-200 rounded-lg text-sm text-slate-600 font-bold"
                    value={selectedRefObj?.series || "-"}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-orange-600 uppercase mb-1 block">
                    Número Orig.
                  </label>
                  <input
                    readOnly
                    className="w-full p-2.5 bg-orange-100/50 border border-orange-200 rounded-lg text-sm text-slate-600 font-bold"
                    value={selectedRefObj?.number || "-"}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-orange-600 uppercase mb-1 block">
                    Fecha Orig.
                  </label>
                  <input
                    readOnly
                    className="w-full p-2.5 bg-orange-100/50 border border-orange-200 rounded-lg text-sm text-slate-600 font-bold"
                    value={selectedRefObj?.issue_date || "-"}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center justify-center gap-2 bg-white h-[42px] px-3 border border-orange-300 rounded-lg text-sm cursor-pointer shadow-sm hover:bg-orange-100/50 transition">
                    <input
                      type="checkbox"
                      checked={affectsInventory}
                      onChange={(e) => setAffectsInventory(e.target.checked)}
                      className="accent-orange-600 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-bold text-orange-800 leading-none mt-0.5">
                      Afecta Kardex
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {!isNoteDocument && (
            <>
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
              <div className="md:col-span-3">
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
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                  Estado Pago
                </label>
                <select
                  className={`w-full border p-2.5 rounded-lg text-sm font-bold outline-none ${header.payment_status === "PENDING" ? "text-red-600 bg-red-50 border-red-200" : "text-green-600 bg-green-50 border-green-200"}`}
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
                  <div className="mt-2 flex items-center gap-2 bg-red-50 p-2 rounded border border-red-100">
                    <Calendar size={14} className="text-red-500" />
                    <span className="text-xs text-red-500 font-bold">
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
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- TABLA DETALLES --- */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-visible mb-6">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold uppercase">
            <tr>
              <th className="p-3 w-1/4 rounded-tl-lg">
                Producto / Descripción
              </th>
              <th className="p-3 w-1/4">Centro de Costo</th>
              <th className="p-3 w-20 text-center">Cant.</th>
              <th className="p-3 w-24 text-center">V. Unit.</th>
              <th className="p-3 text-center w-20">IGV</th>
              <th className="p-3 w-28 text-right text-blue-600">Total</th>
              <th className="p-3 w-10 rounded-tr-lg"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {details.map((row, index) => {
              const rowTotalWithTax =
                Number(row.total_value) *
                (1 + Number(row.tax_percentage) / 100);
              return (
                <tr key={index}>
                  <td className="p-2 align-top">
                    <div className="flex flex-col gap-1 relative">
                      <div className="flex gap-1 items-start">
                        <div className="w-full min-w-[150px]">
                          <SearchableSelect
                            placeholder="Buscar producto..."
                            options={[
                              { value: "", label: "-- Solo Gasto --" },
                              ...products.map((p) => ({
                                value: p.id,
                                label: `${p.sku} - ${p.name}`,
                              })),
                            ]}
                            value={row.product_id || ""}
                            onChange={(val) =>
                              updateRow(index, "product_id", val)
                            }
                          />
                        </div>
                        <button
                          onClick={() =>
                            window.open("/inventory/new", "_blank")
                          }
                          className="bg-slate-100 p-1.5 rounded hover:bg-slate-200 text-slate-600"
                        >
                          <PackagePlus size={16} />
                        </button>
                      </div>
                      <input
                        type="text"
                        className="border p-1.5 rounded w-full text-xs"
                        placeholder={
                          row.product_id
                            ? "Descripción..."
                            : "Describe el gasto..."
                        }
                        value={row.description}
                        onChange={(e) =>
                          updateRow(index, "description", e.target.value)
                        }
                      />
                    </div>
                  </td>

                  <td className="p-2 align-top">
                    <div className="flex flex-col gap-1">
                      <SearchableSelect
                        placeholder="Categoría..."
                        options={categories.map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                        value={row.category}
                        onChange={(val) => updateRow(index, "category", val)}
                      />
                      <SearchableSelect
                        placeholder="Área Destino..."
                        options={areaOptions}
                        value={row.area}
                        onChange={(val) => updateRow(index, "area", val)}
                      />
                    </div>
                  </td>

                  <td className="p-2 align-top">
                    <input
                      type="number"
                      className={`border p-1.5 rounded w-full text-center transition-all outline-none ${
                        !affectsInventory && isNoteDocument
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200 opacity-70"
                          : "bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                      }`}
                      value={row.quantity}
                      disabled={!affectsInventory && isNoteDocument}
                      title={
                        !affectsInventory && isNoteDocument
                          ? "Bloqueado: La nota no mueve mercadería, edita solo el V. Unitario."
                          : ""
                      }
                      onChange={(e) => {
                        let val = Number(e.target.value);
                        if (
                          header.document_type === "NOTA_CREDITO" &&
                          row.max_quantity !== undefined
                        ) {
                          if (val > row.max_quantity) {
                            alert(
                              `🔒 Límite superado: Solo quedan ${row.max_quantity} unidades disponibles.`,
                            );
                            val = row.max_quantity;
                          }
                        }
                        if (val < 0) val = 0;
                        updateRow(index, "quantity", val);
                      }}
                    />
                  </td>

                  <td className="p-2 align-top">
                    <input
                      type="number"
                      className="border p-1.5 rounded w-full text-right"
                      value={row.unit_value}
                      onChange={(e) =>
                        updateRow(index, "unit_value", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2 align-top text-center">
                    <select
                      className="border p-1.5 rounded w-full text-xs bg-white font-bold text-blue-700"
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

                  <td className="p-2 align-top text-right bg-blue-50/30 rounded-bl-lg">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">
                        Sub: {Number(row.total_value).toFixed(2)}
                      </span>
                      <span className="font-bold text-blue-700">
                        {currency === "PEN" ? "S/" : "$"}{" "}
                        {rowTotalWithTax.toFixed(2)}
                      </span>
                    </div>
                  </td>

                  <td className="p-2 text-center align-middle rounded-br-lg">
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
        <div className="p-3 bg-slate-50 border-t border-slate-200 rounded-b-lg">
          <button
            onClick={addRow}
            className="text-blue-600 font-medium flex items-center gap-1"
          >
            <Plus size={18} /> Agregar Línea
          </button>
        </div>
      </div>

      {/* --- TOTALES Y ENVÍO --- */}
      {/* ✅ CORRECCIÓN 3: Flex Items Start para que los cuadros se alineen por arriba */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        {/* ZONA DE ALERTAS (AHORA ES UN PANEL ORDENADO A LA IZQUIERDA) */}
        <div className="w-full md:flex-1">{renderBudgetAlerts()}</div>

        {/* ZONA DE TOTALES (DERECHA) */}
        <div className="w-full md:w-[450px] bg-white p-6 rounded-2xl shadow-xl border border-slate-200">
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

          {!isNoteDocument && (
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
          )}

          <div className="flex justify-between pt-4 border-t-2 border-slate-800">
            <span className="font-black text-xl text-slate-900">
              TOTAL NETO:
            </span>
            <div className="text-right">
              <div className="font-black text-2xl text-blue-600">
                {currency === "PEN" ? "S/" : "$"} {totalNetPay.toFixed(2)}
              </div>
              {currency === "USD" && (
                <div className="text-sm font-medium text-slate-400 mt-1">
                  (Contable: S/{" "}
                  {(totalNetPay * parseFloat(exchangeRate || "0")).toFixed(2)})
                </div>
              )}
            </div>
          </div>

          {currentBalance > 0 &&
            header.payment_status === "PAID" &&
            !isNoteDocument && (
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
            className={`w-full mt-6 text-white py-4 rounded-xl font-black shadow-lg flex items-center justify-center gap-2 uppercase tracking-widest transition-all active:scale-95 ${isNoteDocument ? "bg-orange-500 hover:bg-orange-600 shadow-orange-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-100"}`}
          >
            <Save size={20} />{" "}
            {isNoteDocument ? "REGISTRAR NOTA" : "REGISTRAR COMPRA"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewPurchase;
