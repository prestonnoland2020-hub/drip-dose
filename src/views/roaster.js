// ROASTER — one roaster's current menu, with photos, straight from their own shop.
// Nothing here costs a model call: the shop feed is public and synced at most once a day.
import { mount, top, esc, icon, I, $, bagImg, roastWord } from '../ui.js'
import * as coffees from '../api/coffees.js'

export async function render({ params, query }) {
  const id = params[0] && params[0] !== 'by' ? params[0] : null
  const name = query.name || (params[0] === 'by' ? decodeURIComponent(params[1] || '') : null)
  mount(`${top('', { back: '#/discover?tab=roasters' })}<div id="head"><div class="skeleton" style="height:64px"></div></div><div id="body"><div class="skeleton" style="margin-top:14px"></div><div class="skeleton"></div></div>`)
  let data
  try { data = await coffees.catalog(id ? { roaster_id: id } : { roaster: name }) }
  catch (e) {
    // Not in the directory: fall back to whatever coffees we already hold under that name.
    const list = name ? await coffees.byRoaster(name).catch(() => []) : []
    data = { roaster: { name: name || 'Roaster' }, coffees: list, error: 'unknown_roaster' }
  }
  const r = data.roaster || {}
  const list = data.coffees || []
  const site = r.website ? `https://${String(r.website).replace(/^https?:\/\//, '')}` : null
  $('head').innerHTML = `<div class="row" style="gap:14px;align-items:center;margin-top:6px">
      ${r.logo_url ? `<img src="${esc(r.logo_url)}" alt="" style="width:56px;height:56px;border-radius:14px;object-fit:cover;background:var(--bg-3);border:1px solid var(--line)">` : `<div class="bag" style="width:56px;height:56px">${icon(I.bag)}</div>`}
      <div style="min-width:0"><h1 style="margin:0;font-size:24px;line-height:1.15">${esc(r.name || name)}</h1><div class="small muted">${[r.city, r.country].filter(Boolean).map(esc).join(', ')}${site ? `${r.city || r.country ? ' · ' : ''}<a href="${esc(site)}" target="_blank" rel="noopener" style="color:var(--accent)">Website ↗</a>` : ''}</div></div>
    </div>`
  const el = $('body')
  if (!list.length) {
    el.innerHTML = `<div class="empty" style="margin-top:16px">${data.error === 'no_feed' || !site
      ? `No menu online for ${esc(r.name || name)} yet. Scan one of their bags and it appears here.`
      : `Nothing on their menu right now.`}</div>`
    return
  }
  const money = c => c.price != null ? `${({ USD: '$', GBP: '£', EUR: '€', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', JPY: '¥' })[c.currency] ?? (c.currency ? c.currency + ' ' : '')}${Number(c.price) % 1 ? Number(c.price).toFixed(2) : Number(c.price)}` : ''
  el.innerHTML = `<div class="small muted" style="margin:14px 0 10px">${list.length} coffee${list.length === 1 ? '' : 's'} on the menu${r.catalog_synced_at ? ' · from their shop' : ''}</div>
    <div class="tiles">${list.map(c => `<a class="tile" href="#/coffee/${c.id}">
      <div class="tile-img">${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : icon(I.bag)}</div>
      <b>${esc(c.name)}</b>
      <div class="small muted">${[c.blend ? 'Blend' : c.origin, c.roast_level ? roastWord(c.roast_level) : null, c.process].filter(Boolean).slice(0, 2).map(esc).join(' · ') || '&nbsp;'}</div>
      ${money(c) ? `<div class="small" style="margin-top:2px">${money(c)}</div>` : ''}
    </a>`).join('')}</div>`
}
