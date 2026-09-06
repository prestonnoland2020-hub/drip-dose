// POR service worker — network first, cache fallback, so updates land on the next open
// and the app still opens with no signal. The build id is stamped in by build.sh.
const CACHE = 'por-20260906132755'
const SHELL = ['./index.html','./styles.css','./manifest.webmanifest','./logo.svg','./icon-192.png','./src/api/brews.js','./src/api/coffees.js','./src/api/library.js','./src/api/profile.js','./src/api/setup.js','./src/api/social.js','./src/app.js','./src/calc.js','./src/config.js','./src/feedback.js','./src/grind.js','./src/methods.js','./src/store.js','./src/supa.js','./src/timer.js','./src/ui.js','./src/views/add.js','./src/views/auth.js','./src/views/barista.js','./src/views/brew.js','./src/views/brewDetail.js','./src/views/calc.js','./src/views/coffee.js','./src/views/discover.js','./src/views/home.js','./src/views/library.js','./src/views/profile.js','./src/views/rate.js','./src/views/recipe.js','./src/views/roaster.js','./src/views/settings.js','./src/views/setup.js','./src/views/shared.js','./src/views/timer.js']
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))))
})
