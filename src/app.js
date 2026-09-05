// POR — app shell and router. Hash routes so GitHub Pages needs no server config.
import { initAuth, onAuth, session } from './supa.js'
import { $, mount, toast } from './ui.js'
import { state } from './store.js'

const routes = {
  '': () => import('./views/home.js'),
  'home': () => import('./views/home.js'),
  'discover': () => import('./views/discover.js'),
  'brew': () => import('./views/brew.js'),
  'add': () => import('./views/add.js'),
  'recipe': () => import('./views/recipe.js'),
  'timer': () => import('./views/timer.js'),
  'rate': () => import('./views/rate.js'),
  'coffee': () => import('./views/coffee.js'),
  'b': () => import('./views/brewDetail.js'),
  'library': () => import('./views/library.js'),
  'profile': () => import('./views/profile.js'),
  'user': () => import('./views/profile.js'),
  'signin': () => import('./views/auth.js'),
  'calc': () => import('./views/calc.js'),
  'barista': () => import('./views/barista.js'),
  'settings': () => import('./views/settings.js'),
  'setup': () => import('./views/setup.js'),
}
const TAB_OF = { '': 'home', home: 'home', discover: 'discover', brew: 'brew', add: 'brew', recipe: 'brew', timer: 'brew', rate: 'brew', calc: 'brew', barista: 'brew', library: 'library', b: 'library', profile: 'profile', user: 'profile', settings: 'profile', setup: 'profile', signin: 'profile', coffee: 'discover' }

let current = null
export function navigate(hash) { location.hash = hash }
export function parse() {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  const [name, ...rest] = path.split('/')
  return { name: name || '', params: rest.map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs || '')) }
}
async function route() {
  let { name, params, query } = parse()
  // Sign in comes first. Everything in POR is yours — coffees, brews, setup — so there is
  // nothing useful to show a stranger, and the loop cannot start without an account.
  if (!session && name !== 'signin') { location.replace('#/signin'); return }
  const loader = routes[name] || routes['']
  if (current?.destroy) { try { current.destroy() } catch {} }
  document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === TAB_OF[name] ? 'page' : 'false'))
  $('tabs').classList.toggle('hide', name === 'timer' || name === 'signin')
  $('sheet').hidden = true
  try {
    const mod = await loader()
    current = await mod.render({ params, query, name }) || null
  } catch (e) {
    console.error(e)
    mount(`<div class="empty">Something went wrong loading this screen.<br><span class="small">${String(e.message || e)}</span></div>`)
  }
}

window.addEventListener('hashchange', route)
window.addEventListener('DOMContentLoaded', async () => {
  // Never let a slow or blocked SDK load leave a blank screen: after 6 s we route anyway.
  try { await Promise.race([initAuth(), new Promise((_, rej) => setTimeout(() => rej(new Error('auth timeout')), 6000))]) }
  catch (e) { console.warn('auth init failed', e) }
  onAuth(async s => {
    if (!s) { if (parse().name !== 'signin') navigate('#/signin'); return }
    if (parse().name === 'signin') navigate('#/home')
    // First sign-in: ask for the grinder once. Skippable, and never asked again after that.
    try {
      if (localStorage.getItem('por.setupSkipped')) return
      const setup = await import('./api/setup.js'); const items = await setup.get()
      if (!items.length && parse().name !== 'setup') navigate('#/setup?first=1')
    } catch {}
  })
  route()
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => { const nw = reg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready — reopen POR to get it') }) })
    }).catch(() => {})
  }
})
// Re-sync any running timer when the phone wakes.
document.addEventListener('visibilitychange', () => { if (!document.hidden && current?.resume) current.resume() })
