import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import webpush from "web-push";

// POST { sender_id, sender_name, text, scope: "team" | "event", event_name }
// -> avisa por push a todo el crew menos al que escribió.
// Si el push no está configurado (faltan las llaves VAPID) responde ok:false
// sin error: el mensaje ya quedó guardado, el aviso es lo de menos.
export async function POST(req) {
  try {
    const { sender_id, sender_name, text, scope, event_name } = await req.json();
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
    const priv = process.env.VAPID_PRIVATE_KEY || "";
    if (!pub || !priv) return NextResponse.json({ ok: false, error: "Push no configurado" });
    webpush.setVapidDetails("mailto:dorianvaaler@gmail.com", pub, priv);
    const sb = getServiceSupabase();
    if (!sb) return NextResponse.json({ ok: false, error: "Supabase no configurado" }, { status: 500 });
    const { data: subs } = await sb.from("push_subscriptions").select("*");
    const targets = (subs || []).filter((s) => s.user_id !== sender_id);
    const title = scope === "team" ? "Chat del equipo · LF-Venue" : "LF-Venue · " + (event_name || "SHOW");
    const payload = JSON.stringify({
      title,
      body: (sender_name || "Alguien") + ": " + String(text || "").slice(0, 120),
      url: "/",
    });
    let sent = 0, removed = 0;
    await Promise.all(targets.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        // Suscripción vencida o borrada (410/404): se limpia sola.
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        }
      }
    }));
    return NextResponse.json({ ok: true, sent, removed, total: targets.length });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
