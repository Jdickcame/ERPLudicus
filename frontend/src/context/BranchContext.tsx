import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";
import { db, type LocalBranch } from "../db/database";
import type { Branch } from "../types";
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

  useEffect(() => {
    if (!user) {
      setBranches([]);
      setCurrentBranch(null);
    }
  }, [user]);

  useEffect(() => {
    const initBranches = async () => {
      if (!user) return;

      let availableBranches = branches;

      if (branches.length === 0) {
        setIsLoading(true);
        
        if (navigator.onLine) {
          try {
            const res = await api.get("/branches/");
            availableBranches = res.data.results || res.data;
            setBranches(availableBranches);
            await db.branches.bulkPut(availableBranches as LocalBranch[]);
          } catch (error) {
            const localBranches = await db.branches.toArray();
            if (localBranches.length > 0) {
              availableBranches = localBranches;
              setBranches(localBranches);
            }
          }
        } else {
          const localBranches = await db.branches.toArray();
          if (localBranches.length > 0) {
            availableBranches = localBranches;
            setBranches(localBranches);
          }
        }
        
        setIsLoading(false);
      }

      if (!currentBranch && availableBranches.length > 0) {
        console.log("🎯 Auto-seleccionando sede para:", user.email);

        const isAdmin =
          user.role === "ADMIN" ||
          (user.role as string) === "Administrador" ||
          user.is_superuser === true;

        if (isAdmin) {
          setCurrentBranch(availableBranches[0]);
        } else if (user.branch_id) {
          const myBranch = availableBranches.find(
            (b: any) => b.id === user.branch_id,
          );
          if (myBranch) setCurrentBranch(myBranch);
        } else {
          setCurrentBranch(availableBranches[0]);
        }
      }
    };

    initBranches();
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
