// YOUR SETUP — the gear you brew with. First sign-in lands here (skippable); Profile links here.
import { mount, top, esc, icon, I, $, toast, sheet, closeSheet } from '../ui.js'
import { uid } from '../supa.js'
import * as setup from '../api/setup.js'
import { byId, ICON } from '../methods.js'

function shrink(file, max = 800) {
  return new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(url); const sc = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.8).split(',')[1]) }; img.onerror = rej; img.src = url })
}

export async function render({ query }) {
  if (!uid()) { location.hash = '#/signin'; return }
  const first = query.first === '1'
  const items = await setup.get()
  mount(`${top('', { back: first ? null : '#/profile' })}
    <div class="eyebrow">${first ? 'One more thing' : 'Profile'}</div>
    <h1 style="margin-top:2px">Your setup</h1>
    <p class="muted" style="margin:0 0 14px">Tell POR your grinder and it gives you a setting, not a vague “medium-fine”. Add as much gear as you like; pick what you're using at brew time.</p>
    <div class="grid2" style="margin-bottom:14px"><button class="btn primary" id="photo">${icon(I.camera)} Photo of it</button><button class="btn" id="type">${icon(I.search)} Search</button></div>
    <input type="file" id="cam" accept="image/*" capture="environment" hidden>
    <div id="search" hidden><div class="field"><input class="input" id="q" placeholder="OXO, Baratza Encore, V60, Chemex…" autocomplete="off"></div><div id="results" class="list" style="margin-top:8px"></div></div>
    <div id="items" class="list" style="margin-top:14px">${itemsHtml(items)}</div>
    ${first ? `<div class="section"><a class="btn primary big" href="#/home" id="done">Done</a><div style="text-align:center;margin-top:10px"><a class="small muted" href="#/home" id="skip">Skip for now</a></div></div>` : ''}`)
  $('type').onclick = () => { $('search').hidden = false; $('q').focus() }
  $('photo').onclick = () => $('cam').click()
  $('cam').onchange = e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fromPhoto(f) }
  let t = 0
  $('q').oninput = () => { clearTimeout(t); t = setTimeout(doSearch, 200) }
  $('skip')?.addEventListener('click', () => { try { localStorage.setItem('por.setupSkipped', '1') } catch {} })
  bindItems()
}

function itemsHtml(items) {
  if (!items.length) return `<div class="empty">Nothing yet. A grinder is the one that matters most.</div>`
  const groups = setup.KINDS.map(([k, l]) => [k, l, items.filter(i => i.kind === k)]).filter(([, , g]) => g.length)
  return groups.map(([k, l, g]) => `<div><div class="eyebrow" style="margin-bottom:6px">${l}${g.length > 1 ? ' · tap to make active' : ''}</div><div class="list">${g.map(i => `<div class="card row" data-item="${i.id}" style="padding:12px 14px">
      ${i.kind === 'brewer' && i.method ? icon(ICON[byId(i.method).icon]) : ''}<div style="flex:1;min-width:0"><b>${esc(i.name)}</b>${i.model ? `<div class="small muted">${esc(i.model)}</div>` : ''}</div>
      ${g.length > 1 ? `<span class="badge" style="${i.active ? '' : 'opacity:.35'}">${i.active ? 'Active' : 'Use'}</span>` : ''}<button class="iconbtn" data-rm="${i.id}" aria-label="Remove" style="width:32px;height:32px">${icon(I.x)}</button></div>`).join('')}</div></div>`).join('')
}
function bindItems() {
  $('items').querySelectorAll('[data-item]').forEach(el => el.onclick = async e => { if (e.target.closest('[data-rm]')) return; await setup.setActive(el.dataset.item); repaint() })
  $('items').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { await setup.remove(b.dataset.rm); repaint() })
}
async function repaint() { $('items').innerHTML = itemsHtml(await setup.get()); bindItems() }

