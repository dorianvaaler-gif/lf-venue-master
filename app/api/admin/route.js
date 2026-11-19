import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

async function callerIsMaster(req) {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Supabase no configurado" };
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, error: "Sin sesión" };
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { ok: false, error: "Sesión inválida" };
  const { data: prof } = await sb.from("profiles").select("role, active").eq("id", data.user.id).single();
  if (!prof || prof.role !== "master" || prof.active === false)
    return { ok: false, error: "Solo el master puede hacer esto" };
  return { ok: true, sb, user: data.user };
}

// GET -> lista de miembros (solo master)
export async function GET(req) {
  const auth = await callerIsMaster(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  const { data, error } = await auth.sb
    .from("profiles")
    .select("id, email, name, role, active, created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ members: data || [] });
}

// POST { id, active } -> activar / desactivar miembro (solo master)
export async function POST(req) {
  try {
    const auth = await callerIsMaster(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
    const { id, active } = await req.json();
    if (!id) return NextResponse.json({ error: "Falta el usuario" }, { status: 400 });
    const { error } = await auth.sb.from("profiles").update({ active: !!active }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
