// OpenAPI fetch client — uses Neon Auth for token injection
import createClient from "openapi-fetch";
import { authClient } from "@/lib/auth/neon";

const API_BASE = import.meta.env.VITE_API_URL || "";

export const api = createClient({ baseUrl: API_BASE });
