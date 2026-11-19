"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, supabaseConfigured, MASTER_EMAIL } from "@/lib/supabase";

const TERMS = [
  { t: "Edición al mismo tiempo.", b: "Si dos personas editan lo mismo al mismo tiempo, vale la última edición, porque esa es la actual. La edición anterior queda reemplazada por la más reciente." },
  { t: "Ubicación.", b: "LF-Venue no usa ni guarda tu ubicación. La app no pide permiso de ubicación y no registra dónde estás ni dónde está tu teléfono." },
  { t: "Instalación.", b: "LF-Venue funciona en iPhone y Android, sin copiar ni pegar links. No se descarga ningún archivo aparte: la instala tu navegador (Safari en iPhone, Chrome en Android) y su icono queda en tu pantalla de inicio." },
  { t: "Derechos de autor · Idea, nombre e imagen.", b: "LF-Venue, su idea, su nombre, su imagen / icono, su diseño y su contenido son propiedad exclusiva de LF Venue y están protegidos por derechos de autor." },
  { t: "Prohibido copiar.", b: "Queda prohibido copiar, replicar, reproducir, distribuir, modificar, vender o plagiar, total o parcialmente, la app, su nombre, su imagen o su idea, sin autorización escrita de LF Venue. El uso no autorizado constituye una infracción a los derechos de autor." },
  { t: "Versión Master.", b: "Los datos se sincronizan en tiempo real entre los teléfonos del equipo, con mensajería interna por proyecto. Solo el master ve Equipo y puede activar o desactivar personal; si te desactiva, tu sesión se cierra y no puedes entrar hasta que te reactive." },
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
function ring() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const notes = [440, 523.25, 659.25, 880, 659.25];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.12); o.stop(ctx.currentTime + i * 0.12 + 0.55);
    });
  } catch (e) { /* sin sonido, no pasa nada */ }
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

  function say(t) { setToast(t); setTimeout(() => setToast(""), 2600); }

  // ---------- sesión ----------
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setUser(data?.session?.user || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const h = (e) => { if (e && e.prompt) { e.preventDefault(); setDeferredPrompt(e); } };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

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
  }
  useEffect(() => { if (phase === "app") loadEvents(); }, [phase]);

  useEffect(() => {
    if (!sb || phase !== "app") return;
    const ch = sb.channel("lf-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => loadEvents())
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { if (openEvent) loadDetail(openEvent); })
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_items" }, () => { if (openEvent) loadDetail(openEvent); })
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, () => { if (openEvent) loadDetail(openEvent); })
      .on("postgres_changes", { event: "*", schema: "public", table: "event_crew" }, () => { if (openEvent) loadDetail(openEvent); })
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, () => { if (openEvent) loadDetail(openEvent); })
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => { if (openEvent) loadDetail(openEvent); })
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
    const { data, error } = await sb.from("events").insert({
      name: "Nuevo evento", event_date: new Date().toISOString().slice(0, 10),
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
    const { data, error } = await sb.from("events").insert({
      name: f.name + " (copia)", event_date: f.event_date, call_time: f.call_time,
      show_time: f.show_time, responsible: f.responsible, notes: f.notes, created_by: user?.id,
    }).select().single();
    if (error) { say("No se pudo copiar"); return; }
    await loadEvents(); setOpenEvent(data); say("Evento copiado");
  }
  async function deleteEvent(ev) {
    if (!sb) return;
    await sb.from("events").delete().eq("id", ev.id);
    setOpenEvent(null); setDetail(null); await loadEvents(); say("Evento borrado");
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

  // ---------- mensajes ----------
  async function sendMessage() {
    if (!sb || !openEvent || !msgText.trim() || !profile) return;
    const body = msgText.trim(); setMsgText("");
    await sb.from("messages").insert({ event_id: openEvent.id, author_id: user.id, author_name: profile.name || profile.email, body });
    await logActivity(openEvent.id, "escribió en Mensajes");
    loadDetail(openEvent);
  }

  // ---------- render: splash ----------
  if (phase === "splash") {
    return (
      <div className="splash" onClick={() => { ring(); setPhase(localStorage.getItem("lf-terms") ? (user ? "app" : "auth") : "terms"); }}>
        <img src="/icon-512.png" alt="LF-Venue" />
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
        <div className="header"><img className="logo" src="/icon-512.png" alt="" /><div><div className="title">LF<span>-</span>Venue</div><div className="sub">Términos y Condiciones</div></div></div>
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
        <div className="header"><img className="logo" src="/icon-512.png" alt="" /><div><div className="title">LF<span>-</span>Venue</div><div className="sub">Versión Master · equipo de Luz Fría Studio</div></div></div>
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
        <div className="header"><img className="logo" src="/icon-512.png" alt="" /><div><div className="title">LF<span>-</span>Venue</div><div className="sub">Instalar en este teléfono</div></div></div>
        <div className="content">
          <div className="card">
            <h2>Instala LF-Venue</h2>
            <p>En iPhone, Apple obliga a instalar desde Safari. En Android, Chrome la instala directo.</p>
            <div className="steps">
              <b>iPhone (Safari):</b><br />
              1 · Abre esta app en Safari.<br />
              2 · Toca <b>···</b> junto a la dirección, abajo.<br />
              3 · Compartir → <b>Añadir a pantalla de inicio</b> → Añadir.<br /><br />
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
  const list = filteredEvents();

  function EventForm() {
    const ev = detail?.event;
    if (!ev || !detail) return null;
    const d = detail;
    return (
      <div>
        <div className="row">
          <button className="btn ghost" onClick={() => { setOpenEvent(null); setDetail(null); }}>← Volver a eventos</button>
        </div>
        <div className="card">
          <h2>Datos del evento</h2>
          <label className="lbl">Nombre del evento</label>
          <input className="input" value={ev.name || ""} onChange={(e) => saveEventField(ev, { name: e.target.value })} />
          <label className="lbl">Fecha del evento (para ver cuántos días faltan)</label>
          <input className="input" type="date" value={ev.event_date || ""} onChange={(e) => saveEventField(ev, { event_date: e.target.value })} />
          <div className="kv"><span>Fecha</span><b>{fmtDate(ev.event_date)}</b></div>
          <div className="kv"><span>Faltan</span><b>{daysLeft(ev.event_date) === null ? "—" : daysLeft(ev.event_date) === 0 ? "Hoy" : daysLeft(ev.event_date) > 0 ? daysLeft(ev.event_date) + " días" : "Pasó hace " + Math.abs(daysLeft(ev.event_date)) + " días"}</b></div>
          <div className="kv"><span>Rider</span><b>{d.rider.length} equipos</b></div>
          <div className="kv"><span>Crew</span><b>{d.crew.length} personas</b></div>
          <label className="lbl">Call general · llegada</label>
          <input className="input" value={ev.call_time || ""} onChange={(e) => saveEventField(ev, { call_time: e.target.value })} placeholder="Ej. 14:00" />
          <label className="lbl">Show · horario</label>
          <input className="input" value={ev.show_time || ""} onChange={(e) => saveEventField(ev, { show_time: e.target.value })} placeholder="Ej. 21:00" />
          <label className="lbl">Responsable</label>
          <input className="input" value={ev.responsible || ""} onChange={(e) => saveEventField(ev, { responsible: e.target.value })} placeholder="¿Quién responde?" />
        </div>

        <div className="card">
          <h2>Horarios del día</h2>
          <p>Toca el botón para cambiar el estado</p>
          {d.schedules.map((s) => (
            <div className="check" key={s.id}>
              <input className="input" style={{ margin: 0 }} value={s.time || ""} placeholder="Hora" onChange={async (e) => { await sb.from("schedules").update({ time: e.target.value }).eq("id", s.id); loadDetail(ev); }} />
              <input className="input" style={{ margin: 0, flex: 2 }} value={s.label || ""} placeholder="¿Qué pasa a esa hora?" onChange={async (e) => { await sb.from("schedules").update({ label: e.target.value }).eq("id", s.id); loadDetail(ev); }} />
              <button className="btn ghost" onClick={async () => { await sb.from("schedules").delete().eq("id", s.id); loadDetail(ev); }}>✕</button>
            </div>
          ))}
          <button className="btn secondary small" onClick={async () => { await sb.from("schedules").insert({ event_id: ev.id, label: "", time: "", sort: d.schedules.length }); loadDetail(ev); }}>+ Agregar horario</button>
        </div>

        <div className="card">
          <h2>Anotaciones</h2>
          <p>Lo importante del evento</p>
          <textarea className="input" rows={4} value={ev.notes || ""} onChange={(e) => saveEventField(ev, { notes: e.target.value })} placeholder="Escribe aquí…" />
        </div>

        <div className="card">
          <h2>Contactos clave</h2>
          <p>¿A quién llamas?</p>
          {d.contacts.map((c) => (
            <div className="check" key={c.id}>
              <input className="input" style={{ margin: 0 }} value={c.name || ""} placeholder="Nombre" onChange={async (e) => { await sb.from("contacts").update({ name: e.target.value }).eq("id", c.id); loadDetail(ev); }} />
              <input className="input" style={{ margin: 0 }} value={c.phone || ""} placeholder="Teléfono" onChange={async (e) => { await sb.from("contacts").update({ phone: e.target.value }).eq("id", c.id); loadDetail(ev); }} />
              <button className="btn ghost" onClick={async () => { await sb.from("contacts").delete().eq("id", c.id); loadDetail(ev); }}>✕</button>
            </div>
          ))}
          <button className="btn secondary small" onClick={async () => { await sb.from("contacts").insert({ event_id: ev.id, name: "", phone: "" }); loadDetail(ev); }}>+ Agregar contacto</button>
        </div>

        <div className="card">
          <h2>Crew de este evento · {d.crew.length} personas</h2>
          <p>Escribe nombre y rol de cada quien.</p>
          {d.crew.map((c) => (
            <div className="check" key={c.id}>
              <input className="input" style={{ margin: 0 }} value={c.name || ""} placeholder="Nombre" onChange={async (e) => { await sb.from("event_crew").update({ name: e.target.value }).eq("id", c.id); loadDetail(ev); }} />
              <input className="input" style={{ margin: 0 }} value={c.role || ""} placeholder="Rol" onChange={async (e) => { await sb.from("event_crew").update({ role: e.target.value }).eq("id", c.id); loadDetail(ev); }} />
              <button className="btn ghost" onClick={async () => { await sb.from("event_crew").delete().eq("id", c.id); logActivity(ev.id, "quitó a alguien del crew"); loadDetail(ev); }}>✕</button>
            </div>
          ))}
          <button className="btn secondary small" onClick={async () => { await sb.from("event_crew").insert({ event_id: ev.id, name: "", role: "" }); loadDetail(ev); }}>+ Agregar persona al crew</button>
        </div>

        <div className="card">
          <h2>Rider técnico de este evento · {d.rider.length} equipos</h2>
          <p>Toca cualquier celda y escribe: cantidad de piezas, modelo del equipo y en Otros la nota que haga falta.</p>
          <table className="rider">
            <thead><tr><th>Cantidad</th><th>Modelo</th><th>Otros</th><th></th></tr></thead>
            <tbody>
              {d.rider.map((r) => (
                <tr key={r.id}>
                  <td><input value={r.cantidad || ""} onChange={async (e) => { await sb.from("rider_items").update({ cantidad: e.target.value }).eq("id", r.id); loadDetail(ev); }} /></td>
                  <td><input value={r.modelo || ""} onChange={async (e) => { await sb.from("rider_items").update({ modelo: e.target.value }).eq("id", r.id); loadDetail(ev); }} /></td>
                  <td><input value={r.otros || ""} onChange={async (e) => { await sb.from("rider_items").update({ otros: e.target.value }).eq("id", r.id); loadDetail(ev); }} /></td>
                  <td><button className="btn ghost" onClick={async () => { await sb.from("rider_items").delete().eq("id", r.id); loadDetail(ev); }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn secondary small" style={{ marginTop: 10 }} onClick={async () => { await sb.from("rider_items").insert({ event_id: ev.id, cantidad: "", modelo: "", otros: "" }); loadDetail(ev); }}>+ Agregar equipo</button>
        </div>

        <div className="card">
          <h2>Checklist de carga · {d.checklist.filter((c) => c.status === "hecho").length} de {d.checklist.length} hechos</h2>
          <p>Toca el botón de estado de cada paso para avanzarlo: Pendiente → En curso → Hecho.</p>
          {d.checklist.map((c) => (
            <div className="check" key={c.id}>
              <input className="input" style={{ margin: 0, flex: 1 }} value={c.text || ""} placeholder="Paso…" onChange={async (e) => { await sb.from("checklist_items").update({ text: e.target.value }).eq("id", c.id); loadDetail(ev); }} />
              <button className={"statusbtn " + (c.status === "hecho" ? "hecho" : c.status === "en_curso" ? "curso" : "")}
                onClick={async () => {
                  const next = c.status === "pendiente" ? "en_curso" : c.status === "en_curso" ? "hecho" : "pendiente";
                  await sb.from("checklist_items").update({ status: next }).eq("id", c.id); loadDetail(ev);
                }}>
                {c.status === "pendiente" ? "Pendiente" : c.status === "en_curso" ? "En curso" : "Hecho"}
              </button>
              <button className="btn ghost" onClick={async () => { await sb.from("checklist_items").delete().eq("id", c.id); loadDetail(ev); }}>✕</button>
            </div>
          ))}
          <button className="btn secondary small" onClick={async () => { await sb.from("checklist_items").insert({ event_id: ev.id, text: "", status: "pendiente", sort: d.checklist.length }); loadDetail(ev); }}>+ Agregar paso</button>
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
            <input className="input" style={{ margin: 0, flex: 1 }} value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Escribe un mensaje…" onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} />
            <button className="btn" onClick={sendMessage}>Enviar</button>
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
          <button className="btn ghost" onClick={() => { setOpenEvent(null); setDetail(null); }}>← Volver a eventos</button>
          <div className="spacer" />
          <button className="btn danger small" onClick={() => setConfirm({ title: "¿Borrar este evento?", text: "Se borra el evento con su ficha, rider, crew, checklist y mensajes. No se puede recuperar.", onYes: () => deleteEvent(ev) })}>Borrar evento</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <img className="logo" src="/icon-512.png" alt="" />
        <div><div className="title">LF<span>-</span>Venue</div><div className="sub">{isMaster ? "Master · " : ""}{profile?.name || profile?.email || ""}</div></div>
        <div className="spacer" />
        <span className="pill">Guardado en la nube ✓</span>
      </div>

      <div className="content">
        {openEvent ? <EventForm /> : tab === "eventos" ? (
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
              <span className="pill">{list.length} eventos</span>
            </div>
            {list.length === 0 && <div className="card"><p>No hay eventos aquí todavía. Crea el primero.</p></div>}
            {list.map((e) => {
              const dl = daysLeft(e.event_date);
              return (
                <button key={e.id} className="event" onClick={() => setOpenEvent(e)}>
                  <div className="name">{e.name}</div>
                  <div className="meta">{fmtDate(e.event_date)}{e.show_time ? " · Show " + e.show_time : ""}{e.responsible ? " · " + e.responsible : ""}</div>
                  <div className="days">{dl === null ? "" : dl === 0 ? "Es hoy" : dl > 0 ? "Faltan " + dl + " días" : "Pasó hace " + Math.abs(dl) + " días"}</div>
                </button>
              );
            })}
            <div className="card">
              <div className="row"><button className="btn block" onClick={createEvent} disabled={busy}>+ Crear evento nuevo</button></div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn secondary block" onClick={copyFirstEvent} disabled={!events.length}>Copiar el primer evento →</button>
              </div>
            </div>
          </>
        ) : tab === "hoy" ? (
          <>
            <h2 style={{ fontSize: 18 }}>Hoy</h2>
            {todayEvents.length === 0 && <div className="card"><p>No hay eventos hoy.</p></div>}
            {todayEvents.map((e) => (
              <button key={e.id} className="event" onClick={() => setOpenEvent(e)}>
                <div className="name">{e.name}</div>
                <div className="meta">{fmtDate(e.event_date)}{e.call_time ? " · Llegada " + e.call_time : ""}{e.show_time ? " · Show " + e.show_time : ""}</div>
              </button>
            ))}
            <div className="card">
              <h2>Línea de tiempo</h2>
              <p>Mismos horarios del evento</p>
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
        <button className={tab === "eventos" ? "on" : ""} onClick={() => { setTab("eventos"); setOpenEvent(null); }}>Eventos</button>
        <button className={tab === "hoy" ? "on" : ""} onClick={() => { setTab("hoy"); setOpenEvent(null); }}>Hoy</button>
        {isMaster && <button className={tab === "equipo" ? "on" : ""} onClick={() => { setTab("equipo"); setOpenEvent(null); }}>Equipo</button>}
        <button className={tab === "mas" ? "on" : ""} onClick={() => { setTab("mas"); setOpenEvent(null); }}>Más</button>
      </div></div>

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
              2 · Toca <b>···</b> junto a la dirección, abajo.<br />
              3 · Compartir → <b>Añadir a pantalla de inicio</b> → Añadir.<br /><br />
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
