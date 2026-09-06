// DISCOVER — one search box, three tabs, one list. Nothing else competes for the eye.
//   Coffees  — what people are brewing and rating, one ranked list
//   Brews    — recipes people have shared
//   Roasters — who's roasting, tap one to see their coffees
import { mount, top, esc, $, bagImg, roastWord } from '../ui.js'
import { supa } from '../supa.js'
import { imageUrl } from '../api/coffees.js'
import * as social from '../api/social.js'
import { postCard, bindPosts } from './shared.js'

const TABS = [['coffees', 'Coffees'], ['brews', 'Brews'], ['roasters', 'Roasters']]
let tab = 'coffees'

export async function render({ query }) {
  tab = TABS.some(t => t[0] === query.tab) ? query.tab : 'coffees'
  mount(`${top('Discover')}
    <div class="field"><input class="input" id="q" type="search" placeholder="Search coffees and roasters" value="${esc(query.roaster || '')}" autocomplete="off"></div>
    <div class="seg" id="tabs" style="margin:12px 0 4px">${TABS.map(([k, l]) => `<button data-t="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
    <div id="body"><div class="skeleton" style="margin-top:16px"></div></div>`)
  let t = 0
  $('q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250) }
  $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.t; $('tabs').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); load() })
  load()
}

async function load() {
  const c = await supa()
  const q = ($('q')?.value || '').trim().toLowerCase()
  const el = $('body'); if (!el) return

  if (tab === 'brews') {
    const rows = await social.feed(30).catch(() => [])
    const list = q ? rows.filter(b => [b.coffee?.name, b.coffee?.roaster, b.person?.display_name, b.person?.username].some(v => v && String(v).toLowerCase().includes(q))) : rows
    el.innerHTML = list.length ? `<div class="list" style="margin-top:14px">${list.map(b => postCard(b)).join('')}</div>` : `<div class="empty">No shared brews yet.</div>`
    bindPosts(el); return
  }

  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const [{ data: coffees }, { data: stats }, { data: week }] = await Promise.all([
    c.from('coffees').select('id, roaster, name, origin, roast_level, blend, image_path, tasting_notes, created_at').order('created_at', { ascending: false }).limit(300),
    c.from('coffee_stats').select('*'),
    c.from('brews').select('coffee_id').eq('public', true).gte('created_at', since),
  ])
  const S = Object.fromEntries((stats || []).map(s => [s.coffee_id, s]))
  const weekBy = {}
  for (const b of week || []) if (b.coffee_id) weekBy[b.coffee_id] = (weekBy[b.coffee_id] || 0) + 1
  const all = (coffees || []).map(x => ({ ...x, image_url: imageUrl(x.image_path), s: S[x.id] || { brews: 0, avg_rating: null }, week: weekBy[x.id] || 0 }))

  if (tab === 'roasters') {
    const by = {}
    for (const x of all) if (x.roaster && x.roaster !== 'Unknown roaster') { by[x.roaster] ??= { n: 0, brews: 0 }; by[x.roaster].n++; by[x.roaster].brews += x.s.brews }
    let list = Object.entries(by).sort((a, b) => b[1].brews - a[1].brews || b[1].n - a[1].n)
    if (q) list = list.filter(([r]) => r.toLowerCase().includes(q))
    el.innerHTML = list.length
      ? `<div class="list" style="margin-top:14px">${list.slice(0, 60).map(([r, v]) => `<a class="card row between" href="#/discover?roaster=${encodeURIComponent(r)}"><b>${esc(r)}</b><span class="small muted">${v.n} coffee${v.n === 1 ? '' : 's'}${v.brews ? ` · ${v.brews} brew${v.brews === 1 ? '' : 's'}` : ''}</span></a>`).join('')}</div>`
      : `<div class="empty">No roasters match.</div>`
    return
  }

  // Coffees: one list. Brewed this week floats up, then rating, then newest.
  let list = q ? all.filter(x => [x.roaster, x.name, x.origin, x.tasting_notes].some(v => v && v.toLowerCase().includes(q))) : all
  list = [...list].sort((a, b) => (b.week - a.week) || ((b.s.avg_rating || 0) - (a.s.avg_rating || 0)) || (b.s.brews - a.s.brews) || (a.created_at < b.created_at ? 1 : -1))
  const row = x => `<a class="card row" href="#/coffee/${x.id}" style="min-width:0">${bagImg(x)}<div style="min-width:0;flex:1"><div class="roaster">${esc(x.roaster !== 'Unknown roaster' ? x.roaster : '')}</div><b>${esc(x.name)}</b><div class="small muted">${[x.blend ? 'Blend' : x.origin, x.roast_level ? roastWord(x.roast_level) : null].filter(Boolean).map(esc).join(' · ')}</div></div>${x.s.brews ? `<div style="text-align:right" class="small"><b class="num">${x.s.avg_rating ?? '—'}</b><div class="muted">${x.week ? `${x.week} this week` : `${x.s.brews} brew${x.s.brews === 1 ? '' : 's'}`}</div></div>` : ''}</a>`
  el.innerHTML = list.length ? `<div class="list" style="margin-top:14px">${list.slice(0, 40).map(row).join('')}</div>` : `<div class="empty">${q ? 'Nothing matches. Scan the bag to add it.' : 'No coffees yet — scan the first bag.'}</div>`
}
