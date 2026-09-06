// BARISTA — a floating button on every screen that opens a chat with the POR Barista.
// The conversation lives for the session; each question goes up with what's on the
// counter (coffee, method, current recipe) so answers are about this cup, not coffee in general.
import { $, esc, icon, I, sheet, closeSheet } from './ui.js'
import { state } from './store.js'
import { uid, fn } from './supa.js'
import * as profile from './api/profile.js'

const log = []               // { q, a } for this session
let plan = null              // cached after first check
let busy = false

const SUGGEST = {
  recipe: ['Is this recipe right for this coffee?', 'What should I watch for during the pour?', 'Should I go finer or coarser?'],
  rate: ['It tasted sour — what changed?', 'How do I get more sweetness?', 'What should I change next time?'],
  coffee: ['How should I brew this one?', 'What will this taste like?', 'Is this good for espresso?'],
  default: ['What is my best recipe so far?', 'Why is this tasting sour?', 'Should I grind finer?', 'How fresh should my beans be?'],
}

export function mountFab() {
  if ($('fab')) return
  const b = document.createElement('button')
  b.id = 'fab'; b.className = 'fab'; b.setAttribute('aria-label', 'Ask the barista')
  b.innerHTML = `${icon(I.cup)}<span>Barista</span>`
  b.onclick = open
  document.body.appendChild(b)
}
export function showFab(on) { const f = $('fab'); if (f) f.hidden = !on }

export async function open() {
  if (!uid()) { location.hash = '#/signin'; return }
  if (plan == null) { const me = await profile.me().catch(() => null); plan = me?.plan || 'free' }
  if (!['pro', 'trial', 'founder'].includes(plan)) return upsell()
  const screen = (location.hash.replace(/^#\//, '').split(/[/?]/)[0]) || 'home'
  const sugg = SUGGEST[screen] || SUGGEST.default
  const p = sheet(`<div class="row between" style="margin-bottom:6px"><h3 style="margin:0">Barista</h3><span class="tag">Pro</span></div>
    <div id="blog" class="chat">${log.length ? log.map(row).join('') : `<div class="small muted" style="padding:6px 0 10px">Knows your grinder, the coffee on the counter and every cup you've logged. Ask anything.</div>`}</div>
    <div class="chips scroll" id="bsugg">${sugg.map(s => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px;gap:8px"><input class="input" id="bq" placeholder="Ask about your coffee" maxlength="800" autocomplete="off"><button class="btn primary" id="bsend">Ask</button></div>`)
  p.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { p.querySelector('#bq').value = b.dataset.q; ask(p, screen) })
  p.querySelector('#bsend').onclick = () => ask(p, screen)
  p.querySelector('#bq').onkeydown = e => { if (e.key === 'Enter') ask(p, screen) }
  scrollLog(p)
}

function upsell() {
  const p = sheet(`<h3 style="margin:0 0 6px">The Barista is part of POR Pro</h3>
    <p class="muted" style="margin:0 0 12px">A working barista in your pocket: knows your grinder and its dial, the bag on the counter, and every cup you've rated — and tells you the one thing to change next.</p>
    <div class="card flat small" style="padding:10px 12px;margin-bottom:12px">Unlimited scans · Barista chat · Recipe history across every coffee</div>
    <button class="btn primary big" id="pro">Get POR Pro</button>
    <p class="small muted" style="margin:10px 0 0">Membership opens soon. Tap to be first in line.</p>`)
  p.querySelector('#pro').onclick = async () => { try { await profile.update({ prefs: { ...(state.prefs || {}), pro_waitlist: new Date().toISOString() } }) } catch {} p.querySelector('#pro').textContent = 'You’re on the list'; p.querySelector('#pro').disabled = true }
}

async function ask(p, screen) {
  const inp = p.querySelector('#bq'); const q = inp.value.trim()
  if (!q || busy) return
  busy = true; inp.value = ''
  log.push({ q, a: null }); paint(p)
  const r = state.rec?.recipe
  const recipe = r ? `${r.method_name}: ${r.dose} g → ${r.water} g (1:${r.ratio}) at ${r.temp} °C${r.grind_setting ? `, grind ${r.grind_setting} on ${r.grinder?.brand ?? ''} ${r.grinder?.model ?? ''}` : r.grind_label ? `, ${r.grind_label}` : ''}, target ${Math.floor((r.total || 0) / 60)}:${String((r.total || 0) % 60).padStart(2, '0')}` : null
  try {
    const out = await fn('barista', { question: q, coffee_id: state.coffee?.id ?? null, method: state.method, recipe, screen, history: log.slice(0, -1).filter(t => t.a).slice(-6) })
    log[log.length - 1].a = out.answer || '…'
  } catch (e) {
    log[log.length - 1].a = e.code === 'pro_required' ? 'The Barista is part of POR Pro.' : e.code === 'not_configured' ? 'The Barista is not switched on yet.' : 'Could not reach the Barista right now — try again in a moment.'
    if (e.code === 'pro_required') plan = 'free'
  }
  busy = false; paint(p)
}
function paint(p) { const el = p.querySelector('#blog'); if (!el) return; el.innerHTML = log.map(row).join(''); scrollLog(p) }
function scrollLog(p) { const el = p.querySelector('#blog'); if (el) el.scrollTop = el.scrollHeight }
const row = x => `<div class="msg me">${esc(x.q)}</div><div class="msg them">${x.a == null ? '<span class="muted">Thinking…</span>' : esc(x.a)}</div>`
