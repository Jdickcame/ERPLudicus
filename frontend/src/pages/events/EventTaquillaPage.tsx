import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Contact2,
  Download,
  Eye,
  Filter,
  Printer,
  QrCode,
  Search,
  Ticket,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import logoAsset from "../../assets/pago.png";
import Pagination from "../../components/common/Pagination";

interface TicketDetail {
  product_id: number;
  product_name: string;
  quantity: number;
  redeemed: number;
  available: number;
}

interface Registration {
  id: number;
  sale: number;
  ticket_code: string;
  client_name: string;
  client_doc: string;
  schedule_selected: string | null;
  status: "AVAILABLE" | "REDEEMED";
  redeemed_at: string | null;
  total_quantity: number;
  redeemed_quantity: number;
  created_at?: string;
  payment_method?: string;
  ticket_details?: TicketDetail[];
  attendee_data?: any[];
}

const EventTaquillaPage = () => {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const [eventData, setEventData] = useState<any>(null);

  // ESTADO DE LAS PESTAÑAS PRINCIPALES
  const [activeTab, setActiveTab] = useState<"TICKETS" | "ATTENDEES">(
    "TICKETS",
  );

  // ESTADO PARA LA SUB-PESTAÑA DE FORMULARIOS
  const [activeProfileTab, setActiveProfileTab] = useState<string>("");

  const [allRegistrations, setAllRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<
    Registration[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  // FECHAS Y FILTROS
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [appliedStartDate, setAppliedStartDate] = useState(today);
  const [appliedEndDate, setAppliedEndDate] = useState(today);
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [appliedPaymentFilter, setAppliedPaymentFilter] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);

  // PAGINACIÓN
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // MODALES
  const [selectedTicket, setSelectedTicket] = useState<Registration | null>(
    null,
  );
  const [ticketToRedeem, setTicketToRedeem] = useState<Registration | null>(
    null,
  );
  const [itemsToRedeem, setItemsToRedeem] = useState<{
    [product_id: number]: number;
  }>({});
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [ticketToQR, setTicketToQR] = useState<Registration | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // 1. CARGA DE DATOS
  useEffect(() => {
    if (!eventId) return;

    const fetchEventAndTickets = async () => {
      setLoading(true);
      try {
        const resEvent = await api.get(`/events/events/${eventId}/`);
        const evData = resEvent.data;
        setEventData(evData);

        if (
          evData?.is_advanced_registration &&
          evData?.form_schema?.length > 0
        ) {
          setActiveProfileTab(evData.form_schema[0].profileName);
        }

        const resTickets = await api.get(
          `/events/registrations/?event_id=${eventId}&start_date=${appliedStartDate}&end_date=${appliedEndDate}&payment_method=${appliedPaymentFilter}&page_size=10000`,
        );
        setAllRegistrations(resTickets.data.results || resTickets.data);
      } catch (error) {
        toast.error("Error al cargar la taquilla");
      } finally {
        setLoading(false);
      }
    };

    fetchEventAndTickets();
  }, [eventId, appliedStartDate, appliedEndDate, appliedPaymentFilter]);

  // APLANAMIENTO DE PARTICIPANTES (INCLUYENDO _originalIndex)
  const allAttendees = useMemo(() => {
    let list: any[] = [];
    allRegistrations.forEach((reg) => {
      if (reg.attendee_data && Array.isArray(reg.attendee_data)) {
        reg.attendee_data.forEach((att, idx) => {
          // Guardamos el índice original del array para mandarlo al backend
          list.push({ ...att, _parentTicket: reg, _originalIndex: idx });
        });
      }
    });
    return list;
  }, [allRegistrations]);

  // EXTRACTOR EXACTO DE COLUMNAS SEGÚN EL FORMULARIO ACTIVO
  const dynamicColumns = useMemo(() => {
    if (
      activeTab !== "ATTENDEES" ||
      !activeProfileTab ||
      !eventData?.form_schema
    )
      return [];
    const profile = eventData.form_schema.find(
      (p: any) => p.profileName === activeProfileTab,
    );
    if (!profile) return [];
    return profile.fields.map((f: any) => f.label);
  }, [activeTab, activeProfileTab, eventData]);

  const [filteredAttendees, setFilteredAttendees] = useState<any[]>([]);

  // LÓGICA DE FILTRADO
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();

    // Filtrar Tickets
    let fTickets = allRegistrations;
    if (selectedSchedule) {
      fTickets = fTickets.filter(
        (reg) => (reg.schedule_selected || "Sin Horario") === selectedSchedule,
      );
    }
    if (term) {
      fTickets = fTickets.filter(
        (reg) =>
          (reg.ticket_code && reg.ticket_code.toLowerCase().includes(term)) ||
          (reg.client_doc && reg.client_doc.toLowerCase().includes(term)) ||
          (reg.client_name && reg.client_name.toLowerCase().includes(term)),
      );
    }
    setFilteredRegistrations(fTickets);

    // Filtrar Participantes
    let fAttendees = allAttendees;
    if (activeProfileTab) {
      fAttendees = fAttendees.filter(
        (att) => (att.perfil_aplicado || "General") === activeProfileTab,
      );
    }
    if (selectedSchedule) {
      fAttendees = fAttendees.filter(
        (att) =>
          (att._parentTicket.schedule_selected || "Sin Horario") ===
          selectedSchedule,
      );
    }
    if (term) {
      fAttendees = fAttendees.filter((att) => {
        const inTicket = att._parentTicket.ticket_code
          .toLowerCase()
          .includes(term);
        const inValues = Object.entries(att).some(([key, val]) => {
          if (key === "_parentTicket" || key === "_originalIndex") return false;
          return String(val).toLowerCase().includes(term);
        });
        return inTicket || inValues;
      });
    }
    setFilteredAttendees(fAttendees);

    setPage(1);
  }, [
    searchTerm,
    allRegistrations,
    allAttendees,
    selectedSchedule,
    activeProfileTab,
  ]);

  const activeTotalCount =
    activeTab === "TICKETS"
      ? filteredRegistrations.length
      : filteredAttendees.length;
  const paginatedRegistrations = filteredRegistrations.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const paginatedAttendees = filteredAttendees.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value.replace(/'/g, "-"));
  };

  const handleQuantityChange = (
    productId: number,
    delta: number,
    maxAvailable: number,
  ) => {
    setItemsToRedeem((prev) => {
      const current = prev[productId] || 0;
      let next = current + delta;
      if (next < 0) next = 0;
      if (next > maxAvailable) next = maxAvailable;
      return { ...prev, [productId]: next };
    });
  };

  // 👇 LÓGICA 1: CANJE DEL TICKET COMPLETO (MODAL) 👇
  const executeRedeem = async () => {
    if (!ticketToRedeem) return;

    const totalSeleccionado = Object.values(itemsToRedeem).reduce(
      (a, b) => a + b,
      0,
    );
    if (totalSeleccionado === 0)
      return toast.error(
        "Debes seleccionar al menos una entrada para validar.",
      );

    setIsRedeeming(true);
    try {
      const res = await api.patch(
        `/events/registrations/${ticketToRedeem.id}/redeem/`,
        { items: itemsToRedeem },
      );
      setAllRegistrations((prev) =>
        prev.map((reg) => (reg.id === ticketToRedeem.id ? res.data : reg)),
      );
      toast.success(`Acceso concedido a ${totalSeleccionado} personas.`);
      setTicketToRedeem(null);
      setItemsToRedeem({});
      setSearchTerm("");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Error al validar el ticket");
    } finally {
      setIsRedeeming(false);
    }
  };

  // 👇 LÓGICA 2: CANJE INDIVIDUAL (DIRECTO DESDE LA PESTAÑA PARTICIPANTE) 👇
  const handleSingleRedeem = async (
    parentTicket: Registration,
    productName: string,
    originalIndex: number,
  ) => {
    const detail = parentTicket.ticket_details?.find(
      (d) => d.product_name === productName,
    );

    if (!detail) return toast.error("No se encontró el detalle de la entrada.");
    if (detail.available <= 0)
      return toast.error(
        "Ya se validaron todas las entradas de este tipo en el ticket.",
      );

    setIsRedeeming(true);
    try {
      const payload = {
        items: { [detail.product_id]: 1 },
        attendee_index: originalIndex,
      };
      const res = await api.patch(
        `/events/registrations/${parentTicket.id}/redeem/`,
        payload,
      );

      setAllRegistrations((prev) =>
        prev.map((reg) => (reg.id === parentTicket.id ? res.data : reg)),
      );
      toast.success(`Acceso validado para 1 participante (${productName}).`);
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || "Error al validar el acceso individual",
      );
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleDownloadQR = () => {
    if (!qrRef.current || !ticketToQR) return;
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
      const displayName =
        ticketToQR.client_name.length > 30
          ? ticketToQR.client_name.substring(0, 27) + "..."
          : ticketToQR.client_name;
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
      ctx.fillText(ticketToQR.ticket_code, canvas.width / 2, infoY + 50);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `Pase_Ludicus_${ticketToQR.ticket_code}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    });

    qrImg.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const handlePrint = async (saleId: number, papel: "ticket_80" | "a4") => {
    if (!saleId) return toast.error("Error: No se encontró comprobante.");
    try {
      const response = await api.get(
        `/sales/sales/${saleId}/print/?papel=${papel}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      window.open(url, "_blank");
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error("❌ Error cargando el comprobante de venta");
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await api.get(`/events/registrations/export_excel/`, {
        params: {
          event_id: eventId,
          start_date: appliedStartDate,
          end_date: appliedEndDate,
          payment_method: appliedPaymentFilter,
        },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Reporte_${eventData?.name || "Evento"}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      toast.error("Error al exportar Excel");
    }
  };

  const scheduleSummary = allRegistrations.reduce(
    (
      acc: {
        [key: string]: { total: number; details: { [key: string]: number } };
      },
      reg,
    ) => {
      const label = reg.schedule_selected || "Sin Horario";
      if (!acc[label]) acc[label] = { total: 0, details: {} };
      acc[label].total += reg.total_quantity;
      if (reg.ticket_details) {
        reg.ticket_details.forEach((det) => {
          acc[label].details[det.product_name] =
            (acc[label].details[det.product_name] || 0) + det.quantity;
        });
      }
      return acc;
    },
    {},
  );

  const globalSummary = allRegistrations.reduce(
    (acc: { total: number; details: { [key: string]: number } }, reg) => {
      acc.total += reg.total_quantity;
      if (reg.ticket_details) {
        reg.ticket_details.forEach((det) => {
          acc.details[det.product_name] =
            (acc.details[det.product_name] || 0) + det.quantity;
        });
      }
      return acc;
    },
    { total: 0, details: {} },
  );

  const formatDate = (dateString?: string) => {
    if (!dateString) return "S/F";
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "S/F";
    }
  };

  const getPaymentBadge = (method?: string) => {
    switch (method) {
      case "CASH":
        return (
          <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold text-[10px] whitespace-nowrap">
            EFECTIVO
          </span>
        );
      case "CARD":
        return (
          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold text-[10px] whitespace-nowrap">
            VISA
          </span>
        );
      case "TRANSFER":
        return (
          <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold text-[10px] whitespace-nowrap">
            TRANSFER.
          </span>
        );
      case "PAGO_LINK":
        return (
          <span className="bg-sky-100 text-sky-700 px-2 py-1 rounded font-bold text-[10px] whitespace-nowrap">
            PAGO LINK
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold text-[10px] whitespace-nowrap">
            {method || "N/A"}
          </span>
        );
    }
  };

  const handleClearFilters = () => {
    setStartDate(today);
    setEndDate(today);
    setPaymentFilter("ALL");
    setAppliedStartDate(today);
    setAppliedEndDate(today);
    setAppliedPaymentFilter("ALL");
  };

  const handleApplyFilters = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedPaymentFilter(paymentFilter);
  };

  if (!eventData)
    return (
      <div className="p-10 text-center text-slate-500">
        Cargando taquilla...
      </div>
    );

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => navigate("/events")}
            className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full transition text-slate-700"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Taquilla: <span className="text-blue-600">{eventData.name}</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Control de accesos y validaciones
            </p>
          </div>
        </div>

        {/* BOTONES SUPERIORES */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition shadow-sm font-medium flex-1 sm:flex-none ${
              showFilters
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Filter size={18} /> Filtros
          </button>
          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition shadow-md whitespace-nowrap"
          >
            <Download size={18} /> Excel
          </button>
          <button
            onClick={() =>
              navigate("/events/new", { state: { eventId: eventData.id } })
            }
            className="flex-1 sm:flex-none justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold transition shadow-md whitespace-nowrap"
          >
            + Venta / Inscrip.
          </button>
        </div>
      </div>

      {/* PANEL DESPLEGABLE DE FILTROS */}
      {showFilters && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6 animate-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                Método de Pago
              </label>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-slate-700"
              >
                <option value="ALL">Todos los Pagos</option>
                <option value="CASH">Efectivo</option>
                <option value="CARD">Visa / Yape / Plin</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="PAGO_LINK">Pago Link</option>
              </select>
            </div>
            <div className="md:col-span-3 flex items-end justify-end gap-3 mt-2">
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                <X size={16} /> Limpiar
              </button>
              <button
                onClick={handleApplyFilters}
                className="flex items-center gap-1.5 px-6 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition shadow-sm"
              >
                <Search size={16} /> Aplicar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TARJETAS DETALLADAS DE RESUMEN CLICKEABLES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
        {Object.entries(scheduleSummary).map(([horario, data]) => {
          const isActive = selectedSchedule === horario;
          return (
            <div
              key={horario}
              onClick={() => setSelectedSchedule(isActive ? null : horario)}
              className={`bg-white p-4 rounded-xl shadow-sm flex flex-col cursor-pointer transition-all ${
                isActive
                  ? "border-2 border-blue-500 ring-4 ring-blue-500/20 scale-[1.02]"
                  : "border border-slate-200 hover:border-blue-300 hover:shadow-md"
              }`}
            >
              <p
                className={`text-[11px] uppercase font-bold tracking-wider mb-2 text-center border-b pb-2 ${
                  isActive
                    ? "text-blue-600 border-blue-100"
                    : "text-slate-400 border-slate-100"
                }`}
              >
                {horario}
              </p>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Users
                  size={18}
                  className={isActive ? "text-blue-600" : "text-blue-500"}
                />
                <span
                  className={`text-2xl font-black ${
                    isActive ? "text-blue-700" : "text-slate-800"
                  }`}
                >
                  {data.total}
                </span>
              </div>
              <div className="w-full space-y-1.5 mt-auto max-h-32 overflow-y-auto custom-scrollbar">
                {Object.entries(data.details).map(([nombre, cant]) => (
                  <div
                    key={nombre}
                    className={`flex justify-between items-center text-xs px-2 py-1.5 rounded border ${
                      isActive
                        ? "bg-blue-50 border-blue-100"
                        : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <span
                      className="font-medium text-slate-600 truncate pr-2"
                      title={nombre}
                    >
                      {nombre}
                    </span>
                    <span
                      className={`font-black px-1.5 rounded ${
                        isActive
                          ? "text-blue-700 bg-blue-200/50"
                          : "text-slate-800 bg-slate-200/50"
                      }`}
                    >
                      {cant}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div
          onClick={() => setSelectedSchedule(null)}
          className={`bg-gradient-to-br from-blue-600 to-blue-800 p-4 rounded-xl shadow-md flex flex-col text-white cursor-pointer transition-all hover:scale-[1.02] ${
            selectedSchedule === null
              ? "ring-4 ring-blue-400/30 ring-offset-2"
              : "opacity-90 hover:opacity-100"
          }`}
        >
          <p className="text-[11px] uppercase font-bold text-blue-200 tracking-wider mb-2 text-center border-b border-blue-500/50 pb-2">
            Total General
          </p>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Users size={18} className="text-blue-200" />
            <span className="text-3xl font-black text-white">
              {globalSummary.total}
            </span>
          </div>
          <div className="w-full space-y-1.5 mt-auto max-h-32 overflow-y-auto custom-scrollbar">
            {Object.entries(globalSummary.details).map(([nombre, cant]) => (
              <div
                key={nombre}
                className="flex justify-between items-center text-xs bg-blue-900/30 px-2 py-1.5 rounded border border-blue-500/30"
              >
                <span
                  className="font-medium text-blue-100 truncate pr-2"
                  title={nombre}
                >
                  {nombre}
                </span>
                <span className="font-black text-white bg-blue-500/50 px-1.5 rounded">
                  {cant}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 🚀 EL SISTEMA DE PESTAÑAS (TABS) Y BUSCADOR UNIFICADO 🚀 */}
      {/* ===================================================================== */}
      <div className="bg-white p-4 rounded-t-xl border border-slate-200 border-b-0 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* LAS PESTAÑAS */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto border border-slate-200 shrink-0">
          <button
            onClick={() => {
              setActiveTab("TICKETS");
              setPage(1);
            }}
            className={`flex-1 md:flex-none flex justify-center items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === "TICKETS"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Ticket size={18} /> Por Comprador
          </button>

          {eventData?.is_advanced_registration && (
            <button
              onClick={() => {
                setActiveTab("ATTENDEES");
                setPage(1);
              }}
              className={`flex-1 md:flex-none flex justify-center items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === "ATTENDEES"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Contact2 size={18} /> Por Participantes
            </button>
          )}
        </div>

        {/* EL BUSCADOR INTELIGENTE */}
        <div className="relative w-full md:w-1/2 flex-1 md:ml-4">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={
              activeTab === "TICKETS"
                ? "Buscar por Ticket, DNI o Nombre de Comprador..."
                : "Buscar por Cód. Asignado, Nombres, DNI..."
            }
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition font-medium"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        {/* EL CONTADOR */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {selectedSchedule && (
            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-200">
              Horario: {selectedSchedule}
            </span>
          )}
          <div className="text-slate-500 text-sm font-bold flex items-center gap-2">
            <Users size={18} /> {activeTotalCount} Registros
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 🚀 LA TABLA MAESTRA CON LAS SUB-PESTAÑAS DE FORMULARIOS 🚀 */}
      {/* ===================================================================== */}
      <div className="bg-white shadow-sm border border-slate-200 overflow-hidden min-h-[400px] rounded-b-xl border-t-0">
        {/* SUB-PESTAÑAS (Solo visibles cuando estamos en "Por Participantes") */}
        {activeTab === "ATTENDEES" &&
          eventData?.form_schema &&
          eventData.form_schema.length > 0 && (
            <div className="flex gap-2 p-3 bg-indigo-50/50 border-b border-indigo-100 overflow-x-auto custom-scrollbar">
              {eventData.form_schema.map((p: any) => (
                <button
                  key={p.profileName}
                  onClick={() => {
                    setActiveProfileTab(p.profileName);
                    setPage(1);
                  }}
                  className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
                    activeProfileTab === p.profileName
                      ? "bg-indigo-600 text-white shadow-md"
                      : "bg-white text-indigo-400 border border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                  }`}
                >
                  Formulario: {p.profileName}
                </button>
              ))}
            </div>
          )}

        <div className="overflow-x-auto">
          {activeTab === "TICKETS" ? (
            // ======================== TABLA A: COMPRADORES ========================
            <table className="w-full min-w-[900px] text-sm text-left">
              <thead className="bg-slate-800 text-white font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4 whitespace-nowrap">Ticket</th>
                  <th className="p-4 whitespace-nowrap">Fecha</th>
                  <th className="p-4 whitespace-nowrap">Documento</th>
                  <th className="p-4 whitespace-nowrap">Comprador</th>
                  <th className="p-4 text-center whitespace-nowrap">Aforo</th>
                  <th className="p-4 text-center whitespace-nowrap">Pago</th>
                  <th className="p-4 text-center whitespace-nowrap">Estado</th>
                  <th className="p-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-500">
                      Cargando taquilla...
                    </td>
                  </tr>
                ) : paginatedRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400">
                      No hay resultados.
                    </td>
                  </tr>
                ) : (
                  paginatedRegistrations.map((reg) => {
                    const isFull =
                      reg.status === "REDEEMED" ||
                      (reg.redeemed_quantity >= reg.total_quantity &&
                        reg.total_quantity > 0);
                    const isPartial =
                      reg.redeemed_quantity > 0 &&
                      reg.redeemed_quantity < reg.total_quantity;

                    return (
                      <tr
                        key={reg.id}
                        className="hover:bg-slate-50 transition-colors group"
                      >
                        <td className="p-4 font-black text-blue-700 text-[15px] whitespace-nowrap">
                          {reg.ticket_code}
                        </td>
                        <td className="p-4 text-xs text-slate-500 font-medium whitespace-nowrap">
                          {formatDate(reg.created_at)}
                        </td>
                        <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                          {reg.client_doc || "S/N"}
                        </td>
                        <td className="p-4 font-bold text-slate-700 min-w-[180px]">
                          {reg.client_name}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <div className="flex justify-center items-center gap-1">
                            <Users size={14} className="text-slate-400" />
                            <span className="font-bold text-slate-700">
                              {reg.redeemed_quantity || 0}
                            </span>
                            <span className="text-slate-400">/</span>
                            <span className="font-bold text-slate-400">
                              {reg.total_quantity || 1}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          {getPaymentBadge(reg.payment_method)}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          {isFull ? (
                            <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide">
                              Validado
                            </span>
                          ) : isPartial ? (
                            <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border border-orange-200">
                              Incompleto
                            </span>
                          ) : (
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide">
                              Disponible
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right flex justify-end items-center gap-1 whitespace-nowrap">
                          <div className="flex border border-slate-200 rounded-lg overflow-hidden mr-3">
                            <button
                              onClick={() => handlePrint(reg.sale, "ticket_80")}
                              className="bg-white hover:bg-slate-100 text-slate-600 px-2 py-1.5 text-xs font-bold border-r border-slate-200 transition"
                              title="Imprimir Ticket POS"
                            >
                              <Printer size={14} className="inline mr-1" /> 80mm
                            </button>
                            <button
                              onClick={() => handlePrint(reg.sale, "a4")}
                              className="bg-white hover:bg-slate-100 text-slate-600 px-2 py-1.5 text-xs font-bold transition"
                              title="Imprimir en A4"
                            >
                              A4
                            </button>
                          </div>
                          <button
                            onClick={() => setTicketToQR(reg)}
                            className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-full transition mr-1"
                            title="Ver QR"
                          >
                            <QrCode size={20} />
                          </button>
                          <button
                            onClick={() => setSelectedTicket(reg)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
                          >
                            <Eye size={20} />
                          </button>
                          <button
                            onClick={() => {
                              setTicketToRedeem(reg);
                              setItemsToRedeem({});
                            }}
                            disabled={isFull}
                            className={`p-2 rounded-full transition shadow-sm ml-1 ${
                              !isFull
                                ? "bg-white border border-green-200 text-green-600 hover:bg-green-50 hover:scale-110"
                                : "bg-slate-100 text-slate-300 cursor-not-allowed"
                            }`}
                            title="Validar Grupal"
                          >
                            <CheckCircle size={20} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            // ======================== TABLA B: PARTICIPANTES ========================
            <table className="w-full min-w-[900px] text-sm text-left">
              <thead className="bg-indigo-900 text-white font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4 whitespace-nowrap border-r border-indigo-800">
                    Cód. Asignado
                  </th>
                  <th className="p-4 whitespace-nowrap border-r border-indigo-800">
                    Categoría
                  </th>
                  {dynamicColumns.map((col: string) => (
                    <th key={col} className="p-4 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                  <th className="p-4 whitespace-nowrap text-center border-l border-indigo-800">
                    Ticket Maestro
                  </th>
                  <th className="p-4 whitespace-nowrap text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={dynamicColumns.length + 4}
                      className="p-10 text-center text-slate-500"
                    >
                      Analizando formularios...
                    </td>
                  </tr>
                ) : paginatedAttendees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={dynamicColumns.length + 4}
                      className="p-10 text-center text-slate-400"
                    >
                      No hay participantes en este formulario.
                    </td>
                  </tr>
                ) : (
                  paginatedAttendees.map((att, idx) => {
                    const parent = att._parentTicket;
                    // SOLO comprobamos si esta persona exacta ya fue validada mediante el atributo _valido
                    const isIndividualRedeemed = att["_valido"] === true;

                    return (
                      <tr
                        key={idx}
                        className="hover:bg-indigo-50/30 transition-colors"
                      >
                        <td className="p-4 font-black text-indigo-700 text-base whitespace-nowrap border-r border-slate-50">
                          {att["N° ASIGNADO"] ||
                            att["N° DORSAL / ASIGNADO"] ||
                            att["N° DORSAL"] ||
                            "-"}
                        </td>
                        <td className="p-4 border-r border-slate-50">
                          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest">
                            {att.categoria_elegida || "Gen"}
                          </span>
                        </td>
                        {dynamicColumns.map((col: string) => (
                          <td
                            key={col}
                            className="p-4 text-slate-700 font-semibold whitespace-nowrap"
                          >
                            {att[col] ? (
                              String(att[col])
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        ))}
                        <td className="p-4 text-center font-mono text-[11px] text-slate-400 border-l border-slate-50">
                          {parent.ticket_code}
                        </td>
                        <td className="p-4 text-right">
                          {/* EL BOTÓN DE VALIDACIÓN INDIVIDUAL (ONE-CLICK) */}
                          <button
                            onClick={() =>
                              handleSingleRedeem(
                                parent,
                                att.producto_comprado,
                                att._originalIndex,
                              )
                            }
                            disabled={isIndividualRedeemed || isRedeeming}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 ml-auto transition-all ${
                              !isIndividualRedeemed
                                ? "bg-green-100 text-green-700 hover:bg-green-200 shadow-sm active:scale-95"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            <CheckCircle size={14} />{" "}
                            {isIndividualRedeemed
                              ? "Validado"
                              : "Validar Acceso"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(activeTotalCount / pageSize)}
        totalCount={activeTotalCount}
        pageSize={pageSize}
        loading={loading}
        onPageChange={(newPage) => setPage(newPage)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      {/* 👇 MODALES DE LA VISTA GENERAL 👇 */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4 shrink-0">
              <h3 className="text-2xl font-black text-slate-800 tracking-widest">
                {selectedTicket.ticket_code}
              </h3>
              <button
                onClick={() => setSelectedTicket(null)}
                className="bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1 pr-1">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-5">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1.5">
                  <UserCheck size={12} /> Comprador / Titular
                </p>
                <p className="font-black text-slate-700 text-lg">
                  {selectedTicket.client_name}
                </p>
                {selectedTicket.client_doc && (
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    Doc: {selectedTicket.client_doc}
                  </p>
                )}
              </div>

              {selectedTicket.attendee_data &&
                selectedTicket.attendee_data.length > 0 && (
                  <div className="mb-5 space-y-3">
                    <p className="text-[11px] uppercase font-black text-indigo-500 mb-2 border-b border-indigo-100 pb-1">
                      Participantes Registrados (
                      {selectedTicket.attendee_data.length})
                    </p>
                    {selectedTicket.attendee_data.map((attendee, idx) => (
                      <div
                        key={idx}
                        className="bg-indigo-50/50 border border-indigo-100 p-3.5 rounded-xl shadow-sm"
                      >
                        <div className="flex justify-between items-center border-b border-indigo-100 pb-2 mb-2">
                          <p className="text-xs font-black text-indigo-900 leading-tight pr-2">
                            {attendee.producto_comprado ||
                              `Participante ${idx + 1}`}
                          </p>
                          {attendee.categoria_elegida && (
                            <span className="text-[9px] bg-indigo-200 text-indigo-800 font-bold px-1.5 py-0.5 rounded uppercase shrink-0">
                              {attendee.categoria_elegida}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
                          {Object.entries(attendee).map(([key, val]) => {
                            if (
                              key === "producto_comprado" ||
                              key === "categoria_elegida" ||
                              key === "perfil_aplicado" ||
                              key === "id" ||
                              key === "_parentTicket" ||
                              key === "N° DORSAL" ||
                              key === "N° DORSAL / ASIGNADO" ||
                              key === "N° ASIGNADO" ||
                              key === "_valido" ||
                              key === "_originalIndex"
                            )
                              return null;
                            return (
                              <div key={key} className="flex flex-col">
                                <span className="text-[9px] uppercase font-bold text-indigo-400">
                                  {key}
                                </span>
                                <span
                                  className="font-semibold text-slate-700 text-xs line-clamp-2"
                                  title={String(val)}
                                >
                                  {String(val)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              {selectedTicket.ticket_details &&
                selectedTicket.ticket_details.length > 0 && (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left mb-2">
                    <p className="text-[11px] uppercase font-black text-blue-500 mb-3 border-b border-blue-200/50 pb-2">
                      Resumen de Accesos Físicos
                    </p>
                    {selectedTicket.ticket_details.map((det, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-xs mb-3 last:mb-0 items-center"
                      >
                        <span className="font-bold text-blue-900 pr-2">
                          {det.product_name}
                        </span>
                        <div className="flex gap-2 shrink-0">
                          <span
                            className="text-green-700 bg-green-200/60 font-bold px-2 py-0.5 rounded flex items-center gap-1"
                            title="Ya ingresaron"
                          >
                            ✓ {det.redeemed}
                          </span>
                          <span
                            className="text-slate-600 bg-white border border-slate-200 font-bold px-2 py-0.5 rounded flex items-center gap-1"
                            title="Faltan ingresar"
                          >
                            ⏳ {det.available}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="pt-4 border-t border-slate-100 mt-2 shrink-0">
              <button
                onClick={() => setSelectedTicket(null)}
                className="w-full bg-slate-900 text-white hover:bg-black transition-colors font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.98]"
              >
                Cerrar Detalles
              </button>
            </div>
          </div>
        </div>
      )}

      {ticketToQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 flex flex-col">
            <div className="p-6 sm:p-8 flex flex-col items-center">
              <h2 className="text-2xl font-black text-slate-800 tracking-widest uppercase">
                Ludicus Park
              </h2>
              <p className="text-sm font-bold text-slate-500 mb-6">
                Tu pase digital
              </p>
              <div
                ref={qrRef}
                className="bg-white p-3 rounded-2xl shadow-lg border border-slate-100 mb-4"
              >
                <QRCodeSVG
                  value={ticketToQR.ticket_code}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center mb-8 font-semibold tracking-wide uppercase px-4">
                Presenta este código al momento de ingresar
              </p>
              <div className="w-full flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setTicketToQR(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleDownloadQR}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 transition shadow-md shadow-blue-200"
                >
                  <Download size={18} /> Guardar QR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ticketToRedeem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 text-center max-h-[90vh] flex flex-col">
            <div className="shrink-0">
              <AlertTriangle
                size={32}
                className="text-orange-500 mx-auto mb-4"
              />
              <h3 className="text-xl font-black mb-1">
                {ticketToRedeem.ticket_code}
              </h3>
              <p className="text-sm text-slate-500 font-medium mb-4">
                Titular: {ticketToRedeem.client_name}
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200 overflow-y-auto custom-scrollbar text-left flex-1">
              <p className="text-xs font-bold text-slate-400 uppercase mb-3 text-center">
                Selecciona quién ingresa ahora
              </p>

              {ticketToRedeem.ticket_details?.map((det) => {
                if (det.available <= 0) {
                  return (
                    <div
                      key={det.product_id}
                      className="flex justify-between items-center py-2 border-b border-slate-100 opacity-50"
                    >
                      <div>
                        <p className="font-bold text-slate-600 text-sm">
                          {det.product_name}
                        </p>
                        <p className="text-[10px] text-green-600">
                          Ya ingresaron todos ({det.quantity})
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-1 rounded">
                        Agotado
                      </span>
                    </div>
                  );
                }

                const currentQty = itemsToRedeem[det.product_id] || 0;

                return (
                  <div
                    key={det.product_id}
                    className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0"
                  >
                    <div className="flex-1 pr-2">
                      <p className="font-bold text-slate-800 text-sm leading-tight">
                        {det.product_name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Quedan:{" "}
                        <span className="font-bold text-blue-500">
                          {det.available}
                        </span>{" "}
                        por ingresar
                      </p>
                    </div>
                    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-1 shrink-0 shadow-sm">
                      <button
                        onClick={() =>
                          handleQuantityChange(
                            det.product_id,
                            -1,
                            det.available,
                          )
                        }
                        className="w-8 h-8 rounded text-slate-500 hover:bg-slate-100 font-bold"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-black text-slate-800">
                        {currentQty}
                      </span>
                      <button
                        onClick={() =>
                          handleQuantityChange(det.product_id, 1, det.available)
                        }
                        className="w-8 h-8 rounded text-blue-600 hover:bg-blue-50 font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 shrink-0">
              <button
                onClick={() => setTicketToRedeem(null)}
                className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={executeRedeem}
                disabled={isRedeeming}
                className="flex-1 bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle size={18} /> Confirmar Validación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventTaquillaPage;
