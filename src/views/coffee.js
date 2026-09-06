// COFFEE PAGE — permanent home for one coffee: what it is, how it's going for people, best recipes.
import { mount, top, esc, icon, I, $, toast, bagImg, coffeeTitle, coffeeMeta, ratioStr, fmtT, roastWord, sheet, closeSheet } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import * as coffees from '../api/coffees.js'
import * as brews from '../api/brews.js'
import * as social from '../api/social.js'
import * as library from '../api/library.js'
import { postCard, bindPosts, methodName } from './shared.js'

export async function render({ params }) {
  const id = params[0]
  const c = await coffees.get(id)
  if (!c) { mount(`${top('', { back: '#/discover' })}<div class="empty">That coffee isn't here.</div>`); return }
  const [s, lib, fol] = await Promise.all([coffees.stats(id), library.status(id), social.following('coffee')])
  const following = fol.has(id)
  mount(`${top('', { back: '#/discover' })}
    <div class="coffee-hero big">${c.image_url ? bagImg(c, true) : ''}
      <div>${coffeeTitle(c).replace('<h3>', '<h1 style="margin:0 0 4px">').replace('</h3>', '</h1>')}${coffeeMeta(c)}${c.tasting_notes ? `<div class="taste" style="margin-top:6px">${esc(c.tasting_notes)}</div>` : ''}</div>
    </div>
    <div class="stats" style="margin:16px 0"><div class="stat"><b>${s.overall.avg_rating ?? '—'}</b><span>Rating</span></div><div class="stat"><b>${s.overall.brews}</b><span>Brews</span></div><div class="stat"><b>${s.overall.brewers}</b><span>Brewers</span></div><div class="stat"><b>${c.roast_level ? roastWord(c.roast_level).split(' ')[0] : '—'}</b><span>Roast</span></div></div>
    <div class="grid2"><button class="btn primary" id="brew">${icon(I.play)} Brew this</button><button class="btn" id="lib">${lib ? `${icon(I.check)} ${esc(libLabel(lib))}` : `${icon(I.plus)} Add to library`}</button></div>
    <div class="chips" style="margin-top:10px"><button class="chip" id="follow" aria-pressed="${following}">${following ? 'Following' : 'Follow'}</button>${c.roaster && c.roaster !== 'Unknown roaster' ? `<a class="chip" href="#/roaster/by/${encodeURIComponent(c.roaster)}">More from ${esc(shortRoaster(c.roaster))}</a>` : ''}</div>
    ${c.product_url ? `<a class="card row between" href="${esc(c.product_url)}" target="_blank" rel="noopener" style="margin-top:12px"><div><b>Buy from ${esc(shortRoaster(c.roaster))}</b><div class="small muted">${c.price != null ? `${money(c)} · ` : ''}opens their shop</div></div>${icon(I.chev)}</a>` : ''}
    ${c.roaster_recipe || c.research?.advice ? `<div class="section"><h3>Roaster's guidance</h3><div class="why">${esc(c.roaster_recipe || c.research.advice)}</div></div>` : ''}
    ${s.byMethod.length ? `<div class="section"><div class="section-h"><h2>Community results</h2></div><div class="list">${s.byMethod.map(m => `<div class="card"><div class="row between"><b>${esc(methodName(m.method))}</b><span class="badge">${m.recommend_pct ?? 0}% recommend</span></div>
      <dl class="kv" style="margin-top:8px"><dt>Median rating</dt><dd>${m.median_rating ?? '—'}</dd><dt>Most common ratio</dt><dd>${m.common_ratio ? ratioStr(m.common_ratio) : '—'}</dd><dt>Most common temperature</dt><dd>${m.common_temp ? m.common_temp + ' °C' : '—'}</dd><dt>Most common grind</dt><dd>${esc(m.common_grind || '—')}</dd><dt>Average brew time</dt><dd>${m.avg_seconds ? fmtT(m.avg_seconds) : '—'}</dd><dt>Brews</dt><dd>${m.brews}</dd></dl></div>`).join('')}</div></div>` : ''}
    <div class="section"><div class="section-h"><h2>Best community recipes</h2></div><div id="recipes" class="list"><div class="skeleton"></div></div></div>
    <div class="section small muted">${provenance(c)}</div>`)
  $('brew').onclick = () => { set({ coffee: c, rec: null }); if (uid()) library.set(c.id, { status: 'drinking' }).catch(() => {}); location.hash = '#/brew' }
  $('lib').onclick = () => { if (!uid()) return location.hash = '#/signin'; libSheet(c, lib) }
  $('follow').onclick = async () => { if (!uid()) return location.hash = '#/signin'; const on = $('follow').getAttribute('aria-pressed') !== 'true'; $('follow').setAttribute('aria-pressed', on); $('follow').textContent = on ? 'Following' : 'Follow coffee'; await social.follow('coffee', c.id, on) }
  const rows = await brews.forCoffee(id, 10).then(social.decorateBrews).catch(() => [])
  $('recipes').innerHTML = rows.length ? rows.map(b => postCard(b, { showCoffee: false })).join('') : `<div class="empty">No rated brews yet. Brew it, rate it, and yours goes here.</div>`
  bindPosts($('recipes'))
}
// "Black & White Coffee Roasters" → "Black & White" where it has to fit on a chip.
const shortRoaster = r => String(r || '').replace(/\s+(coffee|caf[eé])?\s*(roasters|roasting|roastery|co\.?|company|lab)?\s*(co\.?|company)?$/i, '').trim() || r
const money = c => `${({ USD: '$', GBP: '£', EUR: '€', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', JPY: '¥' })[c.currency] ?? (c.currency ? c.currency + ' ' : '')}${Number(c.price) % 1 ? Number(c.price).toFixed(2) : Number(c.price)}`
function libLabel(s) { return { drinking: 'Drinking', finished: 'Finished', want: 'Want to try', favorite: 'Favourite' }[s] || s }
function libSheet(c, cur) {
  const p = sheet(`<h3>In your library</h3><div class="list" style="margin-top:8px">${[['drinking', 'Currently drinking'], ['favorite', 'Favourite'], ['want', 'Want to try'], ['finished', 'Finished']].map(([k, l]) => `<button class="chip" data-s="${k}" aria-pressed="${cur === k}" style="justify-content:flex-start;min-height:46px">${l}</button>`).join('')}${cur ? `<button class="btn ghost danger sm" id="rm">Remove from library</button>` : ''}</div>`)
  p.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { await library.set(c.id, { status: b.dataset.s }); closeSheet(); toast(`Marked as ${b.textContent.toLowerCase()}`); render({ params: [c.id] }) })
  p.querySelector('#rm')?.addEventListener('click', async () => { await library.remove(c.id); closeSheet(); render({ params: [c.id] }) })
}
function provenance(c) {
  const fs = c.field_sources || {}
  const user = Object.values(fs).filter(v => v === 'user').length
  return `Read from the bag${c.researched_at ? ', with a one-time look-up of the roaster\'s guidance' : ''}${user ? `, ${user} field${user > 1 ? 's' : ''} corrected by a brewer` : ''}. Nothing here is guessed: where the bag didn't say, the field is blank.`
}
