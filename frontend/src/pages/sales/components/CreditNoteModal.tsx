import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import api from "../../../api/axios";
import PinPad from "../../../components/common/PinPad";
import { useAuth } from "../../../context/AuthContext";

interface CreditNoteModalProps {
  open: boolean;
  saleId: number;
  saleSeries: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CreditNoteModal = ({
  open,
  saleId,
  saleSeries,
  onClose,
  onSuccess,
}: CreditNoteModalProps) => {
  // --- ESTADOS ---
  const [step, setStep] = useState<"FORM" | "PIN">("FORM"); // Controla si vemos el formulario o el teclado
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos del formulario
  const [motivo, setMotivo] = useState("01 - ANULACION DE LA OPERACION");
  const [detalle, setDetalle] = useState("ANULACION DE LA OPERACION");

  // Datos del PIN
  const [supervisorPin, setSupervisorPin] = useState("");

  // Sacamos al usuario actual
  const { user } = useAuth();

  // Verificamos si tiene permisos de jefe
  const canAuthorize =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  if (!open) return null;

  // --- PASO 1: Cuando el cajero le da a "Confirmar Anulación" ---
  const handleFirstSubmit = () => {
    if (canAuthorize) {
      submitVoid(); // Si es Admin, anula directo
    } else {
      setStep("PIN"); // Si es Cajero, le pedimos el PIN al gerente
    }
  };

  // --- PASO 2: Enviar al Backend ---
  const submitVoid = async () => {
    setLoading(true);
    setError(null);

    try {
      // Mandamos los datos, incluyendo el PIN del supervisor si fue necesario
      await api.post("/sales/credit-notes/", {
        sale: saleId,
        description: detalle,
        supervisor_pin: supervisorPin || undefined, // 👈 El pase mágico de seguridad
      });

      onSuccess(); // Recarga la tabla
      onClose(); // Cierra el modal
    } catch (err: any) {
      // Si el backend rechaza el PIN, mostramos el error
      const errorMsg =
        err.response?.data?.error || "Ocurrió un error al anular.";
      setError(errorMsg);
      setSupervisorPin(""); // Limpiamos el PIN equivocado
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
          <h2 className="font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle size={18} />
            ANULAR VENTA: {saleSeries}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENIDO (Cambia entre FORM y PIN) */}
        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg font-medium text-center animate-in shake">
              ⚠️ {error}
            </div>
          )}

          {step === "FORM" ? (
            <div className="space-y-4">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800 flex gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>
                  <strong>Acción Irreversible:</strong> Al confirmar, los
                  productos volverán al almacén y el dinero se descontará de tu
                  caja actual.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Motivo SUNAT
                </label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option>01 - ANULACION DE LA OPERACION</option>
                  <option>02 - ANULACION POR ERROR EN EL RUC</option>
                  <option>06 - DEVOLUCION TOTAL</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Sustento / Detalle
                </label>
                <textarea
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Escribe un detalle breve para el XML de SUNAT"
                />
              </div>
            </div>
          ) : (
            // 👇 AQUÍ APARECE EL TECLADO SI ES CAJERO
            <div className="animate-in slide-in-from-right-4 duration-300">
              <PinPad
                pin={supervisorPin}
                setPin={setSupervisorPin}
                onSubmit={submitVoid}
                maxLength={6}
                title="Autorización de Gerencia"
                subtitle={`Ingresa el PIN para anular la venta ${saleSeries}`}
              />
            </div>
          )}
        </div>

        {/* FOOTER (Solo se muestra en el paso FORM) */}
        {step === "FORM" && (
          <div className="px-4 py-3 bg-slate-50 border-t flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition"
            >
              CANCELAR
            </button>
            <button
              onClick={handleFirstSubmit}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition"
            >
              CONFIRMAR ANULACIÓN
            </button>
          </div>
        )}

        {/* FOOTER DEL PINPAD (Botón para volver atrás) */}
        {step === "PIN" && (
          <div className="px-4 py-3 bg-slate-50 border-t flex justify-center">
            <button
              onClick={() => {
                setStep("FORM");
                setError(null);
                setSupervisorPin("");
              }}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition"
            >
              {loading ? "Procesando..." : "← Volver al formulario"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditNoteModal;
