import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export interface AuthUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "user" | "admin";
}

export function useAuth() {
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await api.getMe();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });

  const logout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    qc.setQueryData(["auth", "me"], null);
    qc.clear();
    window.location.href = "/login";
  };

  return {
    user: user ?? null,
    isLoading,
    isLoggedIn: !!user,
    logout,
  };
}
