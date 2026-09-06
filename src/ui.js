// Rendering helpers. Views return HTML strings; `mount` swaps them in and the
// view then binds its own events by id. Everything user-supplied goes through esc().
export const esc = t => String(t ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
export const $ = id => document.getElementById(id)
export const cToF = c => Math.round(c * 9 / 5 + 32)
export const fmtT = s => { s = Math.max(0, Math.round(s)); if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m`; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
export const fmtG = g => String(Math.round(g))
export const fmtDose = g => (Math.round(g * 2) / 2).toString().replace(/\.0$/, '')
export const ratioStr = r => `1:${Number(r) % 1 ? Number(r).toFixed(1) : Math.round(r)}`
export const tempStr = (c, units = 'c') => c == null ? '—' : units === 'f' ? `${cToF(c)} °F` : `${c} °C`
export const tempBoth = c => c == null ? '—' : `${c} °C <small>${cToF(c)} °F</small>`
export const timeAgo = d => { const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`; return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
export const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
export const capital = s => s ? s[0].toUpperCase() + s.slice(1) : ''
export const roastWord = r => r ? r.replace('-', ' ') : ''

export function icon(paths, cls = '') { return `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${paths}</svg>` }
export const I = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v3h16v-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  comment: '<path d="M4 5h16v11H9l-5 4z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  check: '<path d="M5 12l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  skip: '<path d="M5 5l10 7-10 7zM17 5h2v14h-2z"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/>',
  bag: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  cup: '<path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logo: null,
}
export const LOGO = `<svg viewBox="0 0 248 248" aria-hidden="true"><g transform="translate(-75,376) scale(0.1,-0.1)"><path d="M760 3753 c0 -11 1223 -1233 1234 -1233 4 0 6 145 3 323 -4 294 -6 329 -26 397 -37 124 -96 225 -181 310 -88 87 -173 140 -285 177 -79 27 -84 27 -412 31 -183 2 -333 0 -333 -5z"/><path d="M2535 3586 c-156 -49 -269 -183 -297 -350 -46 -275 206 -530 480 -487 95 15 199 69 257 133 101 113 115 171 115 480 l0 238 -257 -1 c-179 0 -270 -4 -298 -13z"/><path d="M1365 1890 c341 -341 623 -620 627 -620 5 0 8 278 8 617 l0 618 620 -620 620 -620 0 620 0 620 -620 0 -620 0 -620 620 -620 620 0 -620 0 -620 -625 623z"/></g></svg>`

export function mount(html) {
  const v = $('view'); v.innerHTML = html; v.classList.remove('fade'); void v.offsetWidth; v.classList.add('fade'); window.scrollTo(0, 0)
}
export function top(title, { back = null, right = '' } = {}) {
  return `<div class="top">${back != null
    ? `<a class="back" href="${esc(back)}" data-back="1">${icon(I.back)} Back</a>`
    : `<a class="brand" href="#/home">${LOGO} POR</a>`}${right}</div>${title ? `<h1>${title}</h1>` : ''}`
}
export function eyebrow(n, text) { return `<div class="eyebrow"><b>${n}</b>${esc(text)}</div>` }

let toastT = 0
export function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms) }

export function sheet(html) {
  const s = $('sheet'), p = s.querySelector('.sheet-panel'); p.innerHTML = html; s.hidden = false
  s.querySelector('.sheet-bg').onclick = closeSheet
  return p
}
export function closeSheet() { $('sheet').hidden = true }

export function avatar(p, size = '') { return `<span class="avatar ${size}">${p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(p?.display_name || p?.username))}</span>` }
export function stars(n, max = 5) { return '★'.repeat(n || 0) + '☆'.repeat(max - (n || 0)) }
export function bagImg(c, big = false) {
  const url = c?.image_url || c?.image_path
  return `<div class="bag ${big ? 'big' : ''}">${url ? `<img src="${esc(url)}" alt="">` : icon(I.bag)}</div>`
}
export function coffeeTitle(c) {
  const r = c?.roaster && c.roaster !== 'Unknown roaster' ? `<div class="roaster">${esc(c.roaster)}</div>` : ''
  return `${r}<h3>${esc(c?.name || 'Unknown coffee')}</h3>`
}
export function coffeeMeta(c) {
  const bits = [c?.blend ? 'Blend' : c?.origin, c?.process, c?.roast_level ? roastWord(c.roast_level) + ' roast' : null,
    c?.altitude_m ? `${c.altitude_m} m` : null, c?.decaf ? 'Decaf' : null].filter(Boolean)
  return bits.length ? `<div class="small muted">${bits.map(esc).join(' · ')}</div>` : ''
}
export function signInPrompt(what = 'do that') {
  return `<div class="card"><h3>Sign in to ${esc(what)}</h3><p class="muted small" style="margin:4px 0 12px">Your brews, coffees and recipes go with you across devices.</p><a class="btn primary" href="#/signin">Sign in</a></div>`
}
