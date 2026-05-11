import createClient from "openapi-fetch";
import { supabase } from "@/lib/auth/supabase";

const API_BASE = import.meta.env.VITE_API_URL || "";

export const api = createClient({ baseUrl: API_BASE });

api.use({
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      request.headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
    return request;
  },
});
