import { authClient } from "@/lib/auth/neon";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);

  try {
    // Try to get JWT token from Neon Auth
    const token = await authClient.getJWTToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // Not authenticated — continue without token
  }

  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
