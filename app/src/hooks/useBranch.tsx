import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "./useAuth";

type BranchContextValue = {
  /** null = all branches (HQ only) */
  branchId: number | null;
  setBranchId: (id: number | null) => void;
};

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hqBranch, setHqBranch] = useState<number | null>(() => {
    const stored = localStorage.getItem("medini_branch");
    return stored ? Number(stored) : null;
  });

  const isHq = user?.role === "hq";
  const branchId = isHq ? hqBranch : (user?.branchId ?? null);

  return (
    <BranchContext.Provider
      value={{
        branchId,
        setBranchId: (id) => {
          setHqBranch(id);
          if (id) localStorage.setItem("medini_branch", String(id));
          else localStorage.removeItem("medini_branch");
        },
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
