import { Building2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useBranch } from "../../context/BranchContext";

const BranchSelector = () => {
  const { user } = useAuth();
  const { branches, currentBranch, setCurrentBranch, isLoading } = useBranch();

  if (!user) return null;

  // 1. LÓGICA DE VISIBILIDAD: ¿Es un "Super Admin" que puede viajar entre sedes?
  // (Debe ser ADMIN/Superuser Y NO tener una sede forzada en su perfil)
  const isGlobalAdmin =
    (user.role === "ADMIN" ||
      (user.role as string) === "Administrador" || // Compatibilidad con tu bug anterior
      user.is_superuser) &&
    !user.branch_id;

  // 🔒 CASO 1: MODO SOLO LECTURA (Empleados o Admins de Sede Fija)
  // Mostramos un diseño grisáceo para indicar que no se puede cambiar.
  if (!isGlobalAdmin) {
    return (
      <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-3 select-none">
        <div className="bg-slate-200 p-1.5 rounded-md">
          <Building2 size={16} className="text-slate-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">
            Tu Sede
          </span>
          <span className="text-sm font-bold text-slate-700 leading-none">
            {currentBranch?.name || "Cargando..."}
          </span>
        </div>
      </div>
    );
  }

  // 🔓 CASO 2: MODO EDITOR (Admin Global)
  // Mostramos el Select en fondo blanco y con sombra.
  return (
    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm animate-in fade-in ring-1 ring-transparent focus-within:ring-blue-500 transition-all">
      <Building2 size={18} className="text-blue-600" />

      {isLoading ? (
        <span className="text-xs text-slate-400 px-2">Cargando sedes...</span>
      ) : (
        <select
          className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer min-w-[140px] py-1"
          value={currentBranch?.id || ""}
          onChange={(e) => {
            const selected = branches.find(
              (b) => b.id === Number(e.target.value),
            );
            if (selected) setCurrentBranch(selected);
          }}
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default BranchSelector;
