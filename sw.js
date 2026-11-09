/* BrainBord service worker: tar imot varsler (Web Push) og åpner riktig side når du trykker.
   Den mellomlagrer ingenting, så appen oppfører seg akkurat som før. */
const SCOPE = self.registration.scope;                  // f.eks. https://brainbord.netlify.app/
const SAFE = /^#[a-z0-9-]{1,40}$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: e.data ? e.data.text() : '' }; }
  const title = String(d.title || 'BrainBord').slice(0, 160);
  const url = SAFE.test(d.url || '') ? d.url : '#dashboard';
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || 'Trykk for å åpne BrainBord').slice(0, 200),
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: d.tag || undefined,
    lang: 'nb',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = SAFE.test(e.notification.data && e.notification.data.url) ? e.notification.data.url : '#dashboard';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(SCOPE));
    if (open) {                                          // appen er åpen: hopp til riktig side
      open.postMessage({ type: 'open', url: hash });
      return open.focus();
    }
    return self.clients.openWindow(SCOPE + hash);        // appen er lukket: åpne den på riktig side
  })());
});
