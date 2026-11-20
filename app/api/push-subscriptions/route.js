import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

// POST { user_id, subscription } -> guarda la suscripción push de un teléfono.
// La tabla push_subscriptions solo la toca el servidor (service_role); el
// cliente nunca la lee directo.
export async function POST(req) {
  try {
    const sb = getServiceSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
    const { user_id, subscription } = await req.json();
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (!user_id || !endpoint || !p256dh || !auth)
      return NextResponse.json({ error: "Suscripción incompleta" }, { status: 400 });
    const { error } = await sb.from("push_subscriptions").upsert(
      { user_id, endpoint, p256dh, auth },
      { onConflict: "endpoint" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
