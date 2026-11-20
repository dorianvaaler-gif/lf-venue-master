// Service worker de LF-Venue: solo notificaciones push.
// Se registra desde app/page.js. Sin caché de la app: la app siempre carga
// fresca desde Vercel (así nunca se queda atorada en una versión vieja).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  const title = data.title || "LF-Venue";
  const body = data.body || "Nuevo mensaje en LF-Venue";
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const c of clients) { if ("focus" in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