async function doSearch() {
  const q = $('q').value; const el = $('results')
  const hits = await setup.search(q)
  el.innerHTML = hits.map((h, i) => `<button class="card row" data-i="${i}" style="text-align:left;padding:12px 14px"><div style="flex:1"><b>${esc(h.name)}</b><div class="small muted">${esc(h.sub)}</div></div>${icon(I.plus)}</button>`).join('')
    + (q.trim().length > 2 ? `<button class="card row" data-free="1" style="text-align:left;padding:12px 14px"><div style="flex:1"><b>Add “${esc(q.trim())}”</b><div class="small muted">Not in the catalogue — POR will still say finer or coarser</div></div>${icon(I.plus)}</button>` : '')
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => { await addHit(hits[+b.dataset.i]); $('q').value = ''; el.innerHTML = '' })
  el.querySelector('[data-free]')?.addEventListener('click', () => kindSheet(q.trim()))
}
async function addHit(h) {
  await setup.add(h.kind === 'grinder' ? { kind: 'grinder', catalog_id: h.catalog_id, name: h.name } : h.kind === 'brewer' ? { kind: 'brewer', method: h.method, name: h.name } : { kind: h.kind, name: h.name })
  toast(`${h.name} added`); repaint()
}
function kindSheet(name, preset = null) {
  const p = sheet(`<h3>What is “${esc(name)}”?</h3><div class="list" style="margin-top:8px">${setup.KINDS.map(([k, l]) => `<button class="chip" data-k="${k}" style="justify-content:flex-start;min-height:46px">${l}</button>`).join('')}</div>`)
  p.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => { await setup.add({ kind: b.dataset.k, name, ...(preset || {}) }); closeSheet(); toast(`${name} added`); $('q').value = ''; $('results').innerHTML = ''; repaint() })
}

async function fromPhoto(file) {
  const p = sheet(`<h3>Looking…</h3><div class="skeleton" style="min-height:80px"></div>`)
  try {
    const out = await setup.identify(await shrink(file))
    const name = [out.brand, out.model].filter(Boolean).join(' ') || out.description || 'Unknown gear'
    if (out.grinder) {
      p.innerHTML = `<div class="eyebrow">Grinder</div><h2 style="margin-top:4px">${esc(out.grinder.brand)} ${esc(out.grinder.model)}</h2><p class="muted small">${esc(out.grinder.note || '')}</p><div class="grid2"><button class="btn" id="no">Not it</button><button class="btn primary" id="yes">${icon(I.check)} That's mine</button></div>`
      p.querySelector('#yes').onclick = async () => { await setup.add({ kind: 'grinder', catalog_id: out.grinder.id, name: `${out.grinder.brand} ${out.grinder.model}` }); closeSheet(); toast('Grinder added'); repaint() }
      p.querySelector('#no').onclick = () => { closeSheet(); $('search').hidden = false; $('q').value = out.brand || ''; $('q').focus(); doSearch() }
    } else if (out.method) {
      const m = byId(out.method)
      p.innerHTML = `<div class="eyebrow">Brewer</div><h2 style="margin-top:4px">${esc(m.name)}</h2><p class="muted small">${esc(name)}</p><div class="grid2"><button class="btn" id="no">Not it</button><button class="btn primary" id="yes">${icon(I.check)} That's mine</button></div>`
      p.querySelector('#yes').onclick = async () => { await setup.add({ kind: 'brewer', method: m.id, name: m.name, model: out.model ? name : null }); closeSheet(); toast('Brewer added'); repaint() }
      p.querySelector('#no').onclick = () => { closeSheet(); $('search').hidden = false; $('q').focus() }
    } else {
      p.innerHTML = `<h3>${esc(name)}</h3><p class="muted small">I can see it's ${esc(out.kind || 'coffee gear')}${out.candidates?.length ? ', probably one of these' : ", but it isn't in the catalogue yet"}.</p>
        <div class="list">${(out.candidates || []).map(g => `<button class="card row" data-g="${g.id}" data-n="${esc(g.brand + ' ' + g.model)}" style="text-align:left;padding:12px 14px"><b>${esc(g.brand)} ${esc(g.model)}</b></button>`).join('')}
        <button class="btn" id="free">Add as “${esc(name)}”</button><button class="btn ghost" id="no">Search instead</button></div>`
      p.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => { await setup.add({ kind: 'grinder', catalog_id: b.dataset.g, name: b.dataset.n }); closeSheet(); toast('Grinder added'); repaint() })
      p.querySelector('#free').onclick = () => { closeSheet(); kindSheet(name) }
      p.querySelector('#no').onclick = () => { closeSheet(); $('search').hidden = false; $('q').focus() }
    }
  } catch (err) {
    p.innerHTML = `<h3>Couldn't tell</h3><p class="muted">${esc(err.detail?.message || 'Try it on its own in good light, or search instead.')}</p><button class="btn" id="c">Close</button>`
    p.querySelector('#c').onclick = closeSheet
  }
}
