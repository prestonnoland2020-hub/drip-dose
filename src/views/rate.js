// RATE — how was it, in numbers the community can learn from. Then one change for next time.
import { mount, top, esc, icon, I, $, toast, stars, fmtT, ratioStr, sheet, closeSheet } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import * as brews from '../api/brews.js'
import * as library from '../api/library.js'
import * as profile from '../api/profile.js'
import { FEEDBACK, nextTime } from '../feedback.js'
import { methodName } from './_shared.js'

const DIMS = [['acidity', 'Acidity'], ['sweetness', 'Sweetness'], ['body', 'Body'], ['clarity', 'Clarity'], ['balance', 'Balance']]

export async function render({ params }) {
  const id = params[0]
  const brew = id === 'local' ? state.draft : await brews.get(id)
  if (!brew) { location.hash = '#/home'; return }
  const me = uid() ? await profile.me().catch(() => null) : null
  const lastGrind = uid() ? (await brews.mine(5).catch(() => [])).find(b => b.grind_setting)?.grind_setting : null
  const v = { rating: brew.rating ?? 7.5, dims: {}, feedback: new Set(brew.feedback || []), notes: brew.notes || '', photo: null, pub: brew.public !== false }
  for (const [k] of DIMS) v.dims[k] = brew[k] ?? 0
  mount(`${top('', { back: '#/home' })}
    <div class="eyebrow">${esc(state.coffee?.name || brew.coffees?.name || 'Your brew')} · ${esc(methodName(brew.method))} · ${fmtT(brew.total_seconds || 0)}</div>
    <h1 style="margin-top:2px">How was it?</h1>
    <div class="rating-big" id="big">${v.rating.toFixed(1)}<small>/10</small></div>
    <input type="range" id="rating" min="1" max="10" step="0.1" value="${v.rating}" aria-label="Rating out of 10">
    <div class="section stack" style="gap:10px" id="dims">${DIMS.map(([k, l]) => `<div class="dim"><span>${l}</span><div class="stars" data-dim="${k}">${[1, 2, 3, 4, 5].map(n => `<button aria-pressed="${v.dims[k] >= n}" data-n="${n}" aria-label="${l} ${n}">★</button>`).join('')}</div></div>`).join('')}</div>
    <div class="section grid2"><div class="field"><label for="grind">Grind setting${me?.equipment?.grinder ? ` on your ${esc(me.equipment.grinder)}` : ''}</label><input class="input" id="grind" placeholder="e.g. 18" value="${esc(brew.grind_setting || lastGrind || '')}"></div><div class="field"><label>Water temp</label><div class="input" style="display:flex;align-items:center">${brew.temp_c ? brew.temp_c + ' °C' : '—'}</div></div></div>
    <div class="section field"><label for="notes">Tasting notes</label><textarea class="input" id="notes" placeholder="Blueberry, super sweet, very clean.">${esc(v.notes)}</textarea></div>
    <div class="section"><h3>What should we change next time?</h3><div class="chips" id="fb" style="margin-top:8px">${FEEDBACK.map(f => `<button class="chip" data-f="${f.id}" aria-pressed="${v.feedback.has(f.id)}">${f.label}</button>`).join('')}</div></div>
    <div class="section row between"><label class="row"><input type="file" id="photo" accept="image/*" hidden><button class="btn sm" id="addphoto">${icon(I.camera)} Add a photo</button><span class="small muted" id="photoname"></span></label><label class="row small"><input type="checkbox" id="pub" ${v.pub ? 'checked' : ''}> Share with the community</label></div>
    <div class="section"><button class="btn primary big" id="save">Save brew</button></div>`)
  $('rating').oninput = e => { v.rating = Number(e.target.value); $('big').innerHTML = `${v.rating.toFixed(1)}<small>/10</small>` }
  $('dims').querySelectorAll('.stars').forEach(row => row.querySelectorAll('button').forEach(b => b.onclick = () => { const n = Number(b.dataset.n); v.dims[row.dataset.dim] = v.dims[row.dataset.dim] === n ? 0 : n; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', v.dims[row.dataset.dim] >= Number(x.dataset.n))) }))
  $('fb').querySelectorAll('.chip').forEach(b => b.onclick = () => {
    const f = b.dataset.f
    if (f === 'just_right') { v.feedback.clear(); v.feedback.add(f) } else { v.feedback.delete('just_right'); v.feedback.has(f) ? v.feedback.delete(f) : v.feedback.add(f) }
    $('fb').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', v.feedback.has(x.dataset.f)))
  })
  $('addphoto').onclick = () => $('photo').click()
  $('photo').onchange = e => { v.photo = e.target.files?.[0] || null; $('photoname').textContent = v.photo ? 'Photo attached' : '' }
  $('save').onclick = async () => {
    $('save').disabled = true
    const feedback = [...v.feedback]
    const next = nextTime(feedback, { grind_microns: brew.ai_recipe?.grind_microns, grinder: me?.equipment?.grinder || null, temp_c: brew.temp_c, ratio: Number(brew.ratio || (brew.water_g / brew.dose_g)) })
    const patch = { rating: v.rating, ...v.dims, notes: $('notes').value.trim() || null, feedback, next_time: next, public: $('pub').checked,
      grind_setting: $('grind').value.trim() || null, grinder: me?.equipment?.grinder || null, brewer: me?.equipment?.brewer || null }
    for (const k in patch) if (DIMS.some(([d]) => d === k) && !patch[k]) patch[k] = null
    try {
      if (v.photo && uid()) { patch.photo_path = await brews.uploadPhoto(await shrinkFile(v.photo)) }
      if (id !== 'local') await brews.update(id, patch)
      else set({ draft: { ...brew, ...patch } })
      if (uid() && brew.coffee_id && v.rating >= 8.5) library.set(brew.coffee_id, { status: 'favorite' }).catch(() => {})
      showNext(next, id)
    } catch (e) { console.error(e); toast('Could not save — ' + (e.message || 'try again')); $('save').disabled = false }
  }
}

function showNext(next, id) {
  const p = sheet(`<div class="eyebrow">Saved</div><h2 style="margin-top:4px">Next time</h2>
    ${next?.change ? `<div class="card accent" style="margin:10px 0"><b style="font-size:18px">${esc(next.change.text)}</b></div>` : next ? `<div class="card accent" style="margin:10px 0"><b style="font-size:18px">Keep everything the same</b></div>` : ''}
    <p class="muted">${esc(next?.why || 'Rate the cup and tell POR what was off, and it will suggest one change for the next brew.')}</p>
    ${next?.also?.length ? `<p class="small muted">${esc(next.also[0])}</p>` : ''}
    <div class="grid2" style="margin-top:8px"><a class="btn" href="${id === 'local' ? '#/home' : '#/b/' + id}">See the brew</a><a class="btn primary" href="#/home">Done</a></div>`)
  p.querySelectorAll('a').forEach(a => a.addEventListener('click', closeSheet))
}
function shrinkFile(file, max = 1400) {
  return new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(url); const sc = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); cv.toBlob(b => res(b), 'image/jpeg', 0.85) }; img.onerror = rej; img.src = url })
}
