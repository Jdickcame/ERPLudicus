import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardEdit,
  Download,
  Loader2,
  PackagePlus,
  ShoppingCart,
  Ticket,
  Trash2,
  User,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import logoAsset from "../../assets/pago.png";
import { useBranch } from "../../context/BranchContext";

const NewRegistrationPage = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const location = useLocation();

  const preselectedEventId = location.state?.eventId || "";

  // Estados Generales
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Datos de Facturación
  const [clientDoc, setClientDoc] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [searchingDoc, setSearchingDoc] = useState(false);

  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [schedule, setSchedule] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [operationNumber, setOperationNumber] = useState("");
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);
  const [invoiceType, setInvoiceType] = useState("03");
  const [advisor, setAdvisor] = useState("");

  // Estado Modal de Formularios
  const [activeModalProduct, setActiveModalProduct] = useState<number | null>(
    null,
  );

  const [successData, setSuccessData] = useState<any>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setSuccessData(null);
    setCart([]);
    setClientDoc("");
    setClientName("");
    setClientAddress("");
    setClientPhone("");
    setOperationNumber("");
    setObservations("");
    setActiveModalProduct(null);
  };

  useEffect(() => {
    if (!currentBranch) return;
    const fetchData = async () => {
      try {
        const resEvents = await api.get(
          `/events/events/?branch_id=${currentBranch.id}`,
        );
        const eventsData = resEvents.data.results || resEvents.data;
        setEvents(eventsData);

        if (preselectedEventId) {
          const ev = eventsData.find((e: any) => e.id === preselectedEventId);
          if (ev) setSelectedEvent(ev);
        } else if (eventsData.length > 0) {
          setSelectedEvent(eventsData[0]);
        }

        const resProds = await api.get(
          `/inventory/products/?branch_id=${currentBranch.id}&is_active=true&page_size=1000`,
        );
        const prodsData = resProds.data.results || resProds.data;

        setAvailableProducts(
          prodsData.filter(
            (p: any) =>
              ["FINISHED", "STOCKED", "SERVICE"].includes(p.product_type) &&
              p.category_name &&
              p.category_name.toUpperCase() === "EVENTOS",
            // p.category_name && ["BOLETERÍA", "EVENTOS"].includes(p.category_name.toUpperCase())
          ),
        );
      } catch (error) {
        console.error("Error cargando datos", error);
      }
    };
    fetchData();
  }, [currentBranch, preselectedEventId]);

  const handleEventChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ev = events.find((event) => event.id === parseInt(e.target.value));
    setSelectedEvent(ev || null);
    setSchedule("");
    setCart([]);
  };

  const handleSearchDoc = async () => {
    const cleanDoc = clientDoc.trim();
    setClientDoc(cleanDoc);
    if (!cleanDoc || cleanDoc.length < 8)
      return toast.error("El documento debe tener al menos 8 dígitos.");
    setSearchingDoc(true);
    try {
      const res = await api.get(`/sales/customers/search_doc/?doc=${cleanDoc}`);
      const { data } = res.data;
      if (data && data.name) {
        setClientName(data.name);
        setClientAddress(data.address || "PERU");
        setInvoiceType(clientDoc.length === 11 ? "01" : "03");
        toast.success("¡Cliente encontrado!");
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || "No encontrado. Ingrésalo manualmente.",
      );
    } finally {
      setSearchingDoc(false);
    }
  };

  const getAllCategories = () => {
    if (!selectedEvent?.is_advanced_registration || !selectedEvent?.form_schema)
      return [];
    const cats = new Set<string>();
    selectedEvent.form_schema.forEach((p: any) => {
      p.keywords.split(",").forEach((k: string) => {
        if (k.trim()) cats.add(k.trim());
      });
    });
    return Array.from(cats);
  };

  const getProfileByCategory = (categoryName: string) => {
    if (!categoryName || !selectedEvent?.form_schema) return null;
    return selectedEvent.form_schema.find((p: any) =>
      p.keywords
        .split(",")
        .map((k: string) => k.trim().toLowerCase())
        .includes(categoryName.toLowerCase()),
    );
  };

  const addToCart = (producto: any) => {
    const price = parseFloat(producto.selling_price || producto.price || 0);
    const existing = cart.find((item) => item.product_id === producto.id);

    if (existing) {
      setCart(
        cart.map((item) =>
          item.product_id === producto.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * price,
                attendees: [...(item.attendees || []), {}],
              }
            : item,
        ),
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: producto.id,
          name: producto.name,
          quantity: 1,
          price: price,
          subtotal: price,
          attendees: [{}],
        },
      ]);
    }
  };

  const updateCartQuantity = (productId: number, delta: number) => {
    setCart(
      cart.map((item) => {
        if (item.product_id === productId) {
          const newQuantity = Math.max(1, item.quantity + delta);
          let newAttendees = [...(item.attendees || [])];

          if (newQuantity > item.quantity) newAttendees.push({});
          else if (newQuantity < item.quantity) newAttendees.pop();

          return {
            ...item,
            quantity: newQuantity,
            subtotal: newQuantity * item.price,
            attendees: newAttendees,
          };
        }
        return item;
      }),
    );
  };

  const removeFromCart = (productId: number) =>
    setCart(cart.filter((item) => item.product_id !== productId));

  const handleAttendeeChange = (
    productId: number,
    attendeeIndex: number,
    fieldLabel: string,
    value: any,
  ) => {
    setCart(
      cart.map((item) => {
        if (item.product_id === productId) {
          const newAttendees = [...item.attendees];
          newAttendees[attendeeIndex] = {
            ...newAttendees[attendeeIndex],
            [fieldLabel]: value,
          };
          return { ...item, attendees: newAttendees };
        }
        return item;
      }),
    );
  };

  const totalCart = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const handleGenerar = async () => {
    if (!selectedEvent) return toast.error("Selecciona un evento válido.");
    if (cart.length === 0)
      return toast.error("Debes agregar al menos una entrada.");
    if (
      selectedEvent.has_specific_schedule &&
      !selectedEvent.is_advanced_registration &&
      !schedule
    )
      return toast.error("Selecciona un horario.");
    if (
      ["CARD", "TRANSFER", "PAGO_LINK"].includes(paymentMethod) &&
      !operationNumber
    )
      return toast.error(
        "El Número de Operación es obligatorio para este pago.",
      );

    let consolidatedAttendeeData: any[] = [];

    if (selectedEvent.is_advanced_registration) {
      for (const item of cart) {
        for (let i = 0; i < item.attendees.length; i++) {
          const attendeeAnswers = item.attendees[i];
          const chosenCategory = attendeeAnswers["__category"];

          if (!chosenCategory) {
            return toast.error(
              `Debes elegir la Categoría para el Participante ${
                i + 1
              } de la entrada "${item.name}"`,
            );
          }

          const profile = getProfileByCategory(chosenCategory);
          if (profile) {
            for (const field of profile.fields) {
              if (
                field.required &&
                (!attendeeAnswers[field.label] ||
                  attendeeAnswers[field.label].toString().trim() === "")
              ) {
                return toast.error(
                  `Falta llenar "${field.label}" en el Participante ${
                    i + 1
                  } (${chosenCategory})`,
                );
              }
            }
          }

          const finalAnswers = { ...attendeeAnswers };
          delete finalAnswers["__category"];

          consolidatedAttendeeData.push({
            producto_comprado: item.name,
            categoria_elegida: chosenCategory,
            perfil_aplicado: profile?.profileName || "General",
            ...finalAnswers,
          });
        }
      }
    }

    const cleanDoc = clientDoc.trim();
    setSaving(true);
    try {
      const payload = {
        branch_id: currentBranch?.id,
        date: new Date().toISOString(),
        invoice_type_code: invoiceType,
        customer: null,
        customer_document: clientDoc || "00000000",
        customer_name: clientName || "Público General",
        customer_type:
          cleanDoc.length >= 11 ? "RUC" : cleanDoc.length === 9 ? "CE" : "DNI",
        client_address: clientAddress || "PERU",
        client_phone: clientPhone,
        event_id: selectedEvent.id,
        schedule_selected: schedule,
        advisor: advisor,
        operation_number: operationNumber,
        observations: observations,
        attendee_data: consolidatedAttendeeData,
        details: cart.map((item) => ({
          product: item.product_id,
          quantity: item.quantity,
          price: item.price.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
        })),
        payments: [
          { payment_method: paymentMethod, amount: totalCart.toFixed(2) },
        ],
        total: totalCart.toFixed(2),
      };

      const res = await api.post("/sales/sales/?origin=web", payload);
      const ticketCode = res.data.generated_ticket_code;
      const ticketQty = res.data.generated_ticket_quantity;

      if (!ticketCode) {
        toast.success("Venta completada (Sin entradas de evento)");
        resetForm();
        return;
      }

      let finalNameForQR = clientName || "Público General";
      if (consolidatedAttendeeData.length > 0) {
        const primerCorredor = consolidatedAttendeeData[0];
        const keyNombre = Object.keys(primerCorredor).find((k) =>
          k.toUpperCase().includes("NOMBRE"),
        );
        if (keyNombre && primerCorredor[keyNombre])
          finalNameForQR = primerCorredor[keyNombre];
      }

      setSuccessData({
        ticketCode: ticketCode,
        clientName: finalNameForQR,
        totalEntries: ticketQty,
        eventName: selectedEvent.name,
        ticketDetails: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
        })),
      });

      toast.success("¡Inscripción generada con éxito!");
    } catch (error: any) {
      toast.error("Error al procesar la inscripción.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadQR = () => {
    if (!qrRef.current || !successData) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const qrImg = new Image();
    const customImg = new Image();
    customImg.src = logoAsset;
    canvas.width = 460;
    canvas.height = 500;
    Promise.all([
      new Promise((resolve) => (qrImg.onload = resolve)),
      new Promise((resolve) => (customImg.onload = resolve)),
    ]).then(() => {
      if (!ctx) return;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.fillStyle = "#0f172a";
      ctx.font = "900 24px sans-serif";
      ctx.fillText("LUDICUS PARK", canvas.width / 2, 45);
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("TU PASE DIGITAL", canvas.width / 2, 70);
      const elementWidth = 170;
      const qrSize = elementWidth;
      const gap = 30;
      const customAspectRatio =
        customImg.naturalHeight / customImg.naturalWidth;
      const customHeight = elementWidth * customAspectRatio;
      const totalBlockWidth = elementWidth * 2 + gap;
      const startX = (canvas.width - totalBlockWidth) / 2;
      const containerY = 100;
      const qrY = containerY + (customHeight - qrSize) / 2;
      const customY = containerY;
      ctx.drawImage(qrImg, startX, qrY, qrSize, qrSize);
      ctx.drawImage(
        customImg,
        startX + elementWidth + gap,
        customY,
        elementWidth,
        customHeight,
      );
      const tallestHeight = Math.max(qrSize, customHeight);
      const infoY = containerY + tallestHeight + 50;
      ctx.fillStyle = "#0f172a";
      ctx.font = "900 18px sans-serif";
      const name = successData.clientName || "PÚBLICO GENERAL";
      const displayName =
        name.length > 30 ? name.substring(0, 27) + "..." : name;
      ctx.fillText(displayName.toUpperCase(), canvas.width / 2, infoY);
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(
        "PRESENTA ESTE CÓDIGO AL INGRESAR",
        canvas.width / 2,
        infoY + 30,
      );
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "mono 10px sans-serif";
      ctx.fillText(successData.ticketCode, canvas.width / 2, infoY + 50);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `Pase_Ludicus_${successData.ticketCode}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    });
    qrImg.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const activeProductData = cart.find(
    (item) => item.product_id === activeModalProduct,
  );
  const eventCategories = getAllCategories();

  if (!currentBranch)
    return <div className="p-10 text-center">Selecciona una sede...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20 p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
      {/* --- CABECERA --- */}
      <div className="max-w-[1300px] mx-auto flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/events")}
            className="p-2.5 bg-white shadow-sm hover:shadow-md hover:bg-slate-100 rounded-full transition-all text-slate-600 border border-slate-200"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              Inscripción de Evento
            </h1>
            <p className="text-slate-500 font-medium text-sm mt-0.5">
              Sede:{" "}
              <span className="text-blue-600 font-bold">
                {currentBranch.name}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[1300px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ==================================================== */}
        {/* COLUMNA IZQUIERDA (FORMULARIOS) - 7 Columnas         */}
        {/* ==================================================== */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* BLOQUE 1: EVENTO */}
          <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-6 pb-4 border-b border-slate-100 uppercase tracking-wider">
              <Calendar size={20} className="text-blue-500" /> 1. Información
              del Evento
            </h3>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Evento Activo <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedEvent?.id || ""}
                  onChange={handleEventChange}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-all text-sm font-bold text-slate-700 cursor-pointer"
                >
                  <option value="">-- Selecciona el Evento --</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} {ev.date ? `(${ev.date})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEvent?.has_specific_schedule &&
                !selectedEvent?.is_advanced_registration && (
                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <label className="block text-xs font-bold text-blue-800 mb-2 uppercase tracking-wider">
                      Bloque / Horario Asignado{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      className="w-full p-3 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 transition-all text-sm font-bold text-blue-900 cursor-pointer shadow-sm"
                    >
                      <option value="">-- Seleccionar --</option>
                      {selectedEvent.available_schedules?.map(
                        (sch: string, i: number) => (
                          <option key={i} value={sch}>
                            {sch}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                )}
            </div>
          </div>

          {/* BLOQUE 2: COMPRADOR */}
          <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-6 pb-4 border-b border-slate-100 uppercase tracking-wider">
              <User size={20} className="text-indigo-500" /> 2. Datos del
              Comprador
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  DNI / RUC <span className="text-red-500">*</span>
                </label>
                <div className="flex bg-slate-50 border border-slate-200 rounded-xl focus-within:bg-white focus-within:border-indigo-500 transition-all overflow-hidden shadow-sm">
                  <input
                    type="text"
                    value={clientDoc}
                    onChange={(e) => setClientDoc(e.target.value)}
                    className="w-full p-3.5 bg-transparent outline-none text-sm font-bold text-slate-700"
                    placeholder="Documento..."
                  />
                  <button
                    onClick={handleSearchDoc}
                    disabled={searchingDoc}
                    className="bg-indigo-50 hover:bg-indigo-100 px-5 text-indigo-600 transition-colors border-l border-slate-200 flex items-center justify-center font-bold text-sm"
                  >
                    {searchingDoc ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      "Buscar"
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Nombre o Razón Social <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 transition-all text-sm font-bold text-slate-700 shadow-sm"
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Dirección
                </label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 transition-all text-sm font-bold text-slate-700 shadow-sm"
                  placeholder="Dirección fiscal (Opcional)"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 transition-all text-sm font-bold text-slate-700 shadow-sm"
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Asesor de Venta
                </label>
                <select
                  value={advisor}
                  onChange={(e) => setAdvisor(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 transition-all text-sm font-bold text-slate-700 cursor-pointer shadow-sm"
                >
                  <option value="">-- Ninguno --</option>
                  <option value="PEDRO">PEDRO</option>
                  <option value="DIANA">DIANA</option>
                  <option value="DENITH">DENITH</option>
                  <option value="JULIET">JULIET</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Observaciones
                </label>
                <input
                  type="text"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 transition-all text-sm font-bold text-slate-700 shadow-sm"
                  placeholder="Anotaciones internas de la venta..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* COLUMNA DERECHA (CHECKOUT UNIFICADO STICKY)            */}
        {/* ==================================================== */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
            {/* CABECERA DEL CARRITO */}
            <div className="bg-slate-50 p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                <ShoppingCart size={18} className="text-emerald-500" />
                Resumen de Orden
              </h3>
              <span className="bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-md text-xs">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} Tickets
              </span>
            </div>

            {/* SELECTOR DE ENTRADAS */}
            <div className="p-5 border-b border-slate-100">
              <div className="relative">
                <Ticket
                  className="absolute left-3.5 top-3.5 text-slate-400"
                  size={18}
                />
                <select
                  onChange={(e) => {
                    const prod = availableProducts.find(
                      (p) => p.id === parseInt(e.target.value),
                    );
                    if (prod) addToCart(prod);
                    e.target.value = "";
                  }}
                  className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-emerald-500 transition-all text-sm font-bold text-slate-700 cursor-pointer appearance-none shadow-sm"
                >
                  <option value="">Añadir Entrada al Carrito...</option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — S/{" "}
                      {parseFloat(p.selling_price || p.price || "0").toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* LISTA DE PRODUCTOS (SCROLLABLE) */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar max-h-[320px] bg-slate-50/30">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <PackagePlus size={40} className="mb-3 opacity-20" />
                  <span className="text-xs font-bold uppercase tracking-widest opacity-60">
                    Carrito Vacío
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="pr-4">
                          <p className="font-black text-slate-800 text-[14px] leading-tight">
                            {item.name}
                          </p>
                          <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                            S/ {item.price.toFixed(2)} c/u
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product_id)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                          <button
                            onClick={() =>
                              updateCartQuantity(item.product_id, -1)
                            }
                            disabled={item.quantity <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-white hover:shadow-sm font-black disabled:opacity-30 transition-all"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-black text-slate-800 text-xs">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateCartQuantity(item.product_id, 1)
                            }
                            className="w-7 h-7 flex items-center justify-center rounded-md text-emerald-600 hover:bg-white hover:shadow-sm font-black transition-all"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-black text-slate-800 text-base">
                          S/ {item.subtotal.toFixed(2)}
                        </span>
                      </div>

                      {selectedEvent?.is_advanced_registration && (
                        <button
                          onClick={() => setActiveModalProduct(item.product_id)}
                          className="w-full mt-3 flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white font-black py-2 rounded-lg transition-all text-[10px] uppercase tracking-wider border border-indigo-100 hover:border-indigo-600"
                        >
                          <ClipboardEdit size={14} /> Participantes (
                          {item.quantity})
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECCIÓN DE PAGO Y CONFIRMACIÓN */}
            <div className="p-6 bg-slate-50 border-t border-slate-200">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">
                    Comprobante
                  </label>
                  <select
                    value={invoiceType}
                    onChange={(e) => setInvoiceType(e.target.value)}
                    className="w-full p-2.5 rounded-lg outline-none bg-white text-slate-700 text-xs font-bold border border-slate-300 focus:border-emerald-500 transition-all cursor-pointer shadow-sm"
                  >
                    <option value="03">Boleta (03)</option>
                    <option value="01">Factura (01)</option>
                    <option value="00">Nota Venta (00)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">
                    Método Pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2.5 rounded-lg outline-none bg-white text-slate-700 text-xs font-bold border border-slate-300 focus:border-emerald-500 transition-all cursor-pointer shadow-sm"
                  >
                    <option value="CARD">Visa/Yape/Plin</option>
                    <option value="CASH">Efectivo</option>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="PAGO_LINK">Pago Link</option>
                  </select>
                </div>
              </div>

              {["CARD", "TRANSFER", "PAGO_LINK"].includes(paymentMethod) && (
                <div className="mb-4 animate-in slide-in-from-top-2">
                  <input
                    type="text"
                    value={operationNumber}
                    onChange={(e) => setOperationNumber(e.target.value)}
                    className="w-full p-3 rounded-lg outline-none bg-white text-slate-700 text-sm font-bold border border-slate-300 focus:border-emerald-500 transition-all placeholder:text-slate-400 placeholder:font-medium shadow-sm"
                    placeholder="N° de Operación o Ref..."
                  />
                </div>
              )}

              <div className="flex items-end justify-between py-4 mb-2 border-t border-slate-200 border-dashed mt-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Total
                </p>
                <p className="text-3xl font-black text-slate-800 tracking-tighter">
                  S/ {totalCart.toFixed(2)}
                </p>
              </div>

              <button
                onClick={handleGenerar}
                disabled={saving || cart.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-black text-sm tracking-widest uppercase transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2 active:scale-95"
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                {saving ? "Procesando..." : "Confirmar e Inscribir"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 🚀 MODAL DE FORMULARIOS DINÁMICOS CON SELECTOR 🚀    */}
      {/* ==================================================== */}
      {activeProductData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-indigo-600 p-5 flex justify-between items-center rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-white font-black text-xl">
                  Datos de Participantes
                </h3>
                <p className="text-indigo-200 text-sm font-medium">
                  Producto: {activeProductData.name}
                </p>
              </div>
              <button
                onClick={() => setActiveModalProduct(null)}
                className="text-white/70 hover:text-white transition bg-white/10 hover:bg-white/20 p-2 rounded-full"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-slate-50">
              {activeProductData.attendees.map(
                (attendee: any, attIdx: number) => {
                  const activeProfile = getProfileByCategory(
                    attendee["__category"],
                  );

                  return (
                    <div
                      key={attIdx}
                      className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"
                    >
                      <p className="text-sm font-black text-indigo-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                        Participante {attIdx + 1}
                      </p>

                      <div className="mb-4 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                        <label className="text-[10px] font-bold text-indigo-600 mb-1 uppercase block">
                          Categoría / Modalidad{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={attendee["__category"] || ""}
                          onChange={(e) =>
                            handleAttendeeChange(
                              activeProductData.product_id,
                              attIdx,
                              "__category",
                              e.target.value,
                            )
                          }
                          className="p-2 text-sm border border-indigo-300 rounded-lg focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none w-full bg-white font-bold text-indigo-900"
                        >
                          <option value="">
                            -- Elige la categoría de este corredor --
                          </option>
                          {eventCategories.map((cat, i) => (
                            <option key={i} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      {activeProfile && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
                          {activeProfile.fields.map(
                            (field: any, fIdx: number) => (
                              <div key={fIdx} className="flex flex-col">
                                <label className="text-[10px] font-bold text-slate-500 mb-1 uppercase">
                                  {field.label}{" "}
                                  {field.required && (
                                    <span className="text-red-500">*</span>
                                  )}
                                </label>
                                {field.type === "text" ||
                                field.type === "date" ||
                                field.type === "number" ? (
                                  <input
                                    // Si es tipo número, usamos "text" para que NO salgan las flechitas
                                    type={
                                      field.type === "number"
                                        ? "text"
                                        : field.type
                                    }
                                    // Pero activamos el teclado numérico en celulares
                                    inputMode={
                                      field.type === "number"
                                        ? "numeric"
                                        : undefined
                                    }
                                    // Bloqueamos letras en tiempo real (solo deja pasar números del 0 al 9)
                                    onInput={(e) => {
                                      if (field.type === "number") {
                                        e.currentTarget.value =
                                          e.currentTarget.value.replace(
                                            /[^0-9]/g,
                                            "",
                                          );
                                      }
                                    }}
                                    value={attendee[field.label] || ""}
                                    onChange={(e) =>
                                      handleAttendeeChange(
                                        activeProductData.product_id,
                                        attIdx,
                                        field.label,
                                        e.target.value,
                                      )
                                    }
                                    className="p-2 text-sm border border-slate-300 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-full transition"
                                  />
                                ) : field.type === "select" ? (
                                  <select
                                    value={attendee[field.label] || ""}
                                    onChange={(e) =>
                                      handleAttendeeChange(
                                        activeProductData.product_id,
                                        attIdx,
                                        field.label,
                                        e.target.value,
                                      )
                                    }
                                    className="p-2 text-sm border border-slate-300 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-full bg-white transition"
                                  >
                                    <option value="">-- Seleccionar --</option>
                                    {field.options
                                      ?.split(",")
                                      .map((opt: string, oIdx: number) => (
                                        <option key={oIdx} value={opt.trim()}>
                                          {opt.trim()}
                                        </option>
                                      ))}
                                  </select>
                                ) : field.type === "checkbox" ? (
                                  <select
                                    value={attendee[field.label] || "No"}
                                    onChange={(e) =>
                                      handleAttendeeChange(
                                        activeProductData.product_id,
                                        attIdx,
                                        field.label,
                                        e.target.value,
                                      )
                                    }
                                    className="p-2 text-sm border border-slate-300 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-full bg-white transition"
                                  >
                                    <option value="Sí">Sí</option>
                                    <option value="No">No</option>
                                  </select>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-white rounded-b-2xl flex justify-end shrink-0">
              <button
                onClick={() => setActiveModalProduct(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl transition shadow-md"
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE ÉXITO QR --- */}
      {successData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm flex flex-col max-h-[95vh] overflow-hidden animate-in zoom-in-95 duration-300 relative border border-slate-200">
            <div className="bg-emerald-500 p-6 text-center shrink-0">
              <CheckCircle2
                size={48}
                className="mx-auto text-white mb-2"
                strokeWidth={2.5}
              />
              <h2 className="text-2xl font-black text-white tracking-tight">
                ¡Venta Exitosa!
              </h2>
            </div>
            <div className="p-6 flex flex-col items-center overflow-y-auto custom-scrollbar flex-1">
              <div
                ref={qrRef}
                className="bg-white p-4 rounded-3xl shadow-lg border border-slate-100 mb-6"
              >
                <QRCodeSVG
                  value={successData.ticketCode}
                  size={180}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="w-full flex flex-col gap-3 mb-8">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <p className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    Código de Ticket
                  </p>
                  <p className="text-3xl font-black text-slate-800 tracking-widest mt-1">
                    {successData.ticketCode}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <p className="text-[11px] uppercase font-bold text-slate-400">
                    Titular Principal
                  </p>
                  <p className="font-bold text-slate-700 truncate mt-1 text-lg">
                    {successData.clientName}
                  </p>
                </div>
              </div>
              <div className="w-full flex flex-col sm:flex-row gap-3 shrink-0 mt-auto">
                <button
                  onClick={resetForm}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Nueva Venta
                </button>
                <button
                  onClick={handleDownloadQR}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl flex justify-center items-center gap-2 transition shadow-lg shadow-blue-500/30"
                >
                  <Download size={20} /> Guardar QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewRegistrationPage;
