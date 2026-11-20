"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, supabaseConfigured, MASTER_EMAIL } from "@/lib/supabase";

const TERMS = [
  { t: "Edición al mismo tiempo.", b: "Si dos personas editan lo mismo al mismo tiempo, vale la última edición, porque esa es la actual. La edición anterior queda reemplazada por la más reciente." },
  { t: "Ubicación.", b: "LF-Venue no usa ni guarda tu ubicación. La app no pide permiso de ubicación y no registra dónde estás ni dónde está tu teléfono." },
  { t: "Instalación.", b: "LF-Venue funciona en iPhone y Android, sin copiar ni pegar links. No se descarga ningún archivo aparte: la instala tu navegador (Safari en iPhone, Chrome en Android) y su icono queda en tu pantalla de inicio." },
  { t: "Derechos de autor · Idea, nombre e imagen.", b: "LF-Venue, su idea, su nombre, su imagen / icono, su diseño y su contenido son propiedad exclusiva de LF Venue y están protegidos por derechos de autor." },
  { t: "Prohibido copiar.", b: "Queda prohibido copiar, replicar, reproducir, distribuir, modificar, vender o plagiar, total o parcialmente, la app, su nombre, su imagen o su idea, sin autorización escrita de LF Venue. El uso no autorizado constituye una infracción a los derechos de autor." },
  { t: "Versión Master.", b: "Los datos se sincronizan en tiempo real entre los teléfonos del equipo, con mensajería interna por proyecto. Solo el master ve Equipo y puede activar o desactivar personal; si te desactiva, su sesión se cierra y no puedes entrar hasta que te reactive." },
  { t: "Sin fotos, sin ubicación, sin respaldo.", b: "LF-Venue no usa cámara ni fotos, no guarda ubicación y no tiene respaldo si se pierde el teléfono." },
];

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d - today) / 86400000);
}
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
// Sonido de apertura: arpegio La–Do–Mi–La–Mi.
// iOS exige que el AudioContext se reanude dentro del gesto del usuario.
// Antes solo sonaba al tocar Entrar en la pantalla de inicio: con la sesión
// guardada la app salta sola a la pantalla principal sin tocar nada y el
// sonido nunca sonaba. Ahora suena UNA vez en el primer toque dentro de la
// app (también al tocar Entrar), con un AudioContext compartido.
let sharedCtx = null;
let openSoundDone = false;
function ring() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedCtx) sharedCtx = new Ctx();
    const ctx = sharedCtx;
    const play = () => {
      const notes = [440, 523.25, 659.25, 880, 659.25];
      const t0 = ctx.currentTime + 0.02;
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.12 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.6);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + i * 0.12); o.stop(t0 + i * 0.12 + 0.65);
      });
    };
    if (ctx.state === "suspended") ctx.resume().then(play).catch(play);
    else play();
  } catch (e) { /* sin sonido, no pasa nada */ }
}
function playOpenSound() {
  if (openSoundDone) return;
  openSoundDone = true;
  ring();
}
function urlB64ToUint8(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Logo de la app. Si la imagen no carga (webview, red), muestra un distintivo
// "LF" con el acento turquesa, para que nunca se vea roto al abrir.
function Logo({ size, radius, className }) {
  const [ok, setOk] = useState(true);
  const style = { width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.38) };
  if (!ok) return <div className="logo-fallback" style={style}>LF</div>;
  return <img src="/icon-512.png" alt="LF-Venue" className={className || "logo-img"} style={style} onError={() => setOk(false)} />;
}

