// HOME — what am I drinking, how should I brew it, what's next.
import { mount, top, esc, icon, I, $, bagImg, coffeeTitle, coffeeMeta, ratioStr, fmtT, tempStr, timeAgo, toast, eyebrow } from '../ui.js'
import { state, set } from '../store.js'
import { session, uid } from '../supa.js'
import * as coffees from '../api/coffees.js'
import * as brews from '../api/brews.js'
import * as social from '../api/social.js'
import * as library from '../api/library.js'
import * as profile from '../api/profile.js'
import * as setup from '../api/setup.js'
import { postCard, bindPosts, methodName } from './shared.js'

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

export async function render() {
  // If nothing is on the counter, the most recent "drinking" coffee is.
  if (!state.coffee && uid()) {
    const lib = await library.mine().catch(() => [])
    const cur = lib.find(l => l.status === 'drinking') || lib[0]
    if (cur?.coffees) set({ coffee: cur.coffees })
  }
  const c = state.coffee
  mount(`${top('')}
    <div class="eyebrow">${greeting()}${session ? '' : ' · <a href="#/signin" style="color:var(--accent)">sign in</a>'}</div>
    <h1 style="margin-top:2px">${c ? 'Your coffee' : 'What are you drinking?'}</h1>
    <div id="hero">${c ? heroCard(c) : `<div class="card"><p class="muted" style="margin:0 0 12px">Scan a bag and POR works out how to brew it, guides you through it, and gets better every time you rate a cup.</p><a class="btn primary big" href="#/add">${icon(I.camera)} Add a coffee</a></div>`}</div>
    <div id="rec" class="section"></div>
    <div id="last" class="section"></div>
    <div id="community" class="section"></div>
    <div class="section"><div class="section-h"><h2>From the community</h2><a href="#/discover">Discover</a></div><div id="feed" class="list"><div class="skeleton"></div><div class="skeleton"></div></div></div>`)

  if (c) { loadRec(c); loadLast(c); loadCommunity(c) }
  loadFeed()
}

function heroCard(c) {
  return `<a class="card" href="#/coffee/${c.id}" style="display:block"><div class="coffee-hero">${bagImg(c)}<div>${coffeeTitle(c)}${coffeeMeta(c)}${c.tasting_notes ? `<div class="taste small">${esc(c.tasting_notes)}</div>` : ''}</div></div></a>`
}

async function loadRec(c) {
  const el = $('rec')
  el.innerHTML = `<div class="section-h"><h2>Recommended</h2><a href="#/brew">Change</a></div><div class="skeleton"></div>`
  try {
    const me = uid() ? await profile.me().catch(() => null) : null
    const rec = await coffees.recommend({ coffee_id: c.id, method: state.method, dose: state.dose, roast: state.roast, equipment: me?.equipment || {}, prefs: me?.prefs || {}, grinder_id: (uid() ? setup.activeGrinder(await setup.get().catch(() => [])) : null)?.catalog_id || null })
    set({ rec })
    const r = rec.recipe
    el.innerHTML = `<div class="section-h"><h2>Recommended</h2><a href="#/brew">Change</a></div>
      <div class="card accent">
        <div class="row between"><b>${esc(r.method_name)}</b><span class="conf ${rec.confidence}">${rec.confidence} confidence</span></div>
        <div class="specline" style="margin:6px 0 12px;font-size:15px"><span>${esc(String(r.dose).replace(/\.0$/, ''))} g → ${Math.round(r.water)} g</span><span>${ratioStr(r.ratio)}</span><span>${r.temp_note ? esc(r.temp_note) : tempStr(r.temp, state.units)}</span><span>${fmtT(r.total)}</span></div>
        <a class="btn primary big" href="#/recipe">${icon(I.play)} Start brew</a>
        <div class="small muted" style="margin-top:10px">${esc(rec.why).slice(0, 160)}${rec.why.length > 160 ? '…' : ''} <a href="#/recipe" style="color:var(--accent)">Why this recipe</a></div>
      </div>`
  } catch (e) {
    el.innerHTML = `<div class="section-h"><h2>Recommended</h2></div><div class="card"><a class="btn primary big" href="#/brew">Choose a method</a></div>`
  }
}
async function loadLast(c) {
  if (!uid()) return
  const mine = await brews.mine(20).catch(() => [])
  const last = mine.find(b => b.coffee_id === c.id) || mine[0]
  if (!last) return
  $('last').innerHTML = `<div class="section-h"><h2>Your last brew</h2><a href="#/library?tab=history">History</a></div>
    <a class="card" href="#/b/${last.id}" style="display:flex;gap:14px;align-items:center">
      <div class="rating-big" style="font-size:34px">${last.rating != null ? Number(last.rating).toFixed(1) : '—'}<small style="font-size:13px">/10</small></div>
      <div style="min-width:0"><b>${esc(last.coffees?.name || '')}</b><div class="small muted">${esc(methodName(last.method))} · ${ratioStr(last.ratio)} · ${timeAgo(last.created_at)}</div>${last.notes ? `<div class="taste small">“${esc(last.notes)}”</div>` : ''}${last.next_time?.change ? `<div class="small" style="color:var(--accent);margin-top:4px">Next: ${esc(last.next_time.change.text)}</div>` : ''}</div>
    </a>`
}
async function loadCommunity(c) {
  const s = await coffees.stats(c.id).catch(() => null)
  if (!s || !s.overall.brews) { $('community').innerHTML = `<div class="card flat" style="padding:8px 0"><span class="small muted">No one has logged this coffee yet — your brew will be the first.</span></div>`; return }
  $('community').innerHTML = `<a class="card" href="#/coffee/${c.id}"><b>${s.overall.brewers} ${s.overall.brewers === 1 ? 'person has' : 'people have'} brewed this coffee</b><div class="small muted">${s.overall.brews} brews · ${s.overall.avg_rating ?? '—'} average · see what they're doing ${icon(I.chev, '')}</div></a>`
}
async function loadFeed() {
  const rows = await social.feed(12).catch(() => [])
  const el = $('feed')
  el.innerHTML = rows.length ? rows.map(b => postCard(b)).join('') : `<div class="empty">No brews shared yet. Log one and it appears here.</div>`
  bindPosts(el)
}
