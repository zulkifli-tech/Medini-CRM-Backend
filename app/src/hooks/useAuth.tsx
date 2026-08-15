import { createContext, useContext, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";

type AuthContextValue = {
  user: any | null;
  branch: any | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => utils.invalidate(),
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => utils.invalidate(),
  });

  const value: AuthContextValue = {
    user: me.data?.user ?? null,
    branch: me.data?.branch ?? null,
    isLoading: me.isLoading,
    login: async (username, password) => {
      const res = await loginMutation.mutateAsync({ username, password });
      const token = (res as any)?.token;
      if (token) localStorage.setItem("medini_token", token);
    },
    logout: async () => {
      localStorage.removeItem("medini_token");
      await logoutMutation.mutateAsync();
    },
    refetch: () => me.refetch(),
  };

  // 401 → not logged in is a valid state, not an error to crash on
  const unauthorized = (me.error as any)?.data?.code === "UNAUTHORIZED";
  if (me.error && !unauthorized) {
    // network/other error: still render children, user stays null
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