// Campo con estado local: se escribe sin interrupciones y se guarda al salir
// del campo. Antes cada tecla guardaba en la base y recargaba el detalle,
// y el teclado se cerraba. Es un componente de nivel de módulo (identidad
// estable) para que React no lo desmonte en cada render.
function Field({ value, onSave, placeholder, type, rows, className = "input", style, inputMode, autoCapitalize }) {
  const ref = useRef(null);
  const [val, setVal] = useState(value || "");
  useEffect(() => {
    if (document.activeElement !== ref.current) setVal(value || "");
  }, [value]);
  const save = () => { if ((val || "") !== (value || "")) onSave(val); };
  if (rows) {
    return (
      <textarea ref={ref} className={className} rows={rows} value={val}
        placeholder={placeholder} style={style}
        onChange={(e) => setVal(e.target.value)} onBlur={save} />
    );
  }
  return (
    <input ref={ref} className={className} type={type || "text"} value={val}
      placeholder={placeholder} style={style} inputMode={inputMode} autoCapitalize={autoCapitalize}
      onChange={(e) => setVal(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

// Formulario del SHOW. Vive fuera de Home para que su identidad sea estable:
// antes estaba definido dentro de Home y React lo desmontaba en cada render,
// lo que cerraba el teclado al escribir.
function EventForm({ detail, sb, msgText, setMsgText, onSendMessage, onClose, onSaveEventField, onLogActivity, onConfirm, onDeleteEvent, onReloadDetail }) {
  const ev = detail?.event;
  if (!ev || !detail) return null;
  const d = detail;
  const totalPiezas = d.rider.reduce((a, r) => a + (parseInt(r.cantidad, 10) || 0), 0);
  // Banner del SHOW: fecha + horario + anotaciones, avanzando todo el tiempo.
  const tickerParts = [fmtDate(ev.event_date) === "—" ? "Sin fecha" : fmtDate(ev.event_date), ev.show_time ? "Show " + ev.show_time : "Sin horario"];
  if (ev.notes) tickerParts.push(ev.notes);
  const tickerText = tickerParts.join("   •   ");
  return (
    <div>
      <div className="row">
        <button className="btn ghost" onClick={onClose}>← Volver a shows</button>
      </div>
      <div className="card rider-card">
        <h2>Rider técnico de este SHOW</h2>
        <p>Toca cualquier celda y escribe: cantidad de piezas y modelo del equipo con todos sus detalles. Se guarda solo al salir de la celda.</p>
        <div className="rider-total"><b>{totalPiezas}</b> piezas · <b>{d.rider.length}</b> equipos</div>
        <table className="rider">
          <thead><tr><th>Cantidad</th><th>Modelo</th><th></th></tr></thead>
          <tbody>
            {d.rider.map((r) => (
              <tr key={r.id}>
                <td><Field className="" value={r.cantidad || ""} onSave={async (v) => { await sb.from("rider_items").update({ cantidad: v }).eq("id", r.id); }} /></td>
                <td><Field rows={2} className="" value={r.modelo || ""} onSave={async (v) => { await sb.from("rider_items").update({ modelo: v }).eq("id", r.id); }} /></td>
                <td><button className="btn ghost" onClick={async () => { await sb.from("rider_items").delete().eq("id", r.id); onReloadDetail(); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn block" style={{ marginTop: 10 }} onClick={async () => { await sb.from("rider_items").insert({ event_id: ev.id, cantidad: "", modelo: "" }); onReloadDetail(); }}>+ Agregar equipo</button>
      </div>

      <div className="card">
        <h2>Datos del SHOW</h2>
        <label className="lbl">Nombre del SHOW</label>
        <Field value={ev.name || ""} onSave={(v) => onSaveEventField(ev, { name: v })} />
        <label className="lbl">Fecha del SHOW (para ver cuántos días faltan)</label>
        <Field type="date" value={ev.event_date || ""} onSave={(v) => onSaveEventField(ev, { event_date: v })} />
        <div className="ticker"><div className="ticker-track"><span>{tickerText}</span><span aria-hidden="true">{tickerText}</span></div></div>
        <div className="kv"><span>Fecha</span><b>{fmtDate(ev.event_date)}</b></div>
        <div className="kv"><span>Faltan</span><b>{daysLeft(ev.event_date) === null ? "—" : daysLeft(ev.event_date) === 0 ? "Hoy" : daysLeft(ev.event_date) > 0 ? daysLeft(ev.event_date) + " días" : "Pasó hace " + Math.abs(daysLeft(ev.event_date)) + " días"}</b></div>
        <div className="kv"><span>Rider</span><b>{d.rider.length} equipos</b></div>
        <div className="kv"><span>Crew</span><b>{d.crew.length} personas</b></div>
        <label className="lbl">Call general · llegada</label>
        <Field value={ev.call_time || ""} placeholder="Ej. 14:00" onSave={(v) => onSaveEventField(ev, { call_time: v })} />
        <label className="lbl">Show · horario</label>
        <Field value={ev.show_time || ""} placeholder="Ej. 21:00" onSave={(v) => onSaveEventField(ev, { show_time: v })} />
        <label className="lbl">Responsable</label>
        <Field value={ev.responsible || ""} placeholder="¿Quién responde?" onSave={(v) => onSaveEventField(ev, { responsible: v })} />
      </div>

      <div className="card">
        <h2>Horarios del día</h2>
        <p>Toca el botón para cambiar el estado</p>
        {d.schedules.map((s) => (
          <div className="check" key={s.id}>
            <Field style={{ margin: 0 }} value={s.time || ""} placeholder="Hora" onSave={async (v) => { await sb.from("schedules").update({ time: v }).eq("id", s.id); }} />
            <Field style={{ margin: 0, flex: 2 }} value={s.label || ""} placeholder="¿Qué pasa a esa hora?" onSave={async (v) => { await sb.from("schedules").update({ label: v }).eq("id", s.id); }} />
            <button className="btn ghost" onClick={async () => { await sb.from("schedules").delete().eq("id", s.id); onReloadDetail(); }}>✕</button>
          </div>
        ))}
        <button className="btn secondary small" onClick={async () => { await sb.from("schedules").insert({ event_id: ev.id, label: "", time: "", sort: d.schedules.length }); onReloadDetail(); }}>+ Agregar horario</button>
      </div>

      <div className="card">
        <h2>Anotaciones</h2>
        <p>Lo importante del SHOW</p>
        <Field rows={4} value={ev.notes || ""} placeholder="Escribe aquí…" onSave={(v) => onSaveEventField(ev, { notes: v })} />
      </div>

      <div className="card">
        <h2>Contactos clave</h2>
        <p>¿A quién llamas?</p>
        {d.contacts.map((c) => (
          <div className="check" key={c.id}>
            <Field style={{ margin: 0 }} value={c.name || ""} placeholder="Nombre" onSave={async (v) => { await sb.from("contacts").update({ name: v }).eq("id", c.id); }} />
            <Field style={{ margin: 0 }} value={c.phone || ""} placeholder="Teléfono" onSave={async (v) => { await sb.from("contacts").update({ phone: v }).eq("id", c.id); }} />
            <button className="btn ghost" onClick={async () => { await sb.from("contacts").delete().eq("id", c.id); onReloadDetail(); }}>✕</button>
          </div>
        ))}
        <button className="btn secondary small" onClick={async () => { await sb.from("contacts").insert({ event_id: ev.id, name: "", phone: "" }); onReloadDetail(); }}>+ Agregar contacto</button>
      </div>

      <div className="card">
        <h2>Crew de este SHOW · {d.crew.length} personas</h2>
        <p>Escribe nombre y rol de cada quien.</p>
        {d.crew.map((c) => (
          <div className="check" key={c.id}>
            <Field style={{ margin: 0 }} value={c.name || ""} placeholder="Nombre" onSave={async (v) => { await sb.from("event_crew").update({ name: v }).eq("id", c.id); }} />
            <Field style={{ margin: 0 }} value={c.role || ""} placeholder="Rol" onSave={async (v) => { await sb.from("event_crew").update({ role: v }).eq("id", c.id); }} />
            <button className="btn ghost" onClick={async () => { await sb.from("event_crew").delete().eq("id", c.id); onLogActivity(ev.id, "quitó a alguien del crew"); onReloadDetail(); }}>✕</button>
          </div>
        ))}
        <button className="btn secondary small" onClick={async () => { await sb.from("event_crew").insert({ event_id: ev.id, name: "", role: "" }); onReloadDetail(); }}>+ Agregar persona al crew</button>
      </div>

      <div className="card">
        <h2>Checklist de carga · {d.checklist.filter((c) => c.status === "hecho").length} de {d.checklist.length} hechos</h2>
        <p>Toca el botón de estado de cada paso para avanzarlo: Pendiente → En curso → Hecho.</p>
        {d.checklist.map((c) => (
          <div className="check" key={c.id}>
            <Field style={{ margin: 0, flex: 1 }} value={c.text || ""} placeholder="Paso…" onSave={async (v) => { await sb.from("checklist_items").update({ text: v }).eq("id", c.id); }} />
            <button className={"statusbtn " + (c.status === "hecho" ? "hecho" : c.status === "en_curso" ? "curso" : "")}
              onClick={async () => {
                const next = c.status === "pendiente" ? "en_curso" : c.status === "en_curso" ? "hecho" : "pendiente";
                await sb.from("checklist_items").update({ status: next }).eq("id", c.id); onReloadDetail();
              }}>
              {c.status === "pendiente" ? "Pendiente" : c.status === "en_curso" ? "En curso" : "Hecho"}
            </button>
            <button className="btn ghost" onClick={async () => { await sb.from("checklist_items").delete().eq("id", c.id); onReloadDetail(); }}>✕</button>
          </div>
        ))}
        <button className="btn secondary small" onClick={async () => { await sb.from("checklist_items").insert({ event_id: ev.id, text: "", status: "pendiente", sort: d.checklist.length }); onReloadDetail(); }}>+ Agregar paso</button>
      </div>

      <div className="card">
        <h2>Mensajes · {ev.name}</h2>
        <p>Chat interno del equipo para este proyecto. Se sincroniza en tiempo real.</p>
        {d.messages.length === 0 && <p>Sin mensajes todavía. Escribe el primero.</p>}
        {d.messages.map((m) => (
          <div className="msg" key={m.id}>
            <div className="who">{m.author_name}</div>
            <div className="body">{m.body}</div>
            <div className="when">{fmtTime(m.created_at)}</div>
          </div>
        ))}
        <div className="row">
          <input className="input" style={{ margin: 0, flex: 1 }} value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Escribe un mensaje…" onKeyDown={(e) => { if (e.key === "Enter") onSendMessage(); }} />
          <button className="btn" onClick={onSendMessage}>Enviar</button>
        </div>
      </div>

      <div className="card">
        <h2>Tu actividad</h2>
        <p>Tus últimos cambios</p>
        {d.activity.length === 0 && <p>Sin actividad todavía.</p>}
        {d.activity.map((a) => (
          <div className="kv" key={a.id}><b>{a.author_name}</b><span>{a.text} · {fmtTime(a.created_at)}</span></div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn ghost" onClick={onClose}>← Volver a shows</button>
        <div className="spacer" />
        <button className="btn danger small" onClick={() => onConfirm({ title: "¿Borrar este SHOW?", text: "Se borra el SHOW con su ficha, rider, crew, checklist y mensajes. No se puede recuperar.", onYes: () => onDeleteEvent(ev) })}>Borrar SHOW</button>
      </div>
    </div>
  );
}

export default function Home() {
  const sb = getSupabase();
  const [phase, setPhase] = useState("splash"); // splash | terms | auth | install | app
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState("");
  const [authMode, setAuthMode] = useState("login"); // login | invite | master
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("eventos"); // eventos | hoy | equipo | mas
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [openEvent, setOpenEvent] = useState(null);
  const [detail, setDetail] = useState(null); // {event, schedules, contacts, crew, rider, checklist, messages, activity}
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const [confirm, setConfirm] = useState(null); // {title, text, onYes}
  const [showTerms, setShowTerms] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [newEvent, setNewEvent] = useState(false);
  const detailRef = useRef(null);
  // Chat del equipo (público, para todo el crew) + LEDs + notificaciones.
  const [teamChatOpen, setTeamChatOpen] = useState(false);
  const [teamMessages, setTeamMessages] = useState([]);
  const [teamMsgText, setTeamMsgText] = useState("");
  const [teamUnread, setTeamUnread] = useState(false); // LED rojo: mensaje nuevo en el chat del equipo
  const [changedEvents, setChangedEvents] = useState({}); // {eventId: ts} LED azul: cambios en algún SHOW
  const [pushState, setPushState] = useState("off"); // off | on | denied | unsupported | error
  const teamChatOpenRef = useRef(false);
  const openEventRef = useRef(null);
  const userRef = useRef(null);
  const justSavedRef = useRef(0); // mi último guardado: sus ecos de Realtime no encienden LEDs
  const teamListRef = useRef(null);

  function say(t) { setToast(t); setTimeout(() => setToast(""), 2600); }

  // ---------- sesión ----------
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setUser(data?.session?.user || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Link de invitación: ?invite=CODIGO&email=correo — abre el formulario de
  // invitación con el correo y el código ya puestos.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const c = (q.get("invite") || "").trim().toUpperCase();
      const em = (q.get("email") || "").trim().toLowerCase();
      if (c) { setAuthMode("invite"); setInviteCode(c); if (em) setEmail(em); }
    } catch (e) { /* sin link, no pasa nada */ }
  }, []);

  useEffect(() => {
    const h = (e) => { if (e && e.prompt) { e.preventDefault(); setDeferredPrompt(e); } };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  // Service worker (notificaciones push en iOS) — se registra una vez.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Sonido de apertura: suena en el primer toque dentro de la app, una sola
  // vez por apertura. Cubre a los usuarios con sesión guardada, que entran
  // directo sin pasar por la pantalla de inicio.
  useEffect(() => {
    if (phase !== "app") return;
    const h = () => playOpenSound();
    window.addEventListener("pointerdown", h, { once: true });
    window.addEventListener("keydown", h, { once: true });
    return () => { window.removeEventListener("pointerdown", h); window.removeEventListener("keydown", h); };
  }, [phase]);

  // Refs frescas para los handlers de Realtime (evitan cierres viejos).
  useEffect(() => { teamChatOpenRef.current = teamChatOpen; }, [teamChatOpen]);
  useEffect(() => { openEventRef.current = openEvent; }, [openEvent]);
  useEffect(() => { userRef.current = user; }, [user]);

  // LED azul: cambios en SHOWs que ya estaban pendientes (de una sesión anterior).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lf-changed-events");
      if (raw) setChangedEvents(JSON.parse(raw) || {});
    } catch (e) {}
  }, []);

  // LED rojo: al abrir el chat del equipo se marca todo como leído.
  function markTeamSeen() {
    setTeamUnread(false);
    try { localStorage.setItem("lf-team-seen", new Date().toISOString()); } catch (e) {}
  }
  // LED azul: tocar el LED marca todo como visto y lo apaga.
  function clearChangedEvents() {
    setChangedEvents({});
    try {
      localStorage.removeItem("lf-changed-events");
      localStorage.setItem("lf-events-seen", new Date().toISOString());
    } catch (e) {}
  }
  function clearChangedEvent(eventId) {
    setChangedEvents((prev) => {
      if (!prev[eventId]) return prev;
      const next = { ...prev };
      delete next[eventId];
      try { localStorage.setItem("lf-changed-events", JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }
  // LED azul: un cambio de OTRA persona en un SHOW (no el que tengo abierto,
  // que ya lo estoy viendo, ni el eco de mi propio guardado).
  function markChangedEvent(eventId) {
    if (!eventId) return;
    if (openEventRef.current && openEventRef.current.id === eventId) return;
    if (Date.now() - justSavedRef.current < 3000) return;
    setChangedEvents((prev) => {
      if (prev[eventId]) return prev;
      const next = { ...prev, [eventId]: Date.now() };
      try { localStorage.setItem("lf-changed-events", JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }

  async function loadProfile(u) {
    if (!sb || !u) return null;
    const { data } = await sb.from("profiles").select("*").eq("id", u.id).single();
    if (data) {
      if (data.active === false) {
        await sb.auth.signOut();
        setUser(null); setProfile(null);
        setErr("Tu acceso está desactivado. Pídele al master que te reactive.");
        setPhase("auth");
        return null;
      }
      setProfile(data);
      if (data.terms_accepted_at) localStorage.setItem("lf-terms", "1");
      return data;
    }
    return null;
  }

  useEffect(() => {
    if (!user) return;
    loadProfile(user).then((p) => {
      if (!p) return;
      if (!localStorage.getItem("lf-terms")) setPhase("terms");
      else if (!localStorage.getItem("lf-installed")) setPhase("install");
      else setPhase("app");
    });
  }, [user]);

  // re-checar que sigo activo (si el master me desactiva, se cierra al momento)
  useEffect(() => {
    if (!user || !sb) return;
    const t = setInterval(async () => {
      const { data } = await sb.from("profiles").select("active").eq("id", user.id).single();
      if (data && data.active === false) {
        await sb.auth.signOut();
        setUser(null); setProfile(null);
        setErr("El master desactivó tu acceso.");
        setPhase("auth");
      }
    }, 30000);
    const onVis = () => { if (!document.hidden) loadProfile(user); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [user]);

  // ---------- datos ----------
  async function loadEvents() {
    if (!sb) return;
    const { data } = await sb.from("events").select("*").order("event_date", { ascending: true });
    setEvents(data || []);
    // LED azul al abrir: SHOWs editados desde la última vez que los vi.
    try {
      const seen = localStorage.getItem("lf-events-seen");
      if (seen) {
        const t = new Date(seen).getTime();
        const fresh = {};
        (data || []).forEach((e) => { if (e.updated_at && new Date(e.updated_at).getTime() > t) fresh[e.id] = new Date(e.updated_at).getTime(); });
        if (Object.keys(fresh).length) setChangedEvents((prev) => ({ ...fresh, ...prev }));
      }
    } catch (e) {}
  }
  useEffect(() => { if (phase === "app") { loadEvents(); loadTeamMessages(); } }, [phase]);

  useEffect(() => {
    if (!sb || phase !== "app") return;
    const ch = sb.channel("lf-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, (p) => { loadEvents(); if (p?.new?.id) markChangedEvent(p.new.id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
        if (openEvent) loadDetail(openEvent);
        if (p?.new?.event_id && p.new.author_id !== userRef.current?.id) markChangedEvent(p.new.event_id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_items" }, (p) => { if (openEvent) loadDetail(openEvent); if (p?.new?.event_id) markChangedEvent(p.new.event_id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, (p) => { if (openEvent) loadDetail(openEvent); if (p?.new?.event_id) markChangedEvent(p.new.event_id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "event_crew" }, (p) => { if (openEvent) loadDetail(openEvent); if (p?.new?.event_id) markChangedEvent(p.new.event_id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, (p) => { if (openEvent) loadDetail(openEvent); if (p?.new?.event_id) markChangedEvent(p.new.event_id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, (p) => { if (openEvent) loadDetail(openEvent); if (p?.new?.event_id) markChangedEvent(p.new.event_id); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_messages" }, (p) => {
        loadTeamMessages();
        if (!teamChatOpenRef.current && p?.new?.author_id !== userRef.current?.id) setTeamUnread(true);
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [phase, openEvent]);

  async function loadDetail(ev) {
    if (!sb) return;
    const [sc, co, cr, ri, ch, ms, ac] = await Promise.all([
      sb.from("schedules").select("*").eq("event_id", ev.id).order("sort"),
      sb.from("contacts").select("*").eq("event_id", ev.id).order("created_at"),
      sb.from("event_crew").select("*").eq("event_id", ev.id).order("created_at"),
      sb.from("rider_items").select("*").eq("event_id", ev.id).order("created_at"),
      sb.from("checklist_items").select("*").eq("event_id", ev.id).order("sort"),
      sb.from("messages").select("*").eq("event_id", ev.id).order("created_at"),
      sb.from("activity").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setDetail({
      event: ev,
      schedules: sc.data || [], contacts: co.data || [], crew: cr.data || [],
      rider: ri.data || [], checklist: ch.data || [], messages: ms.data || [], activity: ac.data || [],
    });
  }
  useEffect(() => { if (openEvent) loadDetail(openEvent); }, [openEvent]);

  async function logActivity(eventId, text) {
    if (!sb || !profile) return;
    await sb.from("activity").insert({ event_id: eventId, author_name: profile.name || profile.email, text });
  }
  async function saveEventField(ev, patch) {
    if (!sb) return;
    justSavedRef.current = Date.now();
    const { error } = await sb.from("events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", ev.id);
    if (!error) { setOpenEvent({ ...ev, ...patch }); setEvents((es) => es.map((e) => (e.id === ev.id ? { ...e, ...patch } : e))); }
  }

  // ---------- auth ----------
  async function doLogin() {
    if (!sb) return;
    setBusy(true); setErr("");
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) { setErr("No se pudo entrar: " + error.message); return; }
    if (data?.user) { setUser(data.user); say("Bienvenido"); }
  }
  async function doInviteAccept() {
    setBusy(true); setErr("");
    const r = await fetch("/api/invites", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: inviteCode, name: inviteName, password }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "No se pudo crear tu acceso"); return; }
    say("Acceso creado, entra con tu correo y contraseña");
    setAuthMode("login"); setInviteCode(""); setInviteName("");
  }
  async function doMasterSetup() {
    setBusy(true); setErr("");
    const r = await fetch("/api/bootstrap", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: inviteName || "LF", password }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "No se pudo crear el master"); return; }
    say("Master creado, entra con tu correo y contraseña");
    setAuthMode("login");
  }
  async function acceptTerms() {
    localStorage.setItem("lf-terms", "1");
    if (sb && profile) await sb.from("profiles").update({ terms_accepted_at: new Date().toISOString() }).eq("id", profile.id);
    if (user) {
      if (!localStorage.getItem("lf-installed")) setPhase("install"); else setPhase("app");
    } else setPhase("auth");
  }

  // ---------- eventos ----------
  async function createEvent() {
    if (!sb) return;
    setBusy(true);
    justSavedRef.current = Date.now();
    const { data, error } = await sb.from("events").insert({
      name: "Nuevo SHOW", event_date: new Date().toISOString().slice(0, 10),
      call_time: "", show_time: "", responsible: "", notes: "", created_by: user?.id,
    }).select().single();
    setBusy(false);
    if (error) { say("No se pudo crear"); return; }
    await loadEvents();
    setOpenEvent(data); setNewEvent(true);
  }
  async function copyFirstEvent() {
    if (!sb || !events.length) return;
    const f = events[0];
    justSavedRef.current = Date.now();
    const { data, error } = await sb.from("events").insert({
      name: f.name + " (copia)", event_date: f.event_date, call_time: f.call_time,
      show_time: f.show_time, responsible: f.responsible, notes: f.notes, created_by: user?.id,
    }).select().single();
    if (error) { say("No se pudo copiar"); return; }
    await loadEvents(); setOpenEvent(data); say("SHOW copiado");
  }
  async function deleteEvent(ev) {
    if (!sb) return;
    justSavedRef.current = Date.now();
    await sb.from("events").delete().eq("id", ev.id);
    setOpenEvent(null); setDetail(null); await loadEvents(); say("SHOW borrado");
  }
  function filteredEvents() {
    const q = search.trim().toLowerCase();
    let list = events.filter((e) => !q || (e.name || "").toLowerCase().includes(q));
    if (filter === "proximos") list = list.filter((e) => (daysLeft(e.event_date) ?? -999) >= 0);
    if (filter === "semana") list = list.filter((e) => { const d = daysLeft(e.event_date); return d !== null && d >= 0 && d <= 7; });
    if (filter === "pasados") list = list.filter((e) => (daysLeft(e.event_date) ?? 999) < 0);
    return list;
  }
  const todayEvents = useMemo(() => {
    const t = new Date().toISOString().slice(0, 10);
    return events.filter((e) => e.event_date === t);
  }, [events]);

  // ---------- equipo (master) ----------
  async function loadMembers() {
    if (!sb || !user) return;
    const token = (await sb.auth.getSession()).data?.session?.access_token;
    const r = await fetch("/api/admin", { headers: { Authorization: "Bearer " + token } });
    const j = await r.json();
    if (r.ok) setMembers(j.members || []);
  }
  useEffect(() => { if (tab === "equipo" && profile?.role === "master") loadMembers(); }, [tab, profile]);

  async function inviteMember() {
    if (!sb || !user) return;
    setBusy(true); setErr("");
    const token = (await sb.auth.getSession()).data?.session?.access_token;
    const r = await fetch("/api/invites", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "No se pudo invitar"); return; }
    setInviteResult(j); setInviteEmail(""); say("Código creado");
  }
  async function setMemberActive(id, active) {
    if (!sb || !user) return;
    const token = (await sb.auth.getSession()).data?.session?.access_token;
    const r = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ id, active }),
    });
    if (r.ok) { say(active ? "Miembro activado" : "Miembro desactivado, su sesión se cierra"); loadMembers(); }
    else say("No se pudo cambiar");
  }

  // ---------- chat del equipo (público) ----------
  async function loadTeamMessages() {
    if (!sb) return;
    const { data } = await sb.from("team_messages").select("*").order("created_at", { ascending: true }).limit(100);
    const list = data || [];
    setTeamMessages(list);
    try {
      const seen = localStorage.getItem("lf-team-seen");
      const me = userRef.current?.id;
      setTeamUnread(list.some((m) => (!seen || new Date(m.created_at).getTime() > new Date(seen).getTime()) && m.author_id !== me));
    } catch (e) {}
  }
  async function sendTeamMessage() {
    if (!sb || !teamMsgText.trim() || !profile) return;
    const body = teamMsgText.trim(); setTeamMsgText("");
    const { error } = await sb.from("team_messages").insert({ author_id: user.id, author_name: profile.name || profile.email, body });
    if (error) { setTeamMsgText(body); say("No se pudo enviar"); return; }
    markTeamSeen();
    notifyPush({ sender_id: user.id, sender_name: profile.name || profile.email, text: body, scope: "team" });
    loadTeamMessages();
  }
  // Baja al último mensaje cuando se abre el chat o llega uno nuevo.
  useEffect(() => {
    if (teamChatOpen && teamListRef.current) {
      teamListRef.current.scrollTop = teamListRef.current.scrollHeight;
    }
  }, [teamMessages, teamChatOpen]);
  // Al abrir un SHOW se apaga su LED azul (ya lo estoy viendo).
  useEffect(() => { if (openEvent) clearChangedEvent(openEvent.id); }, [openEvent]);

  // ---------- notificaciones push ----------
  // Aviso al resto del crew cuando escribo (chat del equipo o de un SHOW).
  // No bloquea el envío: si el aviso falla, el mensaje ya quedó guardado.
  async function notifyPush(payload) {
    try {
      await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch (e) {}
  }
  // Estado actual de las notificaciones en este teléfono.
  useEffect(() => {
    if (phase !== "app") return;
    (async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setPushState("unsupported"); return; }
      if (Notification.permission === "denied") { setPushState("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushState(sub ? "on" : "off");
      } catch (e) { setPushState("error"); }
    })();
  }, [phase]);
  async function enablePush() {
    try {
      const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
      if (!pub) { say("Faltan las llaves de notificaciones en Vercel"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState("denied"); say("Sin permiso no llegan avisos"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(pub) });
      const r = await fetch("/api/push-subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.id, subscription: sub.toJSON() }),
      });
      if (!r.ok) { setPushState("error"); say("No se pudo guardar la suscripción"); return; }
      setPushState("on"); say("Notificaciones activadas");
    } catch (e) { setPushState("error"); say("No se pudo activar"); }
  }

  // ---------- mensajes ----------
  async function sendMessage() {
    if (!sb || !openEvent || !msgText.trim() || !profile) return;
    const body = msgText.trim(); setMsgText("");
    await sb.from("messages").insert({ event_id: openEvent.id, author_id: user.id, author_name: profile.name || profile.email, body });
    await logActivity(openEvent.id, "escribió en Mensajes");
    notifyPush({ sender_id: user.id, sender_name: profile.name || profile.email, text: body, scope: "event", event_id: openEvent.id, event_name: openEvent.name });
    loadDetail(openEvent);
  }

  // ---------- render: splash ----------
  if (phase === "splash") {
    return (
      <div className="splash" onClick={() => { playOpenSound(); setPhase(localStorage.getItem("lf-terms") ? (user ? "app" : "auth") : "terms"); }}>
        <Logo size={200} radius={44} className="splash-logo" />
        <div className="name">LF<span>-</span>Venue</div>
        <div className="tag">Gestión de producción · Luz Fría Studio</div>
        <button className="btn" style={{ marginTop: 8 }}>Entrar</button>
      </div>
    );
  }

  // ---------- render: términos ----------
  if (phase === "terms") {
    return (
      <div className="app">
        <div className="header"><Logo size={40} radius={12} /><div><div className="title">LF<span>-</span>Venue</div><div className="sub">Términos y Condiciones</div></div></div>
        <div className="content">
          <div className="card">
            <h2>Términos y Condiciones</h2>
            <p>Léelos aquí mismo y, si estás de acuerdo, acepta con el botón Aceptar términos.</p>
            <div className="terms">
              {TERMS.map((t, i) => (<div key={i}><h3>{t.t}</h3><p>{t.b}</p></div>))}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn block" onClick={acceptTerms}>Aceptar términos</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn secondary block" onClick={() => { setErr("Si no aceptas los términos no puedes entrar a LF-Venue."); }}>No aceptar</button>
            </div>
            {err && <div className="banner warn" style={{ marginTop: 10 }}>{err}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- render: auth ----------
  if (phase === "auth") {
    return (
      <div className="app">
        <div className="header"><Logo size={40} radius={12} /><div><div className="title">LF<span>-</span>Venue</div><div className="sub">Versión Master · equipo de Luz Fría Studio</div></div></div>
        <div className="content">
          {!supabaseConfigured && (
            <div className="banner warn">Falta conectar Supabase: pon NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY en Vercel y vuelve a desplegar.</div>
          )}
          <div className="card">
            <h2>{authMode === "login" ? "Entrar" : authMode === "invite" ? "Tengo un código de invitación" : "Crear acceso master"}</h2>
            <p>{authMode === "login" ? "Entra con tu correo y contraseña." : authMode === "invite" ? "El master te dio un código por correo. Ponlo aquí, elige tu nombre y tu contraseña." : "Solo la primera vez: crea el acceso master de Dorian (dorianvaaler@gmail.com)."}</p>
            <label className="lbl">Correo</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoCapitalize="off" />
            {authMode !== "login" && (
              <>
                <label className="lbl">Tu nombre</label>
                <input className="input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Nombre y apellido" />
              </>
            )}
            {authMode === "invite" && (
              <>
                <label className="lbl">Código de invitación</label>
                <input className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="ABC123" autoCapitalize="characters" />
              </>
            )}
            <label className="lbl">Contraseña</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu contraseña" />
            {err && <div className="banner warn">{err}</div>}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn block" disabled={busy || !supabaseConfigured} onClick={authMode === "login" ? doLogin : authMode === "invite" ? doInviteAccept : doMasterSetup}>
                {busy ? "…" : authMode === "login" ? "Entrar" : "Crear mi acceso"}
              </button>
            </div>
            <div className="row" style={{ marginTop: 10, justifyContent: "center" }}>
              {authMode !== "login" && <button className="btn ghost" onClick={() => { setAuthMode("login"); setErr(""); }}>Ya tengo cuenta, entrar</button>}
              {authMode === "login" && <button className="btn ghost" onClick={() => { setAuthMode("invite"); setErr(""); }}>Tengo un código de invitación</button>}
            </div>
            {authMode === "login" && (
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn ghost" onClick={() => { setAuthMode("master"); setEmail(MASTER_EMAIL); setErr(""); }}>Soy el master, crear mi acceso</button>
              </div>
            )}
            <div className="row" style={{ justifyContent: "center", marginTop: 6 }}>
              <button className="btn ghost" onClick={() => setShowTerms(true)}>Ver Términos y Condiciones</button>
            </div>
          </div>
        </div>
        {showTerms && (
          <div className="modal-back" onClick={() => setShowTerms(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Términos y Condiciones</h3>
              <div className="terms" style={{ maxHeight: 320 }}>
                {TERMS.map((t, i) => (<div key={i}><h3>{t.t}</h3><p>{t.b}</p></div>))}
              </div>
              <button className="btn block" style={{ marginTop: 12 }} onClick={() => setShowTerms(false)}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- render: instalar ----------
  if (phase === "install") {
    return (
      <div className="app">
        <div className="header"><Logo size={40} radius={12} /><div><div className="title">LF<span>-</span>Venue</div><div className="sub">Instalar en este teléfono</div></div></div>
        <div className="content">
          <div className="card">
            <h2>Instala LF-Venue</h2>
            <p>En iPhone, Apple obliga a instalar desde Safari. En Android, Chrome la instala directo.</p>
            <div className="steps">
              <b>iPhone (Safari):</b><br />
              1 · Abre esta app en Safari.<br />
              2 · Toca el botón <b>≡</b> dentro de la píldora de la dirección, abajo.<br />
              3 · Toca <b>Agregar a Inicio</b> → <b>Añadir</b>.<br /><br />
              <b>Android (Chrome):</b><br />
              Menú → <b>Instalar app</b> / Añadir a pantalla de inicio.
            </div>
            {deferredPrompt && (
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn block" onClick={async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); }}>Instalar LF-Venue</button>
              </div>
            )}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn secondary block" onClick={() => { localStorage.setItem("lf-installed", "1"); setPhase("app"); }}>Ya la instalé / entrar a la app</button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn ghost block" onClick={() => { localStorage.setItem("lf-installed", "1"); setPhase("app"); }}>Entrar sin instalar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- render: app ----------
  const isMaster = profile?.role === "master";
  const hasChanges = Object.keys(changedEvents).length > 0;
  const list = filteredEvents();

  return (
    <div className="app">
      <div className="header">
        <Logo size={40} radius={12} />
        <div><div className="title">LF<span>-</span>Venue</div><div className="sub">{isMaster ? "Master · " : ""}{profile?.name || profile?.email || ""}</div></div>
        <div className="spacer" />
        <button className="led-blue-btn" onClick={clearChangedEvents} title={hasChanges ? "Hay cambios en shows — toca para marcarlos como vistos" : "Sin cambios en shows"}>
          <span className={"led-blue " + (hasChanges ? "on" : "")} />
          {hasChanges ? "Cambios" : ""}
        </button>
        <span className="pill">Guardado en la nube ✓</span>
      </div>

      <div className="content">
        {openEvent ? (
          <EventForm
            detail={detail} sb={sb}
            msgText={msgText} setMsgText={setMsgText}
            onSendMessage={sendMessage}
            onClose={() => { setOpenEvent(null); setDetail(null); }}
            onSaveEventField={saveEventField}
            onLogActivity={logActivity}
            onConfirm={setConfirm}
            onDeleteEvent={deleteEvent}
            onReloadDetail={() => { if (openEvent) loadDetail(openEvent); }}
          />
        ) : tab === "eventos" ? (
          <>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o fecha…" />
            <div className="row wrap" style={{ marginBottom: 12 }}>
              {[["todos", "Todos"], ["proximos", "Próximos"], ["semana", "Esta semana"], ["pasados", "Pasados"]].map(([k, l]) => (
                <button key={k} className={"chip " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Próximos shows</h2>
              <div className="spacer" />
              <span className="pill">{list.length} shows</span>
            </div>
            {list.length === 0 && <div className="card"><p>No hay shows aquí todavía. Crea el primero.</p></div>}
            {list.map((e) => {
              const dl = daysLeft(e.event_date);
              return (
                <button key={e.id} className="event" onClick={() => setOpenEvent(e)}>
                  <div className="name">{changedEvents[e.id] ? <span className="led-blue on" style={{ display: "inline-block", marginRight: 7, verticalAlign: "1px" }} /> : null}{e.name}</div>
                  <div className="meta">{fmtDate(e.event_date)}{e.show_time ? " · Show " + e.show_time : ""}{e.responsible ? " · " + e.responsible : ""}</div>
                  <div className="days">{dl === null ? "" : dl === 0 ? "Es hoy" : dl > 0 ? "Faltan " + dl + " días" : "Pasó hace " + Math.abs(dl) + " días"}</div>
                </button>
              );
            })}
            <div className="card">
              <div className="row"><button className="btn block" onClick={createEvent} disabled={busy}>+ Crear SHOW nuevo</button></div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn secondary block" onClick={copyFirstEvent} disabled={!events.length}>Copiar el primer SHOW →</button>
              </div>
            </div>
          </>
        ) : tab === "hoy" ? (
          <>
            <h2 style={{ fontSize: 18 }}>Hoy</h2>
            {todayEvents.length === 0 && <div className="card"><p>No hay shows hoy.</p></div>}
            {todayEvents.map((e) => (
              <button key={e.id} className="event" onClick={() => setOpenEvent(e)}>
                <div className="name">{changedEvents[e.id] ? <span className="led-blue on" style={{ display: "inline-block", marginRight: 7, verticalAlign: "1px" }} /> : null}{e.name}</div>
                <div className="meta">{fmtDate(e.event_date)}{e.call_time ? " · Llegada " + e.call_time : ""}{e.show_time ? " · Show " + e.show_time : ""}</div>
              </button>
            ))}
            <div className="card">
              <h2>Línea de tiempo</h2>
              <p>Mismos horarios del SHOW</p>
              {todayEvents.length === 0 && <p>Sin horarios hoy.</p>}
            </div>
          </>
        ) : tab === "equipo" && isMaster ? (
          <>
            <h2 style={{ fontSize: 18 }}>Equipo</h2>
            <div className="card">
              <h2>Invitar por correo</h2>
              <p>La app te da un código para compartir. La persona entra con su correo + código, pone su nombre y su contraseña.</p>
              <input className="input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              <button className="btn block" disabled={busy || !inviteEmail.includes("@")} onClick={inviteMember}>Crear código de invitación</button>
              {inviteResult && (
                <div style={{ marginTop: 12 }}>
                  <p>Comparte este código con <b>{inviteResult.email}</b>:</p>
                  <div className="codebox">{inviteResult.code}</div>
                  <button className="btn secondary block" onClick={() => { navigator.clipboard?.writeText(inviteResult.code); say("Código copiado"); }}>Copiar código</button>
                  <button className="btn block" style={{ marginTop: 8 }} onClick={() => { const link = window.location.origin + "/?invite=" + inviteResult.code + "&email=" + encodeURIComponent(inviteResult.email); navigator.clipboard?.writeText(link); say("Link copiado"); }}>Copiar link de invitación</button>
                  <p style={{ marginTop: 8 }}>Con el link, a la persona ya le sale el código puesto; solo pone su nombre y su contraseña.</p>
                </div>
              )}
              {err && <div className="banner warn" style={{ marginTop: 10 }}>{err}</div>}
            </div>
            <div className="card">
              <h2>Personal · {members.length}</h2>
              <p>Solo tú ves esta lista. Si desactivas a alguien, su sesión se cierra al momento y no puede entrar hasta reactivarlo.</p>
              {members.map((m) => (
                <div className="member" key={m.id}>
                  <div className="who"><div className="n">{m.name || "Sin nombre"}</div><div className="e">{m.email} · {m.role === "master" ? "Master" : "Miembro"}</div></div>
                  <span className={"pill " + (m.active ? "" : "warn")}>{m.active ? "Activo" : "Desactivado"}</span>
                  {m.role !== "master" && (
                    <button className="btn small secondary" onClick={() => setMemberActive(m.id, !m.active)}>{m.active ? "Desactivar" : "Reactivar"}</button>
                  )}
                </div>
              ))}
              {members.length === 0 && <p>Sin personal todavía. Invita al primero arriba.</p>}
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18 }}>Más opciones</h2>
            <div className="card">
              <h2>Notificaciones</h2>
              <p>Te avisan en tu teléfono cuando alguien escriba en el chat del equipo o en un SHOW. Solo funcionan si la app está instalada en Inicio.</p>
              {pushState === "on" ? (
                <p>Activadas ✓</p>
              ) : pushState === "denied" ? (
                <p>Están bloqueadas en este teléfono. Actívalas en Ajustes → Safari → Notificaciones.</p>
              ) : pushState === "unsupported" ? (
                <p>Este navegador no tiene notificaciones push. Instala la app desde Safari y vuelve aquí.</p>
              ) : (
                <button className="btn block" onClick={enablePush}>Activar notificaciones</button>
              )}
            </div>
            <div className="card">
              <div className="row" style={{ marginBottom: 8 }}><button className="btn secondary block" onClick={() => setShowTerms(true)}>Ver Términos y Condiciones</button></div>
              <div className="row" style={{ marginBottom: 8 }}><button className="btn secondary block" onClick={() => setShowInstall(true)}>Instalar LF-Venue en este teléfono</button></div>
              <div className="row"><button className="btn danger block" onClick={async () => { await sb?.auth.signOut(); setUser(null); setProfile(null); setPhase("auth"); }}>Cerrar sesión</button></div>
            </div>
            <div className="card">
              <p>LF-Venue Master · Luz Fría Studio. Idea, nombre, imagen, diseño y contenido son propiedad exclusiva de LF Venue.</p>
            </div>
          </>
        )}
      </div>

      <div className="tabbar"><div className="inner">
        <button className={tab === "eventos" ? "on" : ""} onClick={() => { setTab("eventos"); setOpenEvent(null); }}>Shows</button>
        <button className={tab === "hoy" ? "on" : ""} onClick={() => { setTab("hoy"); setOpenEvent(null); }}>Hoy</button>
        {isMaster && <button className={tab === "equipo" ? "on" : ""} onClick={() => { setTab("equipo"); setOpenEvent(null); }}>Equipo</button>}
        <button className={tab === "mas" ? "on" : ""} onClick={() => { setTab("mas"); setOpenEvent(null); }}>Más</button>
      </div></div>

      {/* Botón del chat del equipo: muy a la vista, con LED rojo si hay mensaje nuevo */}
      {!teamChatOpen && (
        <button className="chat-fab" onClick={() => { setTeamChatOpen(true); markTeamSeen(); }} aria-label="Chat del equipo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
          {teamUnread && <span className="chat-led" />}
        </button>
      )}
      {teamChatOpen && (
        <div className="chat-panel">
          <div className="chat-head">
            <b>Chat del equipo</b>
            <span className="pill">Todos</span>
            <button className="btn ghost" onClick={() => setTeamChatOpen(false)}>↓ Minimizar</button>
          </div>
          <div className="chat-list" ref={teamListRef}>
            {teamMessages.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>Sin mensajes todavía. Escribe el primero.</p>}
            {teamMessages.map((m) => (
              <div className="msg" key={m.id}>
                <div className="who">{m.author_name}</div>
                <div className="body">{m.body}</div>
                <div className="when">{fmtTime(m.created_at)}</div>
              </div>
            ))}
          </div>
          <div className="row chat-input">
            <input className="input" style={{ margin: 0, flex: 1 }} value={teamMsgText} onChange={(e) => setTeamMsgText(e.target.value)} placeholder="Escribe al equipo…" onKeyDown={(e) => { if (e.key === "Enter") sendTeamMessage(); }} />
            <button className="btn" onClick={sendTeamMessage}>Enviar</button>
          </div>
        </div>
      )}

      {showTerms && (
        <div className="modal-back" onClick={() => setShowTerms(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Términos y Condiciones</h3>
            <div className="terms" style={{ maxHeight: 320 }}>
              {TERMS.map((t, i) => (<div key={i}><h3>{t.t}</h3><p>{t.b}</p></div>))}
            </div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => setShowTerms(false)}>Cerrar</button>
          </div>
        </div>
      )}
      {showInstall && (
        <div className="modal-back" onClick={() => setShowInstall(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Instalar LF-Venue</h3>
            <div className="steps">
              <b>iPhone (Safari):</b><br />
              1 · Abre esta app en Safari.<br />
              2 · Toca el botón <b>≡</b> dentro de la píldora de la dirección, abajo.<br />
              3 · Toca <b>Agregar a Inicio</b> → <b>Añadir</b>.<br /><br />
              <b>Android (Chrome):</b><br />
              Menú → <b>Instalar app</b> / Añadir a pantalla de inicio.
            </div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => setShowInstall(false)}>Cerrar</button>
          </div>
        </div>
      )}
      {confirm && (
        <div className="modal-back">
          <div className="modal">
            <h3>{confirm.title}</h3>
            <p>{confirm.text}</p>
            <div className="row">
              <button className="btn secondary block" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className="btn danger block" onClick={() => { const f = confirm.onYes; setConfirm(null); f(); }}>Sí, borrar</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
