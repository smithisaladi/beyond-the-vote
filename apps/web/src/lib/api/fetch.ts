// apps/web/src/lib/api/fetch.ts
import { supabase } from "@/lib/auth/supabase";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(options?.headers);
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
