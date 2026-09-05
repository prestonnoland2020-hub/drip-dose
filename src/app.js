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
}
const TAB_OF = { '': 'home', home: 'home', discover: 'discover', brew: 'brew', add: 'brew', recipe: 'brew', timer: 'brew', rate: 'brew', calc: 'brew', barista: 'brew', library: 'library', b: 'library', profile: 'profile', user: 'profile', settings: 'profile', signin: 'profile', coffee: 'discover' }

let current = null
export function navigate(hash) { location.hash = hash }
export function parse() {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  const [name, ...rest] = path.split('/')
  return { name: name || '', params: rest.map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs || '')) }
}
async function route() {
  const { name, params, query } = parse()
  const loader = routes[name] || routes['']
  if (current?.destroy) { try { current.destroy() } catch {} }
  document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === TAB_OF[name] ? 'page' : 'false'))
  $('tabs').classList.toggle('hide', name === 'timer')
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
  await initAuth()
  onAuth(() => { if (parse().name === 'signin' && session) navigate('#/home') })
  route()
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => { const nw = reg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready — reopen POR to get it') }) })
    }).catch(() => {})
  }
})
// Re-sync any running timer when the phone wakes.
document.addEventListener('visibilitychange', () => { if (!document.hidden && current?.resume) current.resume() })
