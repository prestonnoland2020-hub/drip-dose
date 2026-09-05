// RECIPE — "here's how I'd brew this", with the reasoning and the sources.
import { mount, top, esc, icon, I, $, toast, bagImg, coffeeTitle, ratioStr, fmtT, tempBoth } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import { byId } from '../methods.js'
import * as coffees from '../api/coffees.js'
import * as profile from '../api/profile.js'
import { recipeSpec, stepsList, confidenceTag } from './_shared.js'

let me = null
export async function render() {
  const c = state.coffee, M = byId(state.method)
  mount(`${top('', { back: '#/brew' })}
    <div class="eyebrow">Your recommended brew</div>
    <h1 style="margin-top:2px">${esc(M.name)}</h1>
    ${c ? `<a href="#/coffee/${c.id}" class="row" style="margin-bottom:14px">${bagImg(c)}<div style="min-width:0">${coffeeTitle(c)}</div></a>` : `<div class="small muted" style="margin-bottom:14px">No coffee chosen — method defaults for a ${esc(state.roast)} roast.</div>`}
    <div id="body"><div class="skeleton" style="min-height:140px"></div></div>`)
  me = uid() ? await profile.me().catch(() => null) : null
  load()
}

async function load() {
  const c = state.coffee, M = byId(state.method)
  const el = $('body')
  let rec
  if (state.rec?.local && state.rec.recipe?.method === state.method && state.rec.recipe?.dose === state.dose) rec = state.rec
  else try {
    rec = await coffees.recommend({ coffee_id: c?.id ?? null, method: state.method, dose: state.dose, roast: state.roast, equipment: me?.equipment || {}, prefs: me?.prefs || {} })
  } catch (e) {
    // Offline or signed-out fallback: method defaults, computed here.
    const water = Math.round(state.dose * M.ratio / 5) * 5
    const temp = { light: 96, medium: 93, dark: 88 }[state.roast] ?? 93
    const steps = M.steps(state.dose, water)
    rec = { recipe: { method: M.id, method_name: M.name, dose: state.dose, water, ratio: M.ratio, temp: M.cold ? 20 : temp, temp_note: M.cold ? 'Room temperature' : null, grind_label: M.grind, steps, total: steps[steps.length - 1].t[1] },
      why: `${M.name} defaults for a ${state.roast} roast. Sign in and add the bag for a recipe worked out for the coffee.`, confidence: 'low', sources: [{ kind: 'reference', text: 'Method defaults' }], changed: [], community: null }
  }
  set({ rec })
  const r = rec.recipe
  el.innerHTML = `
    ${recipeSpec(r, state.units)}
    <div class="row between" style="margin:12px 0 4px"><span class="small muted">Grind: <b>${esc(r.grind_hint || r.grind_label)}</b>${r.grind_microns ? ` · ${r.grind_microns} µm` : ''}</span>${confidenceTag(rec.confidence)}</div>
    <div class="section"><div class="eyebrow"><b>Recipe</b></div>${stepsList(r.steps)}</div>
    <div style="margin:18px 0 6px"><a class="btn primary big" href="#/timer" id="start">${icon(I.play)} Start brew</a></div>
    <div class="grid2" style="margin-bottom:22px"><button class="btn" id="adjust">Adjust</button>${c ? `<a class="btn" href="#/coffee/${c.id}">Community brews</a>` : `<a class="btn" href="#/add">Add the coffee</a>`}</div>
    <div class="section"><h3>Why this recipe?</h3><div class="why">${esc(rec.why)}</div></div>
    ${rec.changed?.length ? `<div class="section"><h3>Changed from last time</h3><dl class="kv">${rec.changed.map(ch => `<dt>${esc(ch.var)} <span class="small muted">(${esc(ch.why)})</span></dt><dd>${esc(String(ch.from))} → ${esc(String(ch.to))}</dd>`).join('')}</dl></div>` : ''}
    ${rec.community ? `<div class="section"><h3>Community · ${esc(M.name)}</h3><dl class="kv"><dt>Brews</dt><dd>${rec.community.brews}</dd><dt>Average rating</dt><dd>${rec.community.avg_rating ?? '—'}</dd><dt>Most common ratio</dt><dd>${rec.community.common_ratio ? ratioStr(rec.community.common_ratio) : '—'}</dd><dt>Most common temp</dt><dd>${rec.community.common_temp ? rec.community.common_temp + ' °C' : '—'}</dd></dl></div>` : ''}
    <div class="section"><h3>Sources</h3><div class="sources">${(rec.sources || []).map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">↗ ${esc(s.text)}</a>` : `<span>· ${esc(s.text)}</span>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">POR does not search the web when it recommends. Roaster guidance is looked up once when a coffee is first scanned and saved with it; everything else is published brewing ranges, this community's brews, and your own.</p></div>`
  $('adjust').onclick = adjustSheet
}

