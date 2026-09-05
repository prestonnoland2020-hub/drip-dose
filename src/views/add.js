// ADD COFFEE — photo, upload, search, or one you've brewed before.
// After a scan the person sees exactly what was read, with the AI's fields
// marked, and can fix anything before it goes anywhere.
import { mount, top, esc, icon, I, $, toast, bagImg, roastWord, sheet, closeSheet } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import * as coffees from '../api/coffees.js'
import * as library from '../api/library.js'

function shrink(file, max = 1024) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); const sc = Math.min(1, max / Math.max(img.width, img.height))
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc)
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.82).split(',')[1]) }
    img.onerror = rej; img.src = url
  })
}

let first = false
export async function render({ query }) {
  first = query.first === '1'
  mount(`${first ? `${top('')}<div class="eyebrow">Step 2 of 2</div><h1 style="margin-top:2px">Your first coffee</h1><p class="muted" style="margin:0 0 14px">Photograph the bag and POR reads it, works out the recipe for your setup, and you're brewing.</p>` : top('Add coffee', { back: '#/brew' })}
    <div class="grid2"><button class="btn primary" id="take">${icon(I.camera)} Scan bag</button><button class="btn" id="type">${icon(I.search)} Search</button></div>
    <div class="row" style="justify-content:center;margin:10px 0 4px"><button class="small muted" id="upload" style="min-height:36px">${icon(I.upload)} or upload a photo from your camera roll</button></div>
    <input type="file" id="cam" accept="image/*" capture="environment" hidden><input type="file" id="pick" accept="image/*" hidden>
    <div class="section" id="search"><div class="field"><input class="input" id="q" placeholder="Roaster or coffee name — if the bag isn't with you" autocomplete="off"></div><div id="results" class="list" style="margin-top:10px"></div></div>
    <div class="section" id="mine"></div>
    <div class="section"><button class="btn ghost" id="manual">${icon(I.plus)} Enter it by hand</button>${first ? `<div style="text-align:center;margin-top:12px"><a class="small muted" href="#/home" id="skipc">I'll do this later</a></div>` : ''}</div>`)
  $('skipc')?.addEventListener('click', () => { try { localStorage.setItem('por.coffeeSkipped', '1') } catch {} })
  $('take').onclick = () => { if (!uid()) return location.hash = '#/signin'; $('cam').click() }
  $('type').onclick = () => { $('q').focus(); $('q').scrollIntoView({ block: 'center', behavior: 'smooth' }) }
  $('upload').onclick = () => { if (!uid()) return location.hash = '#/signin'; $('pick').click() }
  $('cam').onchange = $('pick').onchange = e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scanFile(f) }
  let t = 0
  $('q').oninput = () => { clearTimeout(t); t = setTimeout(doSearch, 250) }
  $('manual').onclick = () => editSheet({}, async fields => { const c = await coffees.create(fields); await choose(c) })
  loadMine()
}

async function doSearch() {
  const q = $('q').value.trim(); const el = $('results')
  if (q.length < 2) { el.innerHTML = ''; return }
  const rows = await coffees.search(q)
  el.innerHTML = rows.length ? rows.map(c => coffeeRow(c)).join('') : `<div class="empty">Nothing yet for “${esc(q)}”. Scan the bag or enter it by hand.</div>`
  el.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => choose(await coffees.get(b.dataset.pick)))
}
function coffeeRow(c) {
  return `<button class="card row" data-pick="${c.id}" style="text-align:left">${bagImg(c)}<div style="min-width:0"><div class="roaster">${esc(c.roaster !== 'Unknown roaster' ? c.roaster : '')}</div><b>${esc(c.name)}</b><div class="small muted">${[c.blend ? 'Blend' : c.origin, c.process, c.roast_level ? roastWord(c.roast_level) : null].filter(Boolean).map(esc).join(' · ')}</div></div></button>`
}
async function loadMine() {
  if (!uid()) return
  const rows = await library.mine().catch(() => [])
  if (!rows.length) return
  $('mine').innerHTML = `<div class="section-h"><h2>Brewed before</h2></div><div class="list">${rows.slice(0, 6).map(r => coffeeRow(r.coffees)).join('')}</div>`
  $('mine').querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => choose(await coffees.get(b.dataset.pick)))
}

async function scanFile(file) {
  const p = sheet(`<h3>Reading the label…</h3><p class="muted small">Usually a few seconds.</p><div class="skeleton" style="min-height:120px"></div>`)
  try {
    const image = await shrink(file)
    const out = await coffees.scan(image, state.method, state.roast)
    closeSheet()
    confirmSheet(out)
  } catch (err) {
    const d = err.detail || {}
    const msg = err.code === 'limit_reached' ? `That's your ${d.scan_limit} free scans used.`
      : err.code === 'not_recognised' ? d.message
      : err.code === 'not_configured' ? 'Scanning is not switched on yet.'
      : /401|Incorrect API key/i.test(d.detail || '') ? 'Scanning is not connected — the API key is being rejected.'
      : err.code === 'vision_failed' ? 'The reader failed. Not your photo — try again in a moment.'
      : 'Scan failed — check your connection.'
    p.innerHTML = `<h3>Couldn't read that</h3><p class="muted">${esc(msg)}</p><button class="btn" id="sh-close">Close</button>`
    $('sh-close').onclick = closeSheet
  }
}

