import { NextResponse } from "next/server";
import { getServiceSupabase, MASTER_EMAIL } from "@/lib/supabase";

function code6() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

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

// POST { email } -> crea invitación y devuelve el código (la plataforma no manda correos)
export async function POST(req) {
  try {
    const auth = await callerIsMaster(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
    const { email } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!clean.includes("@")) return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
    const code = code6();
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { error } = await auth.sb
      .from("invites")
      .insert({ email: clean, code, created_by: auth.user.id, expires_at: expires });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ code, email: clean });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// PUT { email, code, name, password } -> el invitado crea su cuenta
export async function PUT(req) {
  try {
    const sb = getServiceSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
    const { email, code, name, password } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    const c = String(code || "").trim().toUpperCase();
    const nm = String(name || "").trim();
    if (!clean.includes("@") || !c || !nm || String(password || "").length < 6)
      return NextResponse.json({ error: "Faltan datos o la contraseña es muy corta (mínimo 6)" }, { status: 400 });
    const { data: inv, error: invErr } = await sb
      .from("invites")
      .select("*")
      .eq("email", clean)
      .eq("code", c)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invErr || !inv) return NextResponse.json({ error: "Código inválido o vencido" }, { status: 400 });
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: clean,
      password: String(password),
      email_confirm: true,
      user_metadata: { name: nm },
    });
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });
    const role = clean === MASTER_EMAIL ? "master" : "member";
    await sb.from("profiles").upsert({
      id: created.user.id,
      email: clean,
      name: nm,
      role,
      active: true,
    });
    await sb.from("invites").update({ used_at: new Date().toISOString() }).eq("id", inv.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