async function adjustSheet() {
  const { sheet, closeSheet } = await import('../ui.js')
  const r = state.rec.recipe, M = byId(r.method)
  const p = sheet(`<h3>Adjust</h3><p class="small muted">Change one thing. The recipe is rebuilt for it.</p>
    <div class="stack" style="gap:14px;margin-top:10px">
      <div class="field"><label>Dose <b id="a-dose">${r.dose} g</b></label><input type="range" id="dose" min="8" max="60" step="0.5" value="${r.dose}"></div>
      <div class="field"><label>Ratio <b id="a-ratio">${ratioStr(r.ratio)}</b></label><input type="range" id="ratio" min="${M.ratioRange[0]}" max="${M.ratioRange[1]}" step="${M.yieldRatio ? 0.1 : 0.5}" value="${r.ratio}"></div>
      ${M.cold ? '' : `<div class="field"><label>Water <b id="a-temp">${r.temp} °C</b></label><input type="range" id="temp" min="80" max="100" step="1" value="${r.temp}"></div>`}
      <div class="field"><label>Roast (if the bag didn't say)</label><div class="seg" id="roast">${['light', 'medium', 'dark'].map(x => `<button data-r="${x}" aria-pressed="${state.roast === x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div></div>
      <button class="btn primary big" id="apply">Rebuild recipe</button></div>`)
  const paint = () => { p.querySelector('#a-dose').textContent = `${p.querySelector('#dose').value} g`; p.querySelector('#a-ratio').textContent = ratioStr(p.querySelector('#ratio').value); const t = p.querySelector('#temp'); if (t) p.querySelector('#a-temp').textContent = `${t.value} °C` }
  p.querySelectorAll('input[type=range]').forEach(i => i.oninput = paint)
  p.querySelectorAll('#roast button').forEach(b => b.onclick = () => { set({ roast: b.dataset.r }); p.querySelectorAll('#roast button').forEach(x => x.setAttribute('aria-pressed', x === b)) })
  p.querySelector('#apply').onclick = () => {
    const dose = Number(p.querySelector('#dose').value), ratio = Number(p.querySelector('#ratio').value), temp = p.querySelector('#temp') ? Number(p.querySelector('#temp').value) : r.temp
    const water = M.yieldRatio ? Math.round(dose * ratio * 10) / 10 : Math.round(dose * ratio / 5) * 5
    const steps = M.steps(dose, water, r.bloom ?? 2.5)
    const modified = { ...state.rec, recipe: { ...r, dose, water, ratio, temp, steps, total: steps[steps.length - 1].t[1] }, modifications: { dose: dose !== r.dose ? [r.dose, dose] : undefined, ratio: ratio !== r.ratio ? [r.ratio, ratio] : undefined, temp: temp !== r.temp ? [r.temp, temp] : undefined } }
    set({ dose, rec: { ...modified, local: true } }); closeSheet(); render()
  }
}