// What was detected, field by field. AI-read fields are marked; anything can be corrected.
function confirmSheet(out) {
  const c = out.coffee, src = c.field_sources || {}
  const tag = k => src[k] === 'user' ? '' : `<span class="tag ai">AI read</span>`
  const row = (label, k, v) => v ? `<div class="row between"><span class="muted small">${label}</span><span style="text-align:right">${esc(v)} ${tag(k)}</span></div>` : ''
  const p = sheet(`<div class="eyebrow">Detected coffee</div>
    <h2 style="margin-top:4px">${esc(c.name)}</h2>
    ${c.roaster && c.roaster !== 'Unknown roaster' ? `<div class="roaster">${esc(c.roaster)}</div>` : '<div class="small muted">Roaster not read from the bag</div>'}
    <div class="stack" style="margin:12px 0">
      ${row('Origin', 'origin', c.blend ? 'Blend' : c.origin)}${row('Process', 'process', c.process)}${row('Roast', 'roast_level', c.roast_level ? roastWord(c.roast_level) : null)}
      ${row('Variety', 'varietal', c.varietal)}${row('Altitude', 'altitude_m', c.altitude_m ? c.altitude_m + ' m' : null)}${row('Tasting notes', 'tasting_notes', c.tasting_notes)}
      ${!c.roast_level ? `<div class="small" style="color:var(--danger)">Roast wasn't printed on the bag. Set it below if you know it — the recipe depends on it.</div>` : ''}
    </div>
    <div class="grid2"><button class="btn" id="fix">${icon(I.edit)} Fix something</button><button class="btn primary" id="ok">${icon(I.check)} Looks right</button></div>
    <div class="small muted" style="margin-top:10px">${out.cache_hit ? 'Known coffee — recipe from saved research.' : 'New to POR — it has just been looked up.'} ${out.scans_used != null ? `${out.scans_used}/${out.scan_limit} scans used.` : ''}</div>`)
  $('ok').onclick = () => { closeSheet(); choose(c) }
  $('fix').onclick = () => editSheet(c, async fields => { const fixed = await coffees.correct(c.id, fields); await choose(fixed) })
}

function editSheet(c, onSave) {
  const f = (k, label, ph = '', type = 'text') => `<div class="field"><label>${label}</label><input class="input" name="${k}" type="${type}" value="${esc(c[k] ?? '')}" placeholder="${ph}"></div>`
  const p = sheet(`<h3>${c.id ? 'Correct the label' : 'Enter the coffee'}</h3><form id="ef" class="stack" style="gap:10px;margin-top:8px">
    ${f('roaster', 'Roaster', 'e.g. Onyx Coffee Lab')}${f('name', 'Coffee name', 'e.g. Geometry')}
    <div class="grid2">${f('origin', 'Origin', 'Ethiopia')}${f('process', 'Process', 'Washed / Natural')}</div>
    <div class="field"><label>Roast</label><select class="input" name="roast_level"><option value="">Not on the bag</option>${['light', 'medium-light', 'medium', 'medium-dark', 'dark', 'very-dark'].map(r => `<option value="${r}" ${c.roast_level === r ? 'selected' : ''}>${roastWord(r)}</option>`).join('')}</select></div>
    <div class="grid2">${f('varietal', 'Variety', 'Heirloom')}${f('altitude_m', 'Altitude (m)', '1900', 'number')}</div>
    ${f('tasting_notes', 'Tasting notes', 'blueberry, jasmine')}${f('roast_date', 'Roast date', '', 'date')}
    <div class="row" style="gap:16px"><label class="row"><input type="checkbox" name="blend" ${c.blend ? 'checked' : ''}> Blend</label><label class="row"><input type="checkbox" name="decaf" ${c.decaf ? 'checked' : ''}> Decaf</label></div>
    <button class="btn primary big" type="submit">Save</button></form>`)
  p.querySelector('#ef').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target); const fields = {}
    for (const [k, v] of fd.entries()) fields[k] = v === '' ? null : k === 'altitude_m' ? Number(v) : v
    fields.blend = fd.get('blend') === 'on'; fields.decaf = fd.get('decaf') === 'on'
    if (!fields.name) return toast('It needs a name')
    try { await onSave(fields); closeSheet() } catch (err) { toast('Could not save — ' + (err.message || 'try again')) }
  }
}

async function choose(c) {
  set({ coffee: c, rec: null })
  if (uid()) library.set(c.id, { status: 'drinking' }).catch(() => {})
  toast(`${c.name} is on the counter`)
  location.hash = first ? '#/recipe' : '#/brew'
}
