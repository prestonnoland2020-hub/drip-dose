// DISCOVER — one search box, three tabs, one list. Nothing else competes for the eye.
//   Coffees  — what people are brewing and rating, one ranked list
//   Brews    — recipes people have shared
//   Roasters — who's roasting, tap one to see their coffees
import { mount, top, esc, icon, I, $, bagImg, roastWord } from '../ui.js'
import { supa } from '../supa.js'
import { imageUrl } from '../api/coffees.js'
import * as social from '../api/social.js'
import { postCard, bindPosts } from './shared.js'

const row = x => `<a class="card row" href="#/coffee/${x.id}" style="min-width:0">${bagImg(x)}<div style="min-width:0;flex:1"><div class="roaster">${esc(x.roaster !== 'Unknown roaster' ? x.roaster : '')}</div><b>${esc(x.name)}</b><div class="small muted">${[x.blend ? 'Blend' : x.origin, x.roast_level ? roastWord(x.roast_level) : null].filter(Boolean).map(esc).join(' · ')}</div></div>${x.s?.brews ? `<div style="text-align:right" class="small"><b class="num">${x.s.avg_rating ?? '—'}</b><div class="muted">${x.week ? `${x.week} this week` : `${x.s.brews} brew${x.s.brews === 1 ? '' : 's'}`}</div></div>` : ''}</a>`

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

  if (tab === 'roasters') {
    // The directory itself, not just roasters we happen to have coffees for.
    const list = q ? await coffees.roasters(q, 40) : (await c.from('roasters').select('id, name, city, country, logo_url, catalog_count, tier').order('catalog_count', { ascending: false }).order('name').limit(80)).data || []
    el.innerHTML = list.length
      ? `<div class="list" style="margin-top:14px">${list.map(r => `<a class="card row" href="#/roaster/${r.id}" style="gap:12px;align-items:center">${r.logo_url ? `<img class="logo-sm" src="${esc(r.logo_url)}" alt="" loading="lazy">` : `<div class="logo-sm bag" style="display:flex;align-items:center;justify-content:center">${icon(I.bag)}</div>`}<div style="min-width:0;flex:1"><b>${esc(r.name)}</b><div class="small muted">${[r.city, r.country].filter(Boolean).map(esc).join(', ') || '&nbsp;'}</div></div><span class="small muted" style="white-space:nowrap">${r.catalog_count ? `${r.catalog_count} coffee${r.catalog_count === 1 ? '' : 's'}` : ''}</span></a>`).join('')}</div>`
      : `<div class="empty">No roasters match.</div>`
    return
  }

  if (q) {
    // Server-side fuzzy search across the whole catalogue — typos and word order are fine.
    const hits = await coffees.search(q, 40)
    el.innerHTML = hits.length ? `<div class="list" style="margin-top:14px">${hits.map(row).join('')}</div>` : `<div class="empty">Nothing matches. Scan the bag to add it.</div>`
    return
  }
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const [{ data: recent }, { data: stats }, { data: week }] = await Promise.all([
    c.from('coffees').select('id, roaster, name, origin, roast_level, blend, image_path, image_url, tasting_notes, created_at').eq('available', true).order('created_at', { ascending: false }).limit(300),
    c.from('coffee_stats').select('*'),
    c.from('brews').select('coffee_id').eq('public', true).gte('created_at', since),
  ])
  const S = Object.fromEntries((stats || []).map(s => [s.coffee_id, s]))
  const weekBy = {}
  for (const b of week || []) if (b.coffee_id) weekBy[b.coffee_id] = (weekBy[b.coffee_id] || 0) + 1
  const all = (recent || []).map(x => ({ ...x, image_url: pic(x), s: S[x.id] || { brews: 0, avg_rating: null }, week: weekBy[x.id] || 0 }))

  // Coffees: one list. Brewed this week floats up, then rating, then newest.
  const list = [...all].sort((a, b) => (b.week - a.week) || ((b.s.avg_rating || 0) - (a.s.avg_rating || 0)) || (b.s.brews - a.s.brews) || ((b.image_url ? 1 : 0) - (a.image_url ? 1 : 0)) || (a.created_at < b.created_at ? 1 : -1))
  el.innerHTML = list.length ? `<div class="list" style="margin-top:14px">${list.slice(0, 40).map(row).join('')}</div>` : `<div class="empty">${q ? 'Nothing matches. Scan the bag to add it.' : 'No coffees yet — scan the first bag.'}</div>`
}
