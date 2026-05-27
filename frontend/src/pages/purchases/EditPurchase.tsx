import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Calendar,
  DollarSign,
  Edit,
  FileText,
  Loader2,
  PackagePlus,
  PieChart,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import SearchableSelect from "../../components/common/SearchableSelect";
import { useBranch } from "../../context/BranchContext";

// --- CONSTANTES ---
const INVOICE_UNIT_OPTIONS = [
  { value: "UNIDAD", label: "Unidad (NIU)" },
  { value: "CAJA", label: "Caja (CX)" },
  { value: "FARDO", label: "Fardo (FD)" },
  { value: "PAQUETE", label: "Paquete (PK)" },
  { value: "SACO", label: "Saco (SA)" },
  { value: "LITRO", label: "Litros (LTR)" },
  { value: "KILO", label: "Kilos (KGM)" },
  { value: "MILLAR", label: "Millar (MIL)" },
  { value: "GALON", label: "Galón (GLN)" },
  { value: "BOLSA", label: "Bolsa (BLS)" },
  { value: "SERVICIO", label: "Servicio (SRV)" },
];

interface Option {
  value: string | number;
  label: string;
}
interface Product {
  id: number;
  name: string;
  sku: string;
  uom_display?: string;
  last_cost?: number | string;
}

interface PurchaseDetail {
  id?: number;
  product_id: number | null;
  description: string;
  category: string | number;
  area: string | number;
  invoice_unit: string;
  multiplier: number;
  quantity: number | string;
  unit_value: number | string;
  total_value: number | string;
  tax_percentage: number;
}

interface BudgetStatus {
  area: string | number;
  remaining: number;
  limit: number;
  area_label: string;
}

