import { createClient } from "@supabase/supabase-js";

// Llaves nuevas de Supabase: sb_publishable_... (cliente) y sb_secret_... (servidor).
// Las legacy eyJ... (anon/service_role JWT) están deprecadas y este proyecto ya no las tiene.
// OJO: la publishable NO es un JWT — el cliente nuevo la manda solo en el header `apikey`,
// nunca como `Authorization: Bearer`. Con el cliente viejo daba error de Bearer.
// La llave del cliente DEBE estar en una variable NEXT_PUBLIC_ para que el navegador la vea;
// una VITE_ no llega al bundle del navegador (solo sirve en las API routes del servidor).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";
export const supabaseConfigured =
  SUPABASE_URL.startsWith("http") && !SUPABASE_URL.includes("placeholder") && SUPABASE_ANON_KEY.length > 20;

let _client = null;
export function getSupabase() {
  if (!supabaseConfigured) return null;
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}

export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url.startsWith("http") || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const MASTER_EMAIL = "dorianvaaler@gmail.com";
