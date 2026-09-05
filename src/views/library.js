// LIBRARY — my coffees, my brew history, saved recipes.
import { mount, top, esc, icon, I, $, bagImg, roastWord, ratioStr, timeAgo, fmtT, signInPrompt } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import * as library from '../api/library.js'
import * as brews from '../api/brews.js'
import * as social from '../api/social.js'
import { postCard, bindPosts, methodName } from './_shared.js'

export async function render({ query }) {
  const tab = query.tab || 'coffees'
  mount(`${top('Library')}
    <div class="seg" id="tabs2">${[['coffees', 'Coffees'], ['history', 'History'], ['saved', 'Saved']].map(([k, l]) => `<button data-t="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
    <div id="body" class="section"><div class="skeleton"></div></div>`)
  $('tabs2').querySelectorAll('button').forEach(b => b.onclick = () => { location.hash = `#/library?tab=${b.dataset.t}` })
  if (!uid()) { $('body').innerHTML = signInPrompt('keep your coffees and brews'); return }
  if (tab === 'coffees') coffeesTab(); else if (tab === 'history') historyTab(); else savedTab()
}

async function coffeesTab() {
  const rows = await library.mine()
  const el = $('body')
  if (!rows.length) { el.innerHTML = `<div class="empty">No coffees yet.<br><a class="btn primary" href="#/add" style="margin-top:12px">${icon(I.camera)} Add a coffee</a></div>`; return }
  const groups = [['drinking', 'Currently drinking'], ['favorite', 'Favourites'], ['want', 'Want to try'], ['finished', 'Finished']]
  el.innerHTML = groups.map(([k, l]) => { const g = rows.filter(r => r.status === k); return g.length ? `<div class="section" style="margin-top:14px"><div class="eyebrow">${l}</div><div class="list" style="margin-top:8px">${g.map(card).join('')}</div></div>` : '' }).join('')
  function card(r) {
    const c = r.coffees; const days = r.roast_date ? Math.round((Date.now() - new Date(r.roast_date)) / 86400000) : null
    return `<a class="card row" href="#/coffee/${c.id}">${bagImg(c)}<div style="min-width:0;flex:1"><div class="roaster">${esc(c.roaster !== 'Unknown roaster' ? c.roaster : '')}</div><b>${esc(c.name)}</b>
      <div class="small muted">${[c.roast_level ? roastWord(c.roast_level) : null, c.process, days != null ? `${days} d off roast` : null].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="specline" style="margin-top:4px"><span>${r.my.n} brew${r.my.n === 1 ? '' : 's'}</span>${r.my.best?.rating ? `<span>best ${Number(r.my.best.rating).toFixed(1)} · ${ratioStr(r.my.best.ratio)} · ${esc(methodName(r.my.best.method))}</span>` : ''}${r.my.last ? `<span>${timeAgo(r.my.last.created_at)}</span>` : ''}</div></div></a>`
  }
}
async function historyTab() {
  const rows = await brews.mine(100)
  const el = $('body')
  if (!rows.length) { el.innerHTML = `<div class="empty">No brews yet. The first one is the hardest.<br><a class="btn primary" href="#/brew" style="margin-top:12px">Start a brew</a></div>`; return }
  const byDay = {}
  for (const b of rows) { const d = new Date(b.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); (byDay[d] ??= []).push(b) }
  el.innerHTML = Object.entries(byDay).map(([d, list]) => `<div class="section" style="margin-top:14px"><div class="eyebrow">${esc(d)}</div><div class="list" style="margin-top:8px">${list.map(b => `<a class="card row" href="#/b/${b.id}">
      <div class="rating-big" style="font-size:26px;min-width:56px">${b.rating != null ? Number(b.rating).toFixed(1) : '—'}</div>
      <div style="min-width:0;flex:1"><b>${esc(b.coffees?.name || 'No coffee')}</b><div class="specline"><span>${esc(methodName(b.method))}</span><span>${String(b.dose_g).replace(/\.0$/, '')} → ${Math.round(b.water_g)} g</span><span>${ratioStr(b.ratio)}</span>${b.temp_c ? `<span>${b.temp_c} °C</span>` : ''}${b.total_seconds ? `<span>${fmtT(b.total_seconds)}</span>` : ''}</div>${b.notes ? `<div class="taste small">“${esc(b.notes)}”</div>` : ''}</div>${icon(I.chev)}</a>`).join('')}</div></div>`).join('')
}
async function savedTab() {
  const rows = await social.savedRecipes()
  const el = $('body')
  el.innerHTML = rows.length ? `<div class="list">${rows.map(b => postCard(b)).join('')}</div>` : `<div class="empty">Save a recipe from the feed or a coffee page and it lives here.</div>`
  bindPosts(el)
}
