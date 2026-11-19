import { NextResponse } from "next/server";
import { getServiceSupabase, MASTER_EMAIL } from "@/lib/supabase";

// POST { email, name, password } — crea el acceso master SOLO la primera vez
// (cuando aún no existe ningún perfil master). Después de eso, este endpoint
// ya no hace nada: el master invita al resto del equipo por código.
export async function POST(req) {
  try {
    const sb = getServiceSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
    const { email, name, password } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    if (clean !== MASTER_EMAIL)
      return NextResponse.json({ error: "Este acceso es solo para el master" }, { status: 403 });
    if (String(password || "").length < 6)
      return NextResponse.json({ error: "La contraseña debe tener mínimo 6 caracteres" }, { status: 400 });
    const { data: existing } = await sb.from("profiles").select("id").eq("role", "master").limit(1);
    if (existing && existing.length > 0)
      return NextResponse.json({ error: "El master ya existe. Entra con tu correo y contraseña." }, { status: 400 });
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: clean,
      password: String(password),
      email_confirm: true,
      user_metadata: { name: String(name || "LF") },
    });
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });
    await sb.from("profiles").upsert({
      id: created.user.id,
      email: clean,
      name: String(name || "LF"),
      role: "master",
      active: true,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
