// Bits several views share: brew post card, method picker, dose stepper.
import { esc, icon, I, avatar, timeAgo, ratioStr, fmtT, tempStr, bagImg, roastWord, toast } from '../ui.js'
import { METHODS, byId, ICON } from '../methods.js'
import * as social from '../api/social.js'
import { uid } from '../supa.js'
import { state } from '../store.js'

export function methodName(id) { return byId(id).name }

export function postCard(b, { showCoffee = true } = {}) {
  const c = b.coffees
  const M = byId(b.method)
  return `<article class="post" data-brew="${b.id}">
    <div class="ph">
      <a href="#/user/${b.user_id}">${avatar(b.person)}</a>
      <div style="flex:1;min-width:0">
        <a href="#/user/${b.user_id}"><b>${esc(b.person?.display_name || b.person?.username || 'Someone')}</b></a>
        <div class="small muted">${timeAgo(b.created_at)} · ${esc(M.name)}</div>
      </div>
      ${b.rating != null ? `<div class="score">${Number(b.rating).toFixed(1)}<span class="small muted">/10</span></div>` : ''}
    </div>
    ${b.photo_url ? `<img class="photo" src="${esc(b.photo_url)}" alt="" loading="lazy">` : ''}
    <div class="body">
      ${showCoffee && c ? `<a href="#/coffee/${c.id}" class="row">${bagImg(c)}<div style="min-width:0"><div class="roaster">${esc(c.roaster !== 'Unknown roaster' ? c.roaster : '')}</div><b>${esc(c.name)}</b><div class="small muted">${[c.origin, c.process, c.roast_level ? roastWord(c.roast_level) : null].filter(Boolean).map(esc).join(' · ')}</div></div></a>` : ''}
      <div class="specline"><span>${esc(String(b.dose_g).replace(/\.0$/, ''))} g → ${Math.round(b.water_g)} g</span><span>${ratioStr(b.ratio)}</span>${b.temp_c ? `<span>${tempStr(b.temp_c, state.units)}</span>` : ''}${b.grind_setting || b.grind_label ? `<span>${esc(b.grind_setting || b.grind_label)}</span>` : ''}${b.total_seconds ? `<span>${fmtT(b.total_seconds)}</span>` : ''}</div>
      ${b.notes ? `<div class="taste">“${esc(b.notes)}”</div>` : ''}
    </div>
    <div class="actions">
      <button data-act="like" aria-pressed="${!!b.liked}">${icon(I.heart)} <span>${b.likes || ''}</span></button>
      <a href="#/b/${b.id}"><button data-act="comment">${icon(I.comment)} <span>${b.comments || ''}</span></button></a>
      <button data-act="save" aria-pressed="${!!b.saved}">${icon(I.bookmark)} <span>${b.saved ? 'Saved' : 'Save'}</span></button>
      <a href="#/b/${b.id}" style="margin-left:auto"><button>Brew ${icon(I.chev)}</button></a>
    </div>
  </article>`
}
export function bindPosts(root) {
  root.querySelectorAll('.post [data-act]').forEach(btn => btn.addEventListener('click', async e => {
    const act = btn.dataset.act; if (act === 'comment') return
    e.preventDefault()
    if (!uid()) { location.hash = '#/signin'; return }
    const id = btn.closest('.post').dataset.brew
    const on = btn.getAttribute('aria-pressed') !== 'true'
    btn.setAttribute('aria-pressed', on)
    const span = btn.querySelector('span')
    if (act === 'like') { span.textContent = Math.max(0, (parseInt(span.textContent) || 0) + (on ? 1 : -1)) || ''; await social.like(id, on) }
    if (act === 'save') { span.textContent = on ? 'Saved' : 'Save'; await social.saveRecipe(id, on); toast(on ? 'Recipe saved to your library' : 'Removed from saved') }
  }))
}

// Ten brewers in three short rows, not two screens of cards. The chosen one explains itself underneath.
export function methodGrid(selected) {
  const m = byId(selected)
  return `<div class="chips methods" role="radiogroup">${METHODS.map(x => `<button class="chip" role="radio" data-method="${x.id}" aria-pressed="${x.id === selected}" aria-checked="${x.id === selected}">${icon(ICON[x.icon])} ${esc(x.name)}</button>`).join('')}</div>
    <div class="small muted" id="method-note" style="margin-top:8px">${esc(m.kind)} · ${ratioStr(m.ratio)} · ${esc(m.note)}</div>`
}

export function doseStepper(dose, id = 'dose') {
  return `<div class="stepper"><button data-step="-1" aria-label="Less">−</button><div class="val" id="${id}-val">${esc(String(dose).replace(/\.0$/, ''))}<small>g</small></div><button data-step="1" aria-label="More">+</button></div>
    <div class="chips" style="margin-top:10px">${[['1 small cup', 12], ['1 mug', 15], ['2 cups', 20], ['3 cups', 30]].map(([l, v]) => `<button class="chip" data-preset="${v}" aria-pressed="${dose === v}">${l}<span class="muted" style="margin-left:4px">${v} g</span></button>`).join('')}</div>`
}
export function bindStepper(root, get, setv, id = 'dose') {
  const paint = () => { root.querySelector(`#${id}-val`).innerHTML = `${String(get()).replace(/\.0$/, '')}<small>g</small>`; root.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.preset) === get())) }
  root.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { setv(Math.max(5, Math.min(120, get() + Number(b.dataset.step)))); paint() })
  root.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { setv(Number(b.dataset.preset)); paint() })
}

export function recipeSpec(r, units = 'c') {
  const M = byId(r.method)
  return `<div class="spec">
    <div><b>${esc(String(r.dose).replace(/\.0$/, ''))}<small>g</small></b><span>Coffee</span></div>
    <div><b>${Math.round(r.water)}<small>g</small></b><span>${M.yieldRatio ? 'Out' : 'Water'}</span></div>
    <div><b>${M.cold ? 'Room' : units === 'f' ? Math.round(r.temp * 9 / 5 + 32) : r.temp}<small>${M.cold ? '' : units === 'f' ? '°F' : '°C'}</small></b><span>${M.cold ? 'Temp' : units === 'f' ? `${r.temp} °C` : `${Math.round(r.temp * 9 / 5 + 32)} °F`}</span></div>
    <div><b>${fmtT(r.total)}</b><span>${ratioStr(r.ratio)}</span></div>
  </div>`
}
export function stepsList(steps) {
  return `<div class="steps">${steps.map(s => `<div class="step"><span class="t">${fmtT(s.t[0])}</span><span>${esc(s.label)}${s.hint ? `<small>${esc(s.hint)}</small>` : ''}</span><span class="g">${s.target != null ? (s.type === 'pour' ? (s.label === 'Bloom' ? 'Bloom ' : 'To ') + Math.round(s.target) + ' g' : '') : ''}</span></div>`).join('')}</div>`
}
export function confidenceTag(c) { return `<span class="conf ${c}">${c} confidence</span>` }
