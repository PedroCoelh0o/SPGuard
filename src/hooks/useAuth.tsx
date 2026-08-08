import { createContext, useContext, type ReactNode } from "react";

// App local, uso individual: não há mais login/Supabase Auth. Este contexto
// existe só para manter compatível a mesma API que o resto do app já usa
// (canWrite / isAdmin / loading), sem precisar mexer em cada tela.
export type AppRole = "admin" | "supervisor" | "consulta";

interface AuthCtx {
  user: { id: string } | null;
  roles: AppRole[];
  loading: boolean;
  canWrite: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const LOCAL_USER = { id: "local-user" };

const value: AuthCtx = {
  user: LOCAL_USER,
  roles: ["admin"],
  loading: false,
  canWrite: true,
  isAdmin: true,
  signOut: async () => {},
};

const Ctx = createContext<AuthCtx>(value);

export function AuthProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
