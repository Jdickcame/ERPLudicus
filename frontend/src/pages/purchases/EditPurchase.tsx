import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Calendar,
  DollarSign,
  Edit,
  FileText,
  Loader2,
  Plus, // Icono nuevo
  RefreshCw,
  Save,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import SearchableSelect from "../../components/common/SearchableSelect";
import { useBranch } from "../../context/BranchContext";

interface Option {
  value: string | number;
  label: string;
}

interface PurchaseDetail {
  id?: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  tax_percentage: number;
}

const EditPurchase = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentBranch } = useBranch();

  // --- ESTADOS DE CARGA ---
  const [loadingData, setLoadingData] = useState(true);
  const [supplierBalance, setSupplierBalance] = useState(0);

  // --- ESTADOS DE OPCIONES ---
  const [docTypeOptions, setDocTypeOptions] = useState<Option[]>([]);
  const [igvOptions, setIgvOptions] = useState<Option[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [areaOptions, setAreaOptions] = useState<Option[]>([]);
  const [paymentConditionOptions, setPaymentConditionOptions] = useState<
    Option[]
  >([]);
  const [paymentStatusOptions, setPaymentStatusOptions] = useState<Option[]>(
    [],
  );
  const [costTypeOptions, setCostTypeOptions] = useState<Option[]>([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<Option[]>(
    [],
  );
  const [budgets, setBudgets] = useState<any[]>([]);

  // --- ESTADOS DEL PROVEEDOR ---
  const [rucSearch, setRucSearch] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);

  // --- ESTADOS DE IMPUESTOS EXTRA ---
  const [extraTaxType, setExtraTaxType] = useState("NONE");
  const [extraTaxRate, setExtraTaxRate] = useState(0);
  const [extraTaxAmount, setExtraTaxAmount] = useState("0");

  // --- 🔥 ESTADOS DE MONEDA (NUEVO) ---
  const [currency, setCurrency] = useState<"PEN" | "USD">("PEN");
  const [exchangeRate, setExchangeRate] = useState<string>("1.000");
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  const [initialDate, setInitialDate] = useState("");

  const [header, setHeader] = useState({
    document_type: "FACTURA",
    series: "",
    number: "",
    issue_date: "",
    due_date: "",
    budget_period: "",
    category: "",
    area: "",
    payment_condition: "CASH",
    payment_status: "PAID",
    cost_type: "CF",
    payment_method: "TRANSFER",
  });

  const [details, setDetails] = useState<PurchaseDetail[]>([]);

  // --- 🔥 LÓGICA DE TIPO DE CAMBIO ---
  const fetchExchangeRate = async (dateStr: string) => {
    if (!dateStr) return;
    setIsLoadingRate(true);
    try {
      // Usamos el endpoint global
      const response = await api.get(
        `/exchange-rate/get_rate/?date=${dateStr}`,
      );
      if (response.data) {
        setExchangeRate(String(response.data.sell_rate));
      }
    } catch (error) {
      console.error("Error buscando TC:", error);
    } finally {
      setIsLoadingRate(false);
    }
  };

  // Efecto: Busca TC solo si la fecha CAMBIA respecto a la original
  useEffect(() => {
    // Solo buscamos si ya terminó de cargar, hay fecha, Y ES DIFERENTE A LA ORIGINAL
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

        const [budgetsRes, choicesRes, catRes] = await Promise.all([
          api.get(
            `/purchases/budgets/status/?branch_id=${currentBranch.id}&month=${loadedPeriod}`,
          ),
          api.get("/purchases/purchases/choices/"),
          api.get("/purchases/categories/"),
        ]);

        setBudgets(budgetsRes.data);
        setDocTypeOptions(choicesRes.data.document_types || []);
        setIgvOptions(choicesRes.data.igv_rates || []);
        setAreaOptions(choicesRes.data.areas || []);
        setPaymentConditionOptions(choicesRes.data.payment_conditions || []);
        setPaymentStatusOptions(choicesRes.data.payment_status || []);
        setCostTypeOptions(choicesRes.data.cost_types || []);
        setPaymentMethodOptions(choicesRes.data.payment_methods || []);
        setCategories(catRes.data.results || catRes.data);

        setHeader({
          document_type: data.document_type,
          series: data.series || "",
          number: data.number || "",
          issue_date: data.issue_date,
          budget_period: loadedPeriod,
          due_date: data.due_date || "",
          category: data.category,
          area: data.area,
          payment_condition: data.payment_condition,
          payment_status: data.payment_status,
          cost_type: data.cost_type || "CF",
          payment_method: data.payment_method || "TRANSFER",
        });

        setInitialDate(data.issue_date);
        // 🔥 CARGAMOS MONEDA Y TC
        setCurrency(data.currency || "PEN");
        setExchangeRate(
          data.exchange_rate ? String(data.exchange_rate) : "1.000",
        );

        setSupplierId(data.supplier);
        setSupplierName(data.supplier_name);
        setRucSearch(data.supplier_tax_id || "");

        if (data.supplier) {
          try {
            const supplierRes = await api.get(
              `/purchases/suppliers/${data.supplier}/`,
            );
            setSupplierBalance(parseFloat(supplierRes.data.balance) || 0);
          } catch (err) {
            console.error("Error saldo proveedor", err);
          }
        }

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
          `/purchases/budgets/status/?branch_id=${currentBranch.id}&month=${header.budget_period}`,
        )
        .then((res) => setBudgets(res.data))
        .catch((err) => console.error(err));
    }
  }, [header.budget_period, currentBranch]);

  // --- CÁLCULOS ---
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
      if (extraTaxType === "DETRACTION") {
        calculated = Math.round(calculated);
      }
      setExtraTaxAmount(calculated.toFixed(2));
    } else if (extraTaxType === "NONE") {
      setExtraTaxAmount("0");
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
    const row = { ...newDetails[index], [field]: value };
    if (field === "quantity" || field === "unit_value") {
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
    if (details.length > 1) setDetails(details.filter((_, i) => i !== index));
  };

  // --- GUARDAR CAMBIOS ---
  const handleUpdate = async () => {
    const payload = {
      ...header,
      supplier: supplierId,
      branch_id: currentBranch?.id,
      due_date: header.payment_status === "PENDING" ? header.due_date : null,
      budget_period: `${header.budget_period}-01`,

      // 🔥 ENVIAMOS DATOS DE MONEDA
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
        id: d.id, // Importante mandar ID para que edite y no cree duplicados
        product: d.product_id,
        description: d.description,
        quantity: d.quantity,
        unit_value: Number(d.unit_value).toFixed(2),
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

  const renderBudgetAlert = () => {
    const areaBudget = budgets.find((b) => b.area == header.area);
    if (!areaBudget || !header.area) return null;

    // 🔥 AJUSTE: Si es USD, convierte mentalmente a Soles para comparar con presupuesto
    // Nota: 'remaining' viene del backend y ya tiene descontada esta compra (versión guardada)
    // Para ser ultra precisos habría que sumar el monto viejo y restar el nuevo, pero
    // por simplicidad mostramos el saldo disponible actual del sistema.

    const remaining = areaBudget.remaining;
    const isExceeded = remaining < 0;

    if (isExceeded) {
      return (
        <div className="mt-1.5 p-2 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs flex items-start gap-2 animate-in zoom-in">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">¡Presupuesto Excedido!</p>
            <p>Saldo actual: S/ {remaining.toFixed(2)}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-1 text-xs flex justify-between px-1 text-slate-500">
        <span>Disponible ({header.budget_period}):</span>
        <span className="font-bold text-green-600">
          S/ {remaining.toFixed(2)}
        </span>
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
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
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

      {/* 💰 SECCIÓN MONEDA (IGUAL A NEW PURCHASE) */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-6">
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 border-b pb-2 flex items-center gap-2">
          <DollarSign size={16} className="text-green-600" /> Configuración de
          Moneda
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          {/* 1. SELECTOR */}
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

          {/* 2. INPUT TC */}
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

          {/* 3. VISUALIZADOR */}
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

      {/* DATOS DOCUMENTO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
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
              className="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-100 outline-none"
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
              className={`w-full border p-2.5 rounded-lg text-sm font-bold outline-none transition-colors ${header.payment_status === "PENDING" ? "text-red-600 bg-red-50 border-red-200 focus:ring-red-100" : "text-green-600 bg-green-50 border-green-200 focus:ring-green-100"}`}
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

      {/* TABLA DETALLES */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr className="text-slate-600 font-bold uppercase text-[11px]">
              <th className="p-4 text-left">Descripción / Producto</th>
              <th className="p-4 text-center w-20">Cant.</th>
              <th className="p-4 text-center w-28">P. Unit</th>
              <th className="p-4 text-center w-24">Tasa IGV</th>
              <th className="p-4 text-right w-32">Subtotal</th>
              <th className="p-4 w-32 text-right text-blue-600">Total</th>
              <th className="p-4 text-center w-16">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {details.map((row, index) => {
              // 🧮 CÁLCULO DEL TOTAL CON IGV POR FILA
              const rowTotalWithTax =
                Number(row.total_value) *
                (1 + Number(row.tax_percentage) / 100);

              return (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3">
                    <input
                      type="text"
                      className="w-full border p-1.5 rounded text-sm outline-none focus:border-blue-400"
                      value={row.description}
                      onChange={(e) =>
                        updateRow(index, "description", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      className="w-full border p-1.5 rounded text-center font-medium outline-none focus:border-blue-400"
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(index, "quantity", Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      className="w-full border p-1.5 rounded text-right font-medium outline-none focus:border-blue-400"
                      value={row.unit_value}
                      onChange={(e) =>
                        updateRow(index, "unit_value", Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="p-3 text-center">
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

                  {/* SUBTOTAL (NETO) */}
                  <td className="p-3 text-right font-medium text-slate-700">
                    {currency === "PEN" ? "S/" : "$"}{" "}
                    {Number(row.total_value).toFixed(2)}
                  </td>

                  {/* 👇 CELDA TOTAL + IGV (CALCULADA) */}
                  <td className="p-3 text-right font-bold text-blue-700 bg-blue-50/30">
                    <div className="flex flex-col">
                      <span>
                        {currency === "PEN" ? "S/" : "$"}{" "}
                        {rowTotalWithTax.toFixed(2)}
                      </span>
                    </div>
                  </td>

                  <td className="p-3 text-center">
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
        <div className="p-4 bg-slate-50 border-t">
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
              <span>Total Documento:</span>
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
                    setExtraTaxAmount("0"); // Reiniciar a 0 string
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
                    {/* Input de Porcentaje */}
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
                    {/* Input de Monto */}
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
                {extraTaxType !== "PERCEPTION" && (
                  <p className="text-[10px] text-slate-400 text-right mt-1 italic">
                    * Calculado sobre el Total (
                    {currency === "PEN" ? "S/" : "$"} {totalDocument.toFixed(2)}
                    )
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 3. TOTAL FINAL NETO */}
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

          {/* SALDO A FAVOR */}
          {supplierBalance > 0 && header.payment_status === "PAID" && (
            <div className="mt-4 p-3 bg-green-100 text-green-800 rounded border border-green-300 text-xs flex flex-col gap-1 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 font-bold">
                <Wallet size={16} />
                <span>Saldo a favor disponible</span>
              </div>
              <p>
                El proveedor tiene{" "}
                <strong>S/ {supplierBalance.toFixed(2)}</strong> a favor.
              </p>
            </div>
          )}

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
