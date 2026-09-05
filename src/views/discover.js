// DISCOVER — what people are brewing, what's rated, what's new.
import { mount, top, esc, icon, I, $, bagImg, roastWord, ratioStr, timeAgo } from '../ui.js'
import { supa } from '../supa.js'
import { imageUrl } from '../api/coffees.js'
import * as social from '../api/social.js'
import { postCard, bindPosts, methodName } from './_shared.js'
import { METHODS } from '../methods.js'

export async function render({ query }) {
  mount(`${top('Discover')}
    <div class="field"><input class="input" id="q" placeholder="Coffee, roaster, origin" value="${esc(query.roaster || '')}" autocomplete="off"></div>
    <div class="chips" id="filters" style="margin:10px 0 4px">${[['', 'All'], ...METHODS.slice(0, 6).map(m => [m.id, m.name])].map(([k, l]) => `<button class="chip" data-m="${k}" aria-pressed="${(query.method || '') === k}">${l}</button>`).join('')}</div>
    <div class="chips" id="roastf">${[['', 'Any roast'], ['light', 'Light'], ['medium', 'Medium'], ['dark', 'Dark']].map(([k, l]) => `<button class="chip" data-r="${k}" aria-pressed="${(query.roast || '') === k}">${l}</button>`).join('')}</div>
    <div id="body"><div class="skeleton" style="margin-top:16px"></div></div>`)
  let t = 0
  $('q').oninput = () => { clearTimeout(t); t = setTimeout(() => load(), 250) }
  $('filters').querySelectorAll('.chip').forEach(b => b.onclick = () => { $('filters').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b)); load() })
  $('roastf').querySelectorAll('.chip').forEach(b => b.onclick = () => { $('roastf').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b)); load() })
  load()
}

async function load() {
  const c = await supa()
  const q = $('q').value.trim(), method = $('filters').querySelector('[aria-pressed="true"]')?.dataset.m || '', roast = $('roastf').querySelector('[aria-pressed="true"]')?.dataset.r || ''
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const [{ data: coffees }, { data: stats }, { data: week }] = await Promise.all([
    c.from('coffees').select('id, roaster, name, origin, process, roast_level, blend, decaf, image_path, tasting_notes, created_at').order('created_at', { ascending: false }).limit(200),
    c.from('coffee_stats').select('*'),
    c.from('brews').select('coffee_id, method, rating, created_at').eq('public', true).gte('created_at', since),
  ])
  const S = Object.fromEntries((stats || []).map(s => [s.coffee_id, s]))
  const weekBy = {}
  for (const b of week || []) { if (!b.coffee_id) continue; if (method && b.method !== method) continue; weekBy[b.coffee_id] = (weekBy[b.coffee_id] || 0) + 1 }
  const bucket = r => !r ? '' : /light/.test(r) ? 'light' : /dark/.test(r) ? 'dark' : 'medium'
  let all = (coffees || []).map(x => ({ ...x, image_url: imageUrl(x.image_path), s: S[x.id] || { brews: 0, avg_rating: null }, week: weekBy[x.id] || 0 }))
  if (q) { const ql = q.toLowerCase(); all = all.filter(x => [x.roaster, x.name, x.origin, x.tasting_notes].some(v => v && v.toLowerCase().includes(ql))) }
  if (roast) all = all.filter(x => bucket(x.roast_level) === roast)
  if (method) all = all.filter(x => x.week > 0 || x.s.brews > 0)
  const trending = [...all].filter(x => x.week > 0).sort((a, b) => b.week - a.week).slice(0, 8)
  const top = [...all].filter(x => x.s.avg_rating != null && x.s.brews >= 2).sort((a, b) => b.s.avg_rating - a.s.avg_rating).slice(0, 8)
  const fresh = all.slice(0, 8)
  const roasters = {}
  for (const x of all) if (x.roaster && x.roaster !== 'Unknown roaster') { roasters[x.roaster] ??= { n: 0, brews: 0 }; roasters[x.roaster].n++; roasters[x.roaster].brews += x.s.brews }
  const topRoasters = Object.entries(roasters).sort((a, b) => b[1].brews - a[1].brews || b[1].n - a[1].n).slice(0, 8)

  const el = $('body')
  const row = x => `<a class="card row" href="#/coffee/${x.id}" style="min-width:0">${bagImg(x)}<div style="min-width:0;flex:1"><div class="roaster">${esc(x.roaster !== 'Unknown roaster' ? x.roaster : '')}</div><b>${esc(x.name)}</b><div class="small muted">${[x.blend ? 'Blend' : x.origin, x.roast_level ? roastWord(x.roast_level) : null].filter(Boolean).map(esc).join(' · ')}</div></div><div style="text-align:right" class="small"><b class="num">${x.s.avg_rating ?? '—'}</b><div class="muted">${x.s.brews} brew${x.s.brews === 1 ? '' : 's'}</div></div></a>`
  const sec = (title, list, empty) => `<div class="section"><div class="section-h"><h2>${title}</h2></div>${list.length ? `<div class="list">${list.map(row).join('')}</div>` : `<div class="small muted">${empty}</div>`}</div>`
  if (q || roast || method) {
    el.innerHTML = all.length ? `<div class="list" style="margin-top:14px">${all.slice(0, 30).map(row).join('')}</div>` : `<div class="empty">Nothing matches. Scan a bag to add it.</div>`
    return
  }
  el.innerHTML = `
    ${sec('Most brewed this week', trending, 'Quiet week so far.')}
    ${sec('Highest rated', top, 'Needs a couple of rated brews per coffee first.')}
    ${sec('New coffees', fresh, 'No coffees yet — scan the first bag.')}
    ${topRoasters.length ? `<div class="section"><div class="section-h"><h2>Popular roasters</h2></div><div class="chips">${topRoasters.map(([r, v]) => `<a class="chip" href="#/discover?roaster=${encodeURIComponent(r)}">${esc(r)} <span class="muted">${v.n}</span></a>`).join('')}</div></div>` : ''}
    <div class="section"><div class="section-h"><h2>Popular recipes</h2></div><div id="recipes" class="list"><div class="skeleton"></div></div></div>`
  const rows = await social.feed(10).catch(() => [])
  const rs = $('recipes'); if (!rs) return
  rs.innerHTML = rows.length ? rows.sort((a, b) => (b.rating || 0) - (a.rating || 0)).map(b => postCard(b)).join('') : `<div class="small muted">No shared brews yet.</div>`
  bindPosts(rs)
}
