import { Check, Delete } from "lucide-react";

interface PinPadProps {
  pin: string;
  setPin: (pin: string) => void;
  onSubmit: () => void;
  maxLength?: number;
  title?: string;
  subtitle?: string;
}

const PinPad = ({
  pin,
  setPin,
  onSubmit,
  maxLength = 6,
  title = "Autorización Requerida",
  subtitle = "Ingrese PIN de Supervisor",
}: PinPadProps) => {
  const handlePress = (num: string) => {
    if (pin.length < maxLength) {
      setPin(pin + num);
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto p-4 select-none">
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      {/* 👇 MODIFICADO: Puntos dinámicos que aparecen al digitar */}
      <div className="w-full flex justify-center items-center gap-3 mb-8 min-h-[1.5rem]">
        {pin.length === 0 ? (
          <span className="text-slate-400 text-sm italic animate-in fade-in">
            Esperando PIN...
          </span>
        ) : (
          pin
            .split("")
            .map((_, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full bg-blue-600 shadow-sm animate-in zoom-in duration-100"
              />
            ))
        )}
      </div>

      {/* Teclado Numérico */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handlePress(num.toString())}
            className="h-16 text-2xl font-semibold bg-slate-50 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-colors text-slate-700 shadow-sm border border-slate-200"
          >
            {num}
          </button>
        ))}

        <button
          type="button"
          onClick={handleDelete}
          className="h-16 flex items-center justify-center bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-xl transition-colors text-red-600 border border-red-200"
        >
          <Delete size={28} />
        </button>

        <button
          type="button"
          onClick={() => handlePress("0")}
          className="h-16 text-2xl font-semibold bg-slate-50 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-colors text-slate-700 shadow-sm border border-slate-200"
        >
          0
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={pin.length < 4} // Requiere al menos 4 dígitos para habilitarse
          className="h-16 flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-colors text-white shadow-md"
        >
          <Check size={32} />
        </button>
      </div>
    </div>
  );
};

export default PinPad;
