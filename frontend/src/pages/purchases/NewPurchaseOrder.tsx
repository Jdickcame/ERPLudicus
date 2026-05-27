import {
  Box,
  Building2,
  ClipboardList,
  Loader2,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import SearchableSelect from "../../components/common/SearchableSelect";
import { useBranch } from "../../context/BranchContext";

const INVOICE_UNIT_OPTIONS = [
  { value: "NIU", label: "Unidad (NIU)" },
  { value: "CAJ", label: "Caja (CAJ)" },
  { value: "FARD", label: "Fardo (FARD)" },
  { value: "PAA", label: "Paquete (PAA)" },
  { value: "SAC", label: "Saco (SAC)" },
  { value: "LTR", label: "Litro (LTR)" },
  { value: "KGM", label: "Kilogramo (KGM)" },
  { value: "MIL", label: "Millar (MIL)" },
  { value: "GLN", label: "Galón (GLN)" },
  { value: "BLS", label: "Bolsa (BLS)" },
  { value: "LATA", label: "Lata (LATA)" },
  { value: "BT", label: "Botella (BT)" },
  { value: "SRV", label: "Servicio (SRV)" },
  { value: "RLL", label: "Rollo (RLL)" },
];

const NewPurchaseOrder = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();

  // Proveedores
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [rucSearch, setRucSearch] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [isNewSupplier, setIsNewSupplier] = useState(false);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);

  // Productos
  const [products, setProducts] = useState<any[]>([]);

  const [header, setHeader] = useState({
    code: "Cargando...",
    delivery_mode: "LOCAL_DELIVERY",
    payment_method: "CREDITO",
    notes: "",
  });

  const [details, setDetails] = useState([
    {
      product_id: null as number | null,
      invoice_unit: "UNIDAD",
      units_per_package: 1,
      quantity_ordered: 1,
      unit_value: 0,
      total_value: 0,
    },
  ]);

  // Transformar productos para el SearchableSelect
  const productOptions = products.map((p) => ({
    value: p.id,
    label: `[${p.sku || "S/N"}] ${p.name}`,
  }));

  useEffect(() => {
    api
      .get("/purchases/suppliers/")
      .then((res) => setSuppliersList(res.data.results || res.data));
    api
      .get("/inventory/products/?for_purchase=true&page_size=1000")
      .then((res) => setProducts(res.data.results || res.data));
  }, []);

  useEffect(() => {
    if (currentBranch) {
      api
        .get(
          `/purchases/purchase-orders/next_sequence/?branch_id=${currentBranch.id}`,
        )
        .then((res) => setHeader((prev) => ({ ...prev, code: res.data.code })))
        .catch(() =>
          setHeader((prev) => ({ ...prev, code: "ERROR AL GENERAR" })),
        );
    }
  }, [currentBranch]);

  // BÚSQUEDA DE PROVEEDOR
  const handleSearchRuc = async () => {
    if (!rucSearch) return;
    const localFound = suppliersList.find((s) => s.tax_id === rucSearch);
    if (localFound) {
      setSupplierId(localFound.id);
      setSupplierName(localFound.name);
      setIsNewSupplier(false);
      return;
    }
    setIsSearchingSupplier(true);
    try {
      const response = await api.get(
        `/purchases/suppliers/search_doc/?doc=${rucSearch}`,
      );
      const supplierData = response.data.data;
      setSupplierName(supplierData.name);
      if (response.data.exists_local) {
        setSupplierId(supplierData.id);
        setIsNewSupplier(false);
      } else {
        setSupplierId(null);
        setIsNewSupplier(true);
        toast.success("Proveedor encontrado en SUNAT");
      }
    } catch (error) {
      toast.error("Proveedor no encontrado");
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
  };

  const addRow = () =>
    setDetails([
      ...details,
      {
        product_id: null,
        invoice_unit: "UNIDAD",
        units_per_package: 1,
        quantity_ordered: 1,
        unit_value: 0,
        total_value: 0,
      },
    ]);

  const removeRow = (index: number) => {
    if (details.length > 1) setDetails(details.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: string, value: any) => {
    const newDetails = [...details];
    const row = { ...newDetails[index], [field]: value };

    if (field === "product_id") {
      if (value) {
        const prod = products.find((p) => p.id === Number(value));
        if (prod && prod.last_cost) {
          row.unit_value = Number(prod.last_cost);
        }
      } else {
        row.unit_value = 0;
      }
    }

    if (
      field === "quantity_ordered" ||
      field === "unit_value" ||
      field === "product_id"
    ) {
      row.total_value = Number(row.quantity_ordered) * Number(row.unit_value);
    }

    newDetails[index] = row;
    setDetails(newDetails);
  };

  const totalOC = details.reduce(
    (sum, row) => sum + Number(row.total_value),
    0,
  );

  const handleSubmit = async () => {
    if (!currentBranch) return toast.error("Selecciona Sede");
    if (!rucSearch || !supplierName)
      return toast.error("Falta información del proveedor");
    if (header.code === "Cargando..." || header.code.includes("ERROR"))
      return toast.error("Esperando correlativo");

    const hasEmptyProducts = details.some((d) => !d.product_id);
    if (hasEmptyProducts)
      return toast.error("Tienes filas sin producto seleccionado.");

    try {
      let finalSupplierId = supplierId;
      if (isNewSupplier && !supplierId) {
        const supRes = await api.post("/purchases/suppliers/", {
          name: supplierName,
          tax_id: rucSearch,
          document_type:
            rucSearch.length === 11
              ? "RUC"
              : rucSearch.length === 8
              ? "DNI"
              : "CE",
        });
        finalSupplierId = supRes.data.id;
      }

      const payload = {
        code: header.code,
        branch_id: currentBranch.id,
        supplier: finalSupplierId,
        delivery_mode: header.delivery_mode,
        payment_method: header.payment_method,
        notes: header.notes,
        subtotal: totalOC.toFixed(2),
        tax_amount: "0.00",
        total: totalOC.toFixed(2),
        details: details.map((d) => ({
          product: d.product_id,
          invoice_unit: d.invoice_unit,
          units_per_package: d.units_per_package,
          quantity_ordered: d.quantity_ordered,
          unit_value: d.unit_value,
          total_value: d.total_value.toFixed(2),
        })),
      };

      await api.post("/purchases/purchase-orders/", payload);
      toast.success("¡Orden de Compra Generada!");
      navigate("/purchases/orders");
    } catch (error) {
      toast.error("Error al guardar la orden");
    }
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
            <ClipboardList className="text-blue-600" size={32} /> Emisión de
            Orden
          </h1>
        </div>
        <div className="bg-white border-2 border-slate-800 rounded-xl w-64 text-center overflow-hidden shadow-sm">
          <div className="bg-slate-800 text-white font-bold py-2 tracking-widest text-sm uppercase">
            ORDEN DE COMPRA
          </div>
          <div className="py-3 text-2xl font-black text-slate-700 font-mono tracking-wider">
            {header.code}
          </div>
        </div>
      </div>

      {/* BLOQUE PROVEEDOR */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 relative z-10">
        {supplierId && (
          <button
            onClick={clearSupplierSelection}
            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 flex items-center gap-1 text-xs font-bold bg-slate-50 px-2 py-1 rounded-full border border-slate-200"
          >
            <X size={14} /> LIMPIAR
          </button>
        )}
        <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 border-b pb-2 flex items-center gap-2">
          <Building2 size={16} /> Datos del Proveedor y Logística
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">
              RUC / DNI
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className={`w-full border p-2.5 rounded-lg outline-none ${
                  supplierId ? "bg-slate-100 text-slate-500" : "bg-white"
                }`}
                placeholder="RUC..."
                value={rucSearch}
                onChange={(e) => setRucSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchRuc()}
                readOnly={supplierId !== null && !isNewSupplier}
              />
              <button
                onClick={handleSearchRuc}
                disabled={supplierId !== null || isSearchingSupplier}
                className="bg-blue-100 text-blue-600 p-2.5 rounded-lg hover:bg-blue-200 disabled:opacity-50"
              >
                {isSearchingSupplier ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Search size={20} />
                )}
              </button>
            </div>
          </div>
          <div className="md:col-span-4">
            <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">
              Razón Social{" "}
              {isNewSupplier && (
                <span className="text-green-600 text-[10px] animate-pulse">
                  (NUEVO)
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
              className={`w-full border p-2.5 rounded-lg outline-none ${
                !isNewSupplier && supplierId
                  ? "bg-slate-100 text-slate-500"
                  : "bg-white border-blue-300 focus:ring-2 focus:ring-blue-100"
              }`}
              placeholder="Nombre..."
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              onBlur={handleSearchName}
              readOnly={!isNewSupplier && supplierId !== null}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">
              Pago
            </label>
            <select
              className="w-full border border-slate-300 p-2.5 rounded-lg outline-none text-sm font-medium"
              value={header.payment_method}
              onChange={(e) =>
                setHeader({ ...header, payment_method: e.target.value })
              }
            >
              <option value="CONTADO">CONTADO</option>
              <option value="CREDITO">CRÉDITO</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">
              Entrega
            </label>
            <select
              className="w-full border border-slate-300 p-2.5 rounded-lg outline-none text-sm font-medium"
              value={header.delivery_mode}
              onChange={(e) =>
                setHeader({ ...header, delivery_mode: e.target.value })
              }
            >
              <option value="LOCAL_DELIVERY">Entrega en Local</option>
              <option value="STORE_PICKUP">Recojo en Tienda</option>
            </select>
          </div>
        </div>
      </div>

      {/* BLOQUE PRODUCTOS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-visible mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
          <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
            <Package size={16} className="text-orange-500" /> Detalle de
            Productos a Solicitar
          </h3>
        </div>

        {/* 👇 AQUÍ QUITAMOS EL CONTENEDOR CON OVERFLOW PARA QUE EL MENÚ PUEDA VOLAR 👇 */}
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="p-4 w-[40%]">Producto</th>
              <th className="p-4 text-center">Unidad Prov.</th>
              <th className="p-4 text-center">x Empaque</th>
              <th className="p-4 text-center text-blue-600">Cant.</th>
              <th className="p-4 text-right">Costo Unit.</th>
              <th className="p-4 text-right text-slate-800">Total</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {details.map((row, idx) => {
              const realUnits =
                Number(row.quantity_ordered) * Number(row.units_per_package);
              return (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 align-top">
                    <SearchableSelect
                      options={productOptions}
                      value={row.product_id}
                      onChange={(val) => updateRow(idx, "product_id", val)}
                      placeholder="Buscar producto..."
                    />
                  </td>
                  <td className="p-3 align-top">
                    <select
                      className="w-full border border-slate-300 p-2.5 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-200"
                      value={row.invoice_unit}
                      onChange={(e) =>
                        updateRow(idx, "invoice_unit", e.target.value)
                      }
                    >
                      {INVOICE_UNIT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 align-top">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border border-slate-300 p-2 rounded-lg text-center text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
                      value={row.units_per_package}
                      onChange={(e) => {
                        let val = Number(e.target.value);
                        if (val <= 0) val = 1;
                        updateRow(idx, "units_per_package", val);
                      }}
                      title="¿Cuántas unidades base vienen dentro del empaque?"
                    />
                    {row.product_id && (
                      <div className="text-[9px] text-center font-bold text-blue-700 bg-blue-100/50 border border-blue-200 py-1 rounded flex items-center justify-center gap-1 shadow-sm mt-1">
                        <Box size={10} /> = {realUnits} Unid. Base
                      </div>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    <input
                      type="number"
                      className="w-full border border-blue-300 bg-blue-50/50 p-2 rounded-lg text-center font-black text-blue-700 outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                      value={row.quantity_ordered}
                      onChange={(e) => {
                        let val = Number(e.target.value);
                        if (val < 0) val = 0;
                        updateRow(idx, "quantity_ordered", val);
                      }}
                    />
                  </td>
                  <td className="p-3 align-top">
                    <input
                      type="number"
                      step="any"
                      className="w-full border border-slate-300 p-2 rounded-lg text-right font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                      value={row.unit_value}
                      onChange={(e) =>
                        updateRow(idx, "unit_value", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-3 align-top text-right bg-slate-50/50 pt-4">
                    <span className="font-black text-slate-800">
                      S/ {row.total_value.toFixed(2)}
                    </span>
                  </td>
                  <td className="p-3 align-top text-center pt-3">
                    <button
                      onClick={() => removeRow(idx)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-100 p-1.5 rounded-lg transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="p-3 bg-white border-t border-slate-100 rounded-b-2xl">
          <button
            onClick={addRow}
            className="text-sm text-blue-600 font-bold flex items-center gap-1 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> Agregar Línea
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <textarea
          className="border border-slate-200 p-4 rounded-2xl outline-none focus:border-blue-400 text-sm text-slate-600 resize-none h-32 shadow-sm"
          placeholder="Notas adicionales para el proveedor..."
          value={header.notes}
          onChange={(e) => setHeader({ ...header, notes: e.target.value })}
        />
        <div className="flex flex-col justify-end">
          <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800">
            <span className="text-sm font-medium text-slate-400">
              Total Estimado
            </span>
            <span className="text-4xl font-black tracking-tight">
              S/ {totalOC.toFixed(2)}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            className="w-full mt-4 bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <ClipboardList size={22} /> EMITIR ORDEN
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewPurchaseOrder;
