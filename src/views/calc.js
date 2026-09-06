// CALCULATOR — one grid, every box linked. Change any number and the rest follow.
//   Coffee (g) · Ratio · Water (g) · In the cup (g) · Caffeine (mg)
// "In the cup" is water minus what the grounds hold back (~2 g per g of coffee); for
// espresso the ratio is already in→out, so the cup is the water box. Caffeine comes
// from calc.js's extraction model at the method's usual brew time and your roast.
import { mount, top, $ } from '../ui.js'
import { state, set } from '../store.js'
import { byId, METHODS } from '../methods.js'
import { caffeine } from '../calc.js'

const ABSORB = 2   // g of water held per g of coffee in the bed

export async function render() {
  const M0 = byId(state.method)
  mount(`${top('Calculator', { back: '#/brew' })}
    <div class="card stack" style="gap:12px">
      <div class="field"><label>Method</label><select class="input" id="m">${METHODS.map(x => `<option value="${x.id}" ${x.id === M0.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>
      <div class="grid3">
        <div class="field"><label>Coffee (g)</label><input class="input num" id="dose" type="number" inputmode="decimal" value="${state.dose}"></div>
        <div class="field"><label>Ratio 1:</label><input class="input num" id="ratio" type="number" inputmode="decimal" step="0.5" value="${M0.ratio}"></div>
        <div class="field"><label>Water (g)</label><input class="input num" id="water" type="number" inputmode="decimal"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>In the cup (g)</label><input class="input num" id="cup" type="number" inputmode="decimal"></div>
        <div class="field"><label>Caffeine (mg)</label><input class="input num" id="caf" type="number" inputmode="decimal"></div>
      </div>
      <div class="small muted" id="note"></div>
    </div>`)

  const g = id => Number($(id).value) || 0
  const M = () => byId($('m').value)
  const perGram = () => { const m = M(); const steps = m.steps(20, 320); return caffeine({ dose: 1, method: m.id, roast: state.roast || 'medium', seconds: steps[steps.length - 1].t[1] }) }
  const r1 = n => Math.round(n * 10) / 10
  const setv = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v }

  // One edit, then everything derives from coffee + ratio.
  const paint = src => {
    const m = M(), pg = perGram()
    let dose = g('dose'), ratio = g('ratio') || m.ratio
    if (src === 'water') ratio = dose ? g('water') / dose : ratio
    if (src === 'cup') dose = m.yieldRatio ? g('cup') / ratio : g('cup') / Math.max(0.1, ratio - ABSORB)
    if (src === 'caf') dose = g('caf') / pg
    dose = Math.max(0, dose)
    const water = m.yieldRatio ? r1(dose * ratio) : Math.round(dose * ratio)
    const cup = m.yieldRatio ? water : Math.max(0, Math.round(water - dose * ABSORB))
    const caf = Math.round(dose * pg)
    setv('dose', r1(dose)); setv('ratio', r1(ratio)); setv('water', water); setv('cup', cup); setv('caf', caf)
    if (dose > 0) set({ dose: r1(dose) })
    $('note').textContent = `${m.name}: about ${Math.round(pg)} mg of caffeine per gram of coffee${m.yieldRatio ? '. Ratio here is coffee in to espresso out.' : `; the grounds keep back about ${ABSORB} g of water per gram.`}`
  }
  ;['dose', 'ratio', 'water', 'cup', 'caf'].forEach(id => $(id).oninput = () => paint(id))
  $('m').onchange = () => { document.activeElement?.blur?.(); const x = M(); $('ratio').value = x.ratio; set({ method: x.id }); paint('ratio') }
  paint('dose')
}
