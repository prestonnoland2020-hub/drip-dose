// SETTINGS — the things the recommendation engine should know about you.
import { mount, top, esc, $, toast, icon, I } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import * as profile from '../api/profile.js'
import { METHODS } from '../methods.js'

export async function render() {
  if (!uid()) { location.hash = '#/signin'; return }
  const p = await profile.me()
  const e = p.equipment || {}, pr = p.prefs || {}
  const f = (k, label, v, ph = '') => `<div class="field"><label>${label}</label><input class="input" name="${k}" value="${esc(v ?? '')}" placeholder="${ph}"></div>`
  mount(`${top('You', { back: '#/profile' })}
    <form id="sf" class="stack" style="gap:12px">
      <div class="eyebrow"><b>01</b>Profile</div>
      ${f('display_name', 'Name', p.display_name)}${f('username', 'Username', p.username)}${f('bio', 'Bio', p.bio, 'One line')}
      <div class="field"><label>Favourite method</label><select class="input" name="favorite_method"><option value="">—</option>${METHODS.map(m => `<option value="${m.id}" ${p.favorite_method === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select></div>
      <div class="eyebrow" style="margin-top:10px"><b>02</b>Equipment</div>
      <a class="card row between" href="#/setup"><div><b>Your setup</b><div class="small muted">${esc([e.grinder, e.brewer].filter(Boolean).join(' · ') || 'Grinder, brewer, kettle…')}</div></div>${icon(I.chev)}</a>
      <div class="eyebrow" style="margin-top:10px"><b>03</b>Preferences</div>
      <div class="grid2">${f('p.dose', 'Usual dose (g)', pr.dose ?? state.dose)}<div class="field"><label>Units</label><select class="input" name="units"><option value="c" ${state.units === 'c' ? 'selected' : ''}>°C</option><option value="f" ${state.units === 'f' ? 'selected' : ''}>°F</option></select></div></div>
      <div class="field"><label>Strength</label><div class="seg" id="strength">${['lighter', 'balanced', 'stronger'].map(x => `<button type="button" data-v="${x}" aria-pressed="${(pr.strength || 'balanced') === x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div></div>
      <div class="field"><label>Taste</label><div class="seg" id="taste">${['bright', 'balanced', 'sweet'].map(x => `<button type="button" data-v="${x}" aria-pressed="${(pr.taste || 'balanced') === x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div></div>
      <button class="btn primary big" type="submit">Save</button>
      <div class="small muted">Plan: ${esc(p.plan || 'free')} · ${p.scans_used ?? 0}/${p.scan_limit ?? 5} scans used</div>
    </form>`)
  const seg = id => { const s = $(id); s.querySelectorAll('button').forEach(b => b.onclick = () => s.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b))); return () => s.querySelector('[aria-pressed="true"]')?.dataset.v }
  const gs = seg('strength'), gt = seg('taste')
  $('sf').onsubmit = async ev => {
    ev.preventDefault(); const fd = new FormData(ev.target); const patch = { equipment: {}, prefs: { strength: gs(), taste: gt() } }
    delete patch.equipment
    for (const [k, v] of fd.entries()) { if (k.startsWith('e.')) continue; else if (k === 'p.dose') patch.prefs.dose = Number(v) || null; else if (k === 'units') set({ units: v }); else patch[k] = v || null }
    try { await profile.update(patch); if (patch.prefs.dose) set({ dose: patch.prefs.dose }); toast('Saved'); location.hash = '#/profile' } catch (e) { toast(e.message?.includes('username') ? 'That username is taken' : 'Could not save') }
  }
}
