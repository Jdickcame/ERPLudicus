import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Option {
  value: string | number;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string | number | null; // Acepta null también
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  label?: string; // Agregado para compatibilidad con tu código
  disabled?: boolean; // Agregado para compatibilidad
  className?: string;
}

const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  label,
  disabled = false,
  className = "",
}: SearchableSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Encontrar la opción seleccionada actualmente
  // Usamos == para que coincida "5" string con 5 number si fuera necesario
  const selectedOption = options.find((opt) => opt.value == value);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        // Si cerramos y no hay nada seleccionado, limpiamos el buscador
        if (!selectedOption) {
          setSearchTerm("");
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedOption]);

  // Manejar selección
  const handleSelect = (option: Option) => {
    onChange(option.value);
    setIsOpen(false);
    setSearchTerm(""); // Limpiamos el buscador al seleccionar
  };

  // Manejar limpieza (botón X)
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar problemas de eventos
    onChange(null); // Enviamos null o "" al padre
    setSearchTerm("");
    setIsOpen(true); // Mantenemos abierto para que escriba de inmediato
  };

  // Filtrar opciones
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {label && (
        <label className="text-sm font-semibold text-slate-600 mb-1 block">
          {label}
        </label>
      )}

      {/* CAJA PRINCIPAL (Input o Display) */}
      <div
        className={`flex items-center justify-between w-full border rounded-lg px-3 py-2 bg-white transition-all cursor-pointer ${
          disabled ? "bg-slate-100 cursor-not-allowed opacity-70" : "bg-white"
        } ${
          isOpen && !disabled
            ? "ring-2 ring-blue-100 border-blue-400"
            : "border-slate-300 hover:border-slate-400"
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {selectedOption ? (
          // MODO 1: VISUALIZACIÓN (Ya hay algo seleccionado)
          // Muestra texto plano, no un input. No hay que borrar letras.
          <span
            className={`text-sm font-medium truncate flex-1 ${selectedOption.value === "" ? "text-slate-400 italic" : "text-slate-700"}`}
          >
            {selectedOption.label}
          </span>
        ) : (
          // MODO 2: BÚSQUEDA (Input real)
          // Solo aparece cuando está vacío, listo para escribir.
          <div className="flex items-center gap-2 w-full">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              type="text"
              className="w-full outline-none text-sm text-slate-700 placeholder:text-slate-400 bg-transparent"
              placeholder={placeholder}
              value={searchTerm}
              disabled={disabled}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus={isOpen} // Enfoca automáticamente al abrir
            />
          </div>
        )}

        {/* CONTROLES DERECHA */}
        <div className="flex items-center gap-1 ml-2">
          {/* BOTÓN X: Solo aparece si hay selección y no está disabled */}
          {selectedOption && !disabled && (
            <button
              onClick={handleClear}
              type="button"
              className="p-1 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition z-10"
              title="Limpiar selección"
            >
              <X size={14} />
            </button>
          )}

          {/* FLECHA */}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      {/* LISTA DESPLEGABLE */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={opt.value}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${
                  opt.value == value
                    ? "bg-blue-50 text-blue-700 font-bold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
                onClick={() => handleSelect(opt)}
              >
                {opt.label}
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-xs text-slate-400 italic">
              No se encontraron coincidencias
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
