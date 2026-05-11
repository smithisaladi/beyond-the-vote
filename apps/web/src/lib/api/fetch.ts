import { authClient } from "@/lib/auth/neon";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const session = await authClient.getSession();
  const headers = new Headers(options?.headers);
  const token = session?.data?.session?.token;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
