import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";
import type { Branch } from "../types"; // Import con 'type'
import { useAuth } from "./AuthContext";

interface BranchContextType {
  branches: Branch[];
  currentBranch: Branch | null;
  setBranches: (branches: Branch[]) => void;
  setCurrentBranch: (branch: Branch) => void;
  isLoading: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1️⃣ EFECTO DE LIMPIEZA: Si se cierra sesión, borramos todo
  useEffect(() => {
    if (!user) {
      setBranches([]);
      setCurrentBranch(null);
    }
  }, [user]);

  // 2️⃣ EFECTO DE CARGA Y SELECCIÓN
  useEffect(() => {
    const initBranches = async () => {
      // Si no hay usuario, no hacemos nada
      if (!user) return;

      let availableBranches = branches;

      // PASO A: Si no tenemos sedes en memoria, las descargamos
      if (branches.length === 0) {
        setIsLoading(true);
        try {
          const res = await api.get("/branches/");
          availableBranches = res.data;
          setBranches(availableBranches);
        } catch (error) {
          console.error("Error cargando sedes:", error);
        } finally {
          setIsLoading(false);
        }
      }

      // PASO B: Lógica de Auto-Selección (Se ejecuta SIEMPRE que haya sedes y falte seleccionar una)
      // Esto arregla el bug: ahora corre aunque las sedes ya estuvieran en memoria
      if (!currentBranch && availableBranches.length > 0) {
        console.log("🎯 Auto-seleccionando sede para:", user.email);

        const isAdmin =
          user.role === "ADMIN" ||
          (user.role as string) === "Administrador" ||
          user.is_superuser === true;

        if (isAdmin) {
          // Admin: Primera sede
          setCurrentBranch(availableBranches[0]);
        } else if (user.branch_id) {
          // Empleado: Su sede asignada
          const myBranch = availableBranches.find(
            (b: any) => b.id === user.branch_id,
          );
          if (myBranch) setCurrentBranch(myBranch);
        } else {
          // Fallback de seguridad
          setCurrentBranch(availableBranches[0]);
        }
      }
    };

    initBranches();
    // Ejecutamos esto cuando cambia el usuario o la lista de sedes
  }, [user, branches.length, currentBranch]);

  return (
    <BranchContext.Provider
      value={{
        branches,
        currentBranch,
        setBranches,
        setCurrentBranch,
        isLoading,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error("useBranch debe usarse dentro de un BranchProvider");
  }
  return context;
};