const EditPurchase = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentBranch } = useBranch();

  // --- ESTADOS DE CARGA ---
  const [loadingData, setLoadingData] = useState(true);

  // --- ESTADOS DE OPCIONES ---
  const [docTypeOptions, setDocTypeOptions] = useState<Option[]>([]);
  const [igvOptions, setIgvOptions] = useState<Option[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [areaOptions, setAreaOptions] = useState<Option[]>([]);
  const [costTypeOptions, setCostTypeOptions] = useState<Option[]>([]);
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);

  // --- ESTADOS DEL PROVEEDOR ---
  const [rucSearch, setRucSearch] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);

  // --- ESTADOS DE IMPUESTOS EXTRA ---
  const [extraTaxType, setExtraTaxType] = useState("NONE");
  const [extraTaxRate, setExtraTaxRate] = useState(0);
  const [extraTaxAmount, setExtraTaxAmount] = useState("0");

  // --- ESTADOS DE MONEDA ---
  const [currency, setCurrency] = useState<"PEN" | "USD">("PEN");
  const [exchangeRate, setExchangeRate] = useState<string>("1.000");
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  const [initialDate, setInitialDate] = useState("");

  // --- CABECERA LIMPIA ---
  const [header, setHeader] = useState({
    document_type: "FACTURA",
    series: "",
    number: "",
    issue_date: "",
    due_date: "",
    budget_period: "",
    cost_type: "CF",
  });

  const [details, setDetails] = useState<PurchaseDetail[]>([]);

  // --- LÓGICA DE TIPO DE CAMBIO ---
  const fetchExchangeRate = async (dateStr: string) => {
    if (!dateStr) return;
    setIsLoadingRate(true);
    try {
      const response = await api.get(
        `/exchange-rate/get_rate/?date=${dateStr}`,
      );
      if (response.data) setExchangeRate(String(response.data.sell_rate));
    } catch (error) {
      console.error("Error buscando TC:", error);
    } finally {
      setIsLoadingRate(false);
    }
  };

  useEffect(() => {
    if (
      !loadingData &&
      header.issue_date &&
      header.issue_date !== initialDate
    ) {
      fetchExchangeRate(header.issue_date);
    }
  }, [header.issue_date, loadingData, initialDate]);

  // --- CARGA INICIAL ---
  useEffect(() => {
    const fetchData = async () => {
      if (!currentBranch) return;
      setLoadingData(true);
      try {
        const { data } = await api.get(`/purchases/purchases/${id}/`);

        const loadedPeriod = data.budget_period
          ? data.budget_period.slice(0, 7)
          : data.issue_date.slice(0, 7);

        const [budgetsRes, choicesRes, catRes, prodRes] = await Promise.all([
          api.get(
            `/treasury/budgets/status/?branch_id=${currentBranch.id}&month=${loadedPeriod}`,
          ),
          api.get("/purchases/purchases/choices/"),
          api.get("/purchases/categories/"),
          api.get("/inventory/products/?page_size=1000"),
        ]);

        setBudgets(budgetsRes.data);
        setDocTypeOptions(choicesRes.data.document_types || []);
        setIgvOptions(choicesRes.data.igv_rates || []);
        setAreaOptions(choicesRes.data.areas || []);
        setCostTypeOptions(choicesRes.data.cost_types || []);

        setCategories(catRes.data.results || catRes.data);
        setProducts(
          Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.results,
        );

        setHeader({
          document_type: data.document_type,
          series: data.series || "",
          number: data.number || "",
          issue_date: data.issue_date,
          budget_period: loadedPeriod,
          due_date: data.due_date || "",
          cost_type: data.cost_type || "CF",
        });

        setInitialDate(data.issue_date);
        setCurrency(data.currency || "PEN");
        setExchangeRate(
          data.exchange_rate ? String(data.exchange_rate) : "1.000",
        );
        setSupplierId(data.supplier);
        setSupplierName(data.supplier_name);
        setRucSearch(data.supplier_tax_id || "");

        // ❌ Eliminada la búsqueda de saldo detallado de tesorería ❌

        setExtraTaxType(data.extra_tax_type || "NONE");
        setExtraTaxRate(Number(data.extra_tax_rate) || 0);
        setExtraTaxAmount(
          data.extra_tax_amount ? String(data.extra_tax_amount) : "0",
        );

        setDetails(
          data.details.map((d: any) => ({
            id: d.id,
            product_id: d.product,
            description: d.description,
            category: d.category || "",
            area: d.area || "",
            invoice_unit: d.invoice_unit || "UNIDAD",
            multiplier: Number(d.multiplier) || 1,
            quantity: Number(d.quantity),
            unit_value: Number(d.unit_value),
            total_value: Number(d.total_value),
            tax_percentage: Number(d.tax_percentage),
          })),
        );
      } catch (error) {
        console.error(error);
        navigate("/purchases");
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [id, currentBranch, navigate]);

  // --- RECARGAR PRESUPUESTO AL CAMBIAR PERIODO ---
  useEffect(() => {
    if (currentBranch && header.budget_period) {
      api
        .get(
          `/treasury/budgets/status/?branch_id=${currentBranch.id}&month=${header.budget_period}`,
        )
        .then((res) => setBudgets(res.data))
        .catch(console.error);
    }
  }, [header.budget_period, currentBranch]);

  // --- CÁLCULOS GLOBALES ---
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

  // --- IMPUESTOS EXTRA ---
  useEffect(() => {
    if (extraTaxType === "RETENTION" || extraTaxType === "DETRACTION") {
      let calculated = totalDocument * (extraTaxRate / 100);
      if (extraTaxType === "DETRACTION") calculated = Math.round(calculated);
      setExtraTaxAmount(calculated.toFixed(2));
    } else if (extraTaxType === "NONE") {
      setExtraTaxAmount("0");
    }
  }, [totalDocument, extraTaxRate, extraTaxType]);

  const extraTaxNum = parseFloat(extraTaxAmount) || 0;
  let totalNetPay = totalDocument;
  if (extraTaxType === "PERCEPTION") totalNetPay = totalDocument + extraTaxNum;
  else if (extraTaxType === "RETENTION" || extraTaxType === "DETRACTION")
    totalNetPay = totalDocument - extraTaxNum;

  // --- MANEJO DE TABLA ---
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
        if (prod.last_cost && !row.unit_value)
          row.unit_value = Number(prod.last_cost);
      } else {
        row.description = "";
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

  const addRow = () => {
    setDetails([
      ...details,
      {
        product_id: null,
        description: "",
        category: "",
        area: "",
        invoice_unit: "UNIDAD",
        multiplier: 1,
        quantity: 1,
        unit_value: 0,
        total_value: 0,
        tax_percentage: 18,
      },
    ]);
  };

  const removeRow = (index: number) => {
    if (details.length > 1) setDetails(details.filter((_, i) => i !== index));
  };

  // --- GUARDAR CAMBIOS ---
  const handleUpdate = async () => {
    const hasEmptyLine = details.some((d) => !d.category || !d.area);
    if (hasEmptyLine)
      return alert(
        "⚠️ Todas las líneas deben tener asignada un Área y una Categoría.",
      );

    const payload = {
      ...header,
      supplier: supplierId,
      branch_id: currentBranch?.id,
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
      tax_rate: 0.18,
      details: details.map((d) => ({
        id: d.id,
        product: d.product_id,
        description: d.description,
        category: d.category || null,
        area: d.area || null,
        invoice_unit: d.invoice_unit,
        multiplier: Number(d.multiplier),
        quantity: Number(d.quantity),
        unit_value: Number(d.unit_value),
        total_value: Number(d.total_value).toFixed(2),
        tax_percentage: d.tax_percentage,
      })),
    };

    try {
      await api.put(`/purchases/purchases/${id}/`, payload);
      alert("¡Compra actualizada correctamente!");
      navigate("/purchases");
    } catch (error: any) {
      console.error("Error al actualizar:", error.response?.data);
      alert("Error al actualizar. Verifique consola.");
    }
  };

  const handleNumberBlur = () => {
    if (header.number && header.number.length > 0) {
      const padded = header.number.padStart(8, "0");
      setHeader({ ...header, number: padded });
    }
  };

  const renderBudgetAlerts = () => {
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
          {Object.entries(areaTotals).map(([areaId]) => {
            const budget = budgets.find(
              (b) => String(b.area) === String(areaId),
            );
            if (!budget) return null;

            const futureRemaining = budget.remaining;
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
                    Saldo Actual: S/ {futureRemaining.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loadingData)
    return (
      <div className="p-20 text-center flex flex-col items-center">
        <Loader2 className="animate-spin mb-2" size={40} />
        <p>Cargando datos de edición...</p>
      </div>
    );

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate("/purchases")}
          className="p-2 hover:bg-slate-100 rounded-full transition"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Edit className="text-orange-500" /> Editar Compra #{id}
        </h1>
        <BranchSelector />
      </div>

      {/* DATOS PROVEEDOR */}
      <div className="bg-slate-50 p-4 rounded-lg border mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            RUC/DNI
          </label>
          <p className="font-medium text-slate-700">{rucSearch}</p>
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Proveedor
          </label>
          <p className="font-bold text-slate-900">{supplierName}</p>
        </div>
      </div>

      {/* MONEDA */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6 relative z-10">
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 border-b pb-2 flex items-center gap-2">
          <DollarSign size={16} className="text-green-600" /> Configuración de
          Moneda
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Moneda
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
          <div
            className={`transition-opacity duration-200 ${
              currency === "PEN" ? "opacity-50 grayscale" : "opacity-100"
            }`}
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
                CONVERSIÓN CONTABLE
              </span>
              <span className="text-lg font-bold text-orange-600">
                S/ {(totalNetPay * parseFloat(exchangeRate || "0")).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* DOCUMENTO (REDUCIDO COMO NEWPURCHASE) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 relative z-10">
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-5 border-b pb-3 flex items-center gap-2">
          <FileText size={18} className="text-orange-500" /> Información del
          Documento
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Fecha Emisión
            </label>
            <input
              type="date"
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-orange-100 outline-none"
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
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm text-center uppercase font-medium focus:ring-2 focus:ring-orange-100 outline-none"
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
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-100 outline-none"
              value={header.number}
              onChange={(e) => setHeader({ ...header, number: e.target.value })}
              onBlur={handleNumberBlur}
            />
          </div>

          <div className="md:col-span-4">
            <SearchableSelect
              label="Tipo de Costo"
              options={costTypeOptions}
              value={header.cost_type}
              onChange={(val) =>
                setHeader({ ...header, cost_type: val as string })
              }
            />
          </div>

          <div className="md:col-span-4">
            <label className="text-xs font-bold text-red-500 flex items-center gap-1 uppercase tracking-wider mb-1">
              <Calendar size={14} /> Fecha Vencimiento
            </label>
            <input
              type="date"
              className="w-full border border-red-200 bg-red-50 p-2.5 rounded-lg text-sm font-bold text-red-700 focus:ring-2 focus:ring-red-100 outline-none"
              value={header.due_date}
              onChange={(e) =>
                setHeader({ ...header, due_date: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      {/* TABLA DETALLES */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible mb-6">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr className="text-slate-600 font-bold uppercase text-[11px] tracking-tight">
              <th className="p-4 w-[22%] rounded-tl-lg">Producto / Desc.</th>
              <th className="p-4 w-[18%]">C. Costo</th>
              <th className="p-4 w-[15%]">Empaque</th>
              <th className="p-4 w-[15%] text-center">Cant. & Mult.</th>
              <th className="p-4 w-[10%] text-center">P. Unit</th>
              <th className="p-4 w-[8%] text-center">IGV</th>
              <th className="p-4 w-[12%] text-right text-blue-600">Total</th>
              <th className="p-4 w-[5%] text-center rounded-tr-lg"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {details.map((row, index) => {
              const prodSelect = products.find((p) => p.id === row.product_id);
              const uom = prodSelect?.uom_display || "UND";

              const currentInvQty =
                Number(row.quantity) * Number(row.multiplier);

              const rowTotalWithTax =
                Number(row.total_value) *
                (1 + Number(row.tax_percentage) / 100);

              return (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
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
                          title="Crear nuevo producto"
                        >
                          <PackagePlus size={16} />
                        </button>
                      </div>
                      <input
                        type="text"
                        className="border p-1.5 rounded w-full text-xs outline-none focus:border-blue-400"
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
                    <select
                      className="w-full border p-2 rounded text-xs outline-none focus:border-blue-400 font-medium text-slate-700 bg-white"
                      value={row.invoice_unit}
                      onChange={(e) =>
                        updateRow(index, "invoice_unit", e.target.value)
                      }
                    >
                      {INVOICE_UNIT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="p-2 align-top text-center">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          className="w-full border p-1.5 rounded text-center font-bold outline-none focus:border-blue-400 text-sm text-slate-800"
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(index, "quantity", Number(e.target.value))
                          }
                          title="Cantidad en Factura"
                        />
                        <span className="text-xs text-slate-400 font-bold">
                          x
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full border p-1.5 rounded text-center font-bold outline-none focus:border-blue-400 text-sm text-orange-600 bg-orange-50"
                          value={row.multiplier}
                          onChange={(e) =>
                            updateRow(
                              index,
                              "multiplier",
                              Number(e.target.value),
                            )
                          }
                          title="Multiplicador por Empaque"
                        />
                      </div>
                      {row.product_id && (
                        <div className="text-[10px] text-green-700 font-bold bg-green-50 rounded border border-green-200 p-1 truncate">
                          = {currentInvQty.toFixed(2)} {uom} al Stock
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="p-2 align-top text-center">
                    <input
                      type="number"
                      step="any"
                      className="w-full border p-1.5 rounded text-right font-medium outline-none focus:border-blue-400"
                      value={row.unit_value}
                      onChange={(e) =>
                        updateRow(index, "unit_value", Number(e.target.value))
                      }
                    />
                  </td>

                  <td className="p-2 align-top text-center">
                    <select
                      className="border p-1.5 rounded w-full text-xs bg-white font-bold text-blue-700 outline-none"
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

                  <td className="p-2 align-top text-right font-bold text-blue-700 bg-blue-50/30">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium tracking-tight">
                        Sub: {Number(row.total_value).toFixed(2)}
                      </span>
                      <span>
                        {currency === "PEN" ? "S/" : "$"}{" "}
                        {rowTotalWithTax.toFixed(2)}
                      </span>
                    </div>
                  </td>

                  <td className="p-2 align-middle text-center rounded-br-lg">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="text-red-400 hover:text-red-600 p-1.5 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-4 bg-slate-50 border-t rounded-b-lg">
          <button
            type="button"
            onClick={addRow}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-bold text-xs uppercase tracking-tight transition-colors"
          >
            <Plus size={16} /> Agregar Línea
          </button>
        </div>
      </div>

      {/* TOTALES + IMPUESTOS EXTRA */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div className="w-full md:flex-1">{renderBudgetAlerts()}</div>

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
              <span>Total Documento:</span>
              <span>
                {currency === "PEN" ? "S/" : "$"} {totalDocument.toFixed(2)}
              </span>
            </div>
          </div>

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
                      : `Porcentaje (${
                          extraTaxType === "RETENTION"
                            ? "Retención"
                            : "Detracción"
                        }):`}
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
                        className={`w-24 p-1 pl-6 text-right border rounded font-bold ${
                          extraTaxType === "PERCEPTION"
                            ? "bg-white border-purple-300 text-purple-700"
                            : "bg-slate-100 text-slate-600 cursor-not-allowed"
                        }`}
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

          {/* ❌ Eliminada la lógica y el renderizado del panel verde de saldo ❌ */}

          <button
            type="button"
            onClick={handleUpdate}
            className="w-full mt-6 bg-orange-500 text-white py-4 rounded-xl font-black hover:bg-orange-600 flex items-center justify-center gap-2 uppercase tracking-widest transition-all shadow-md"
          >
            <Save size={20} /> Actualizar Compra
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPurchase;
