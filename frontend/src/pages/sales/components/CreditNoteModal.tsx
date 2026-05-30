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
  const [step, setStep] = useState<"FORM" | "PIN">("FORM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos del formulario
  const [motivo, setMotivo] = useState("01 - ANULACION DE LA OPERACION");
  const [detalle, setDetalle] = useState("ANULACION DE LA OPERACION");

  // Datos del PIN
  const [supervisorPin, setSupervisorPin] = useState("");

  const { user } = useAuth();

  const canAuthorize =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.is_superuser;

  if (!open) return null;

  const handleFirstSubmit = () => {
    // Evitar doble clic si ya está cargando
    if (loading) return;

    if (canAuthorize) {
      submitVoid();
    } else {
      setStep("PIN");
    }
  };

  const submitVoid = async () => {
    setLoading(true);
    setError(null);

    try {
      await api.post("/sales/credit-notes/", {
        sale: saleId,
        description: detalle,
        supervisor_pin: supervisorPin || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error || "Ocurrió un error al anular.";
      setError(errorMsg);
      setSupervisorPin("");
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
            disabled={loading} // 👇 Bloqueamos la "X" mientras carga
            className="text-slate-400 hover:text-slate-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENIDO */}
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
                  disabled={loading} // 👇 Bloqueamos inputs
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
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
                  disabled={loading} // 👇 Bloqueamos inputs
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:bg-slate-100"
                  placeholder="Escribe un detalle breve para el XML de SUNAT"
                />
              </div>
            </div>
          ) : (
            <div
              className={`animate-in slide-in-from-right-4 duration-300 ${loading ? "pointer-events-none opacity-50" : ""}`}
            >
              <div>
                <PinPad
                  pin={supervisorPin}
                  setPin={setSupervisorPin}
                  onSubmit={submitVoid}
                  maxLength={6}
                  title="Autorización de Gerencia"
                  subtitle={`Ingresa el PIN para anular la venta ${saleSeries}`}
                />
              </div>
            </div>
          )}
        </div>

        {/* FOOTER (Solo se muestra en el paso FORM) */}
        {step === "FORM" && (
          <div className="px-4 py-3 bg-slate-50 border-t flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={loading} // 👇 Bloqueamos Cancelar
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              onClick={handleFirstSubmit}
              disabled={loading} // 👇 El bloqueo maestro contra el doble clic
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[200px]"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  PROCESANDO...
                </>
              ) : (
                "CONFIRMAR ANULACIÓN"
              )}
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
              disabled={loading} // 👇 Bloqueamos el botón de volver
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition disabled:opacity-50"
            >
              {loading
                ? "Generando Nota de Crédito..."
                : "← Volver al formulario"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditNoteModal;
