import { createContext, useContext, type ReactNode } from "react";
import { auth, useSession } from "@/lib/auth/neon";

interface AuthContextType {
  user: { id: string; email: string; name?: string } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();

  const user = data?.user
    ? { id: data.user.id, email: data.user.email, name: data.user.name }
    : null;

  const signOut = async () => {
    await auth.adapter.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading: isPending, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
