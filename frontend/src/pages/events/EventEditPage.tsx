import {
    ArrowLeft,
    CalendarDays,
    Clock,
    FileBox,
    LayoutList,
    ListPlus,
    Loader2,
    Plus,
    Save,
    Settings2,
    Tag,
    Trash2,
    Type,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";

const EventEditPage = () => {
  const navigate = useNavigate();
  const { eventId } = useParams(); // Extraemos el ID de la URL
  const { currentBranch } = useBranch();

  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados Generales
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  // Estados Modo Clásico (Turnos)
  const [hasSchedule, setHasSchedule] = useState(false);
  const [schedules, setSchedules] = useState<string[]>([""]);

  // Estados Modo Avanzado (Perfiles de Formularios)
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [formProfiles, setFormProfiles] = useState<any[]>([]);

  // 👇 LÓGICA DE CARGA INICIAL 👇
  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await api.get(`/events/events/${eventId}/`);
        const ev = res.data;

        setName(ev.name || "");
        setDate(ev.date || "");

        // Rellenar horarios si los tiene
        setHasSchedule(ev.has_specific_schedule);
        if (ev.has_specific_schedule && ev.available_schedules) {
          setSchedules(
            ev.available_schedules.length > 0 ? ev.available_schedules : [""],
          );
        }

        // Rellenar perfiles avanzados si los tiene
        setIsAdvanced(ev.is_advanced_registration);
        if (ev.is_advanced_registration && ev.form_schema) {
          setFormProfiles(ev.form_schema);
        }
      } catch (error) {
        toast.error("Error al cargar los datos del evento.");
        navigate("/events"); // Sacarlo de ahí si hay error
      } finally {
        setInitialLoading(false);
      }
    };
    fetchEvent();
  }, [eventId, navigate]);

  // ---- Funciones Modo Clásico ----
  const addScheduleBlock = () => setSchedules([...schedules, ""]);
  const updateSchedule = (index: number, value: string) => {
    const newSchedules = [...schedules];
    newSchedules[index] = value;
    setSchedules(newSchedules);
  };
  const removeSchedule = (index: number) => {
    setSchedules(schedules.filter((_: any, i: number) => i !== index));
  };

  // ---- Funciones Modo Avanzado ----
  const addProfile = () => {
    setFormProfiles([
      ...formProfiles,
      {
        id: Date.now().toString(),
        profileName: "",
        keywords: "",
        fields: [],
      },
    ]);
  };

  const updateProfile = (index: number, key: string, value: string) => {
    const newProfiles = [...formProfiles];
    newProfiles[index][key] = value;
    setFormProfiles(newProfiles);
  };

  const removeProfile = (index: number) => {
    setFormProfiles(formProfiles.filter((_: any, i: number) => i !== index));
  };

  const addFieldToProfile = (profileIndex: number) => {
    const newProfiles = [...formProfiles];
    newProfiles[profileIndex].fields.push({
      id: Date.now().toString() + Math.random(),
      label: "",
      type: "text",
      options: "",
      required: true,
    });
    setFormProfiles(newProfiles);
  };

  const updateField = (
    profileIndex: number,
    fieldIndex: number,
    key: string,
    value: any,
  ) => {
    const newProfiles = [...formProfiles];
    newProfiles[profileIndex].fields[fieldIndex][key] = value;
    setFormProfiles(newProfiles);
  };

  const removeField = (profileIndex: number, fieldIndex: number) => {
    const newProfiles = [...formProfiles];
    newProfiles[profileIndex].fields = newProfiles[profileIndex].fields.filter(
      (_: any, i: number) => i !== fieldIndex,
    );
    setFormProfiles(newProfiles);
  };

  // ---- Enviar ACTUALIZACIÓN a la Base de Datos ----
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch) return toast.error("Selecciona una sede primero.");
    if (!name.trim())
      return toast.error("El nombre del evento es obligatorio.");

    const cleanSchedules = schedules.filter((s) => s.trim() !== "");
    if (hasSchedule && cleanSchedules.length === 0) {
      return toast.error("Debes agregar al menos un horario.");
    }

    if (isAdvanced) {
      if (formProfiles.length === 0)
        return toast.error("Debes agregar al menos un Perfil de Formulario.");
      for (const profile of formProfiles) {
        if (!profile.profileName.trim())
          return toast.error("Todos los perfiles deben tener un Nombre.");
        if (!profile.keywords.trim())
          return toast.error(
            `El perfil "${profile.profileName}" necesita palabras clave.`,
          );
        if (profile.fields.length === 0)
          return toast.error(
            `El perfil "${profile.profileName}" no tiene preguntas.`,
          );
        for (const field of profile.fields) {
          if (!field.label.trim())
            return toast.error(
              `Falta el título de una pregunta en "${profile.profileName}".`,
            );
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        branch: currentBranch.id,
        name: name,
        date: date || null,

        has_specific_schedule: hasSchedule,
        available_schedules: hasSchedule ? cleanSchedules : [],

        is_advanced_registration: isAdvanced,
        form_schema: isAdvanced ? formProfiles : [],
      };

      // 👇 Usamos PATCH o PUT para actualizar 👇
      await api.patch(`/events/events/${eventId}/`, payload);
      toast.success("¡Evento actualizado con éxito!");
      navigate("/events");
    } catch (error: any) {
      toast.error(
        error.response?.data?.error || "Error al actualizar el evento.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 gap-4">
        <Loader2 size={40} className="animate-spin text-blue-500" />
        <p className="font-bold tracking-widest uppercase text-sm">
          Cargando datos del evento...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-in fade-in duration-500 mb-20">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate("/events")}
          className="p-2 hover:bg-slate-200 rounded-full transition text-slate-600"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            Editar Evento
          </h1>
          <p className="text-slate-500 font-medium">
            Modificando: <strong className="text-blue-600">{name}</strong>
          </p>
        </div>
      </div>

      <form onSubmit={handleUpdate} className="space-y-6">
        {/* BLOQUE 1: DATOS BÁSICOS */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Type size={16} className="text-blue-500" /> Nombre del Evento *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Carrera 5K Aniversario"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition text-slate-700 font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <CalendarDays size={16} className="text-purple-500" /> Fecha del
                Evento
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition text-slate-700 font-medium"
              />
            </div>
          </div>
        </div>

        {/* BLOQUE 2: MODO CLÁSICO */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              className="w-5 h-5 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
              checked={hasSchedule}
              onChange={(e) => setHasSchedule(e.target.checked)}
            />
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Clock size={18} className="text-orange-500" />
              ¿Este evento tiene horarios específicos? (Turnos)
            </span>
          </label>
          {hasSchedule && (
            <div className="bg-orange-50 border border-orange-100 p-5 rounded-xl animate-in slide-in-from-top-2">
              <div className="space-y-3">
                {schedules.map((schedule, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="bg-white px-3 py-2 border border-orange-200 rounded-lg text-sm font-bold text-orange-400 w-8 text-center">
                      {index + 1}
                    </div>
                    <input
                      type="text"
                      placeholder="Ej: 10:00 AM - 12:00 PM"
                      value={schedule}
                      onChange={(e) => updateSchedule(index, e.target.value)}
                      className="flex-1 p-2 border border-orange-200 rounded-lg outline-none focus:border-orange-500 text-sm font-medium"
                    />
                    {schedules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSchedule(index)}
                        className="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addScheduleBlock}
                className="mt-4 flex items-center gap-2 text-sm font-bold text-orange-600 hover:text-orange-800 transition bg-white px-4 py-2 rounded-lg border border-orange-200 shadow-sm"
              >
                <Plus size={16} /> Añadir otro turno
              </button>
            </div>
          )}
        </div>

        {/* BLOQUE 3: MODO AVANZADO */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              checked={isAdvanced}
              onChange={(e) => setIsAdvanced(e.target.checked)}
            />
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Settings2 size={18} className="text-indigo-500" />
              Activar Múltiples Formularios por Categoría (Carreras, VIP, etc.)
            </span>
          </label>

          {isAdvanced && (
            <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-xl animate-in slide-in-from-top-2 space-y-6">
              {formProfiles.length === 0 ? (
                <div className="text-center p-8 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-500 text-sm font-medium bg-white">
                  <FileBox size={40} className="mx-auto mb-3 opacity-50" />
                  Crea perfiles de formulario según lo que vayas a vender.
                </div>
              ) : (
                formProfiles.map((profile, pIndex) => (
                  <div
                    key={profile.id}
                    className="bg-white border-2 border-indigo-200 rounded-2xl overflow-hidden shadow-sm"
                  >
                    {/* CABECERA DEL PERFIL */}
                    <div className="bg-indigo-100/50 p-4 border-b border-indigo-200 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                      <div className="flex-1 w-full space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="bg-indigo-500 text-white font-black px-3 py-1 rounded-lg text-sm">
                            PERFIL {pIndex + 1}
                          </span>
                          <input
                            type="text"
                            placeholder="Nombre del Perfil (Ej: Formulario Adultos)"
                            value={profile.profileName}
                            onChange={(e) =>
                              updateProfile(
                                pIndex,
                                "profileName",
                                e.target.value,
                              )
                            }
                            className="flex-1 bg-transparent border-b border-indigo-300 focus:border-indigo-600 outline-none font-bold text-indigo-900 placeholder:text-indigo-400"
                          />
                        </div>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-indigo-200">
                            <Tag
                              size={16}
                              className="text-indigo-400 shrink-0"
                            />
                            <input
                              type="text"
                              placeholder="Palabras Clave (Ej: Baby, Kids, Junior) - Separadas por coma"
                              value={profile.keywords}
                              onChange={(e) =>
                                updateProfile(
                                  pIndex,
                                  "keywords",
                                  e.target.value,
                                )
                              }
                              className="flex-1 outline-none text-sm font-medium text-slate-700"
                            />
                          </div>

                          {/* 👇 NUEVO: MAPA DE CONTADORES POR CATEGORÍA 👇 */}
                          {profile.keywords &&
                            profile.keywords.trim() !== "" && (
                              <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">
                                <p className="text-[10px] font-black uppercase text-indigo-500 mb-2">
                                  Numeración inicial por categoría:
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {profile.keywords
                                    .split(",")
                                    .map((k: string) => k.trim())
                                    .filter((k: string) => k !== "")
                                    .map((keyword: string, kIdx: number) => (
                                      <div
                                        key={kIdx}
                                        className="flex items-center gap-2 bg-white border border-slate-200 px-2 py-1.5 rounded-md shadow-sm"
                                      >
                                        <span
                                          className="text-[11px] font-bold text-slate-600 truncate flex-1"
                                          title={keyword}
                                        >
                                          {keyword}
                                        </span>
                                        <span className="text-slate-400 font-bold">
                                          #
                                        </span>
                                        <input
                                          type="number"
                                          placeholder="Ej: 1000"
                                          value={
                                            profile.categoryCodes?.[keyword] ||
                                            ""
                                          }
                                          onChange={(e) => {
                                            const newProfiles = [
                                              ...formProfiles,
                                            ];
                                            if (
                                              !newProfiles[pIndex].categoryCodes
                                            )
                                              newProfiles[
                                                pIndex
                                              ].categoryCodes = {};
                                            newProfiles[pIndex].categoryCodes[
                                              keyword
                                            ] = e.target.value;
                                            setFormProfiles(newProfiles);
                                          }}
                                          className="w-14 outline-none text-xs text-right bg-transparent font-black text-indigo-600 placeholder:font-normal placeholder:text-slate-300"
                                        />
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProfile(pIndex)}
                        className="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg shrink-0 transition"
                        title="Eliminar Perfil completo"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    {/* PREGUNTAS DEL PERFIL */}
                    <div className="p-5 space-y-4">
                      {profile.fields.length === 0 ? (
                        <p className="text-xs text-center text-slate-400 font-bold uppercase py-2">
                          No hay preguntas en este perfil
                        </p>
                      ) : (
                        profile.fields.map((field: any, fIndex: number) => (
                          <div
                            key={field.id}
                            className="bg-slate-50 p-3 border border-slate-200 rounded-xl flex flex-col gap-3"
                          >
                            {/* FILA PRINCIPAL (Pregunta, Tipo, Acciones) */}
                            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                              <div className="flex-1 w-full">
                                <input
                                  type="text"
                                  placeholder="Pregunta (Ej: NOMBRES)"
                                  value={field.label}
                                  onChange={(e) =>
                                    updateField(
                                      pIndex,
                                      fIndex,
                                      "label",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-400 text-sm font-bold text-slate-700"
                                />
                              </div>
                              <div className="w-full md:w-40 shrink-0">
                                <select
                                  value={field.type}
                                  onChange={(e) =>
                                    updateField(
                                      pIndex,
                                      fIndex,
                                      "type",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-400 text-sm font-medium text-slate-700 bg-white cursor-pointer"
                                >
                                  <option value="text">Texto Corto</option>
                                  <option value="number">Número</option>
                                  <option value="select">Lista Opciones</option>
                                  <option value="checkbox">
                                    Casilla (Sí/No)
                                  </option>
                                  <option value="date">Fecha</option>
                                </select>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) =>
                                      updateField(
                                        pIndex,
                                        fIndex,
                                        "required",
                                        e.target.checked,
                                      )
                                    }
                                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                                  />{" "}
                                  Obligatorio
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeField(pIndex, fIndex)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 rounded-lg transition"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>

                            {/* FILA SECUNDARIA (Solo para Opciones de Select) */}
                            {field.type === "select" && (
                              <div className="w-full bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-200 shadow-inner flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-white border border-indigo-100 px-2 py-1 rounded shadow-sm">
                                  Opciones
                                </span>
                                <input
                                  type="text"
                                  placeholder="Ej: S, M, L, XL (separadas por coma)"
                                  value={field.options}
                                  onChange={(e) =>
                                    updateField(
                                      pIndex,
                                      fIndex,
                                      "options",
                                      e.target.value,
                                    )
                                  }
                                  className="flex-1 text-sm outline-none text-slate-700 font-bold bg-transparent placeholder:font-medium placeholder:text-slate-400"
                                />
                              </div>
                            )}
                          </div>
                        ))
                      )}

                      <button
                        type="button"
                        onClick={() => addFieldToProfile(pIndex)}
                        className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition"
                      >
                        <ListPlus size={16} /> Añadir pregunta
                      </button>
                    </div>
                  </div>
                ))
              )}

              <button
                type="button"
                onClick={addProfile}
                className="mt-4 w-full flex justify-center items-center gap-2 text-sm font-black text-white bg-indigo-500 hover:bg-indigo-600 py-3 rounded-xl shadow-md transition"
              >
                <LayoutList size={18} /> AÑADIR NUEVO PERFIL
              </button>
            </div>
          )}
        </div>

        {/* BOTÓN GUARDAR */}
        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 rounded-xl font-black tracking-wider transition disabled:opacity-50 shadow-md flex items-center gap-2 text-lg"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <Save size={24} />
            )}
            {saving ? "ACTUALIZANDO..." : "ACTUALIZAR EVENTO"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EventEditPage;
