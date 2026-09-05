// CALCULATORS — ratio, water, dose, scaling; strength and extraction when you have a TDS reading.
import { mount, top, esc, $, ratioStr } from '../ui.js'
import { state, set } from '../store.js'
import { byId } from '../methods.js'
import { extraction, strengthWord, eyWord } from '../calc.js'
import { METHODS } from '../methods.js'

export async function render() {
  const M = byId(state.method)
  mount(`${top('Calculators', { back: '#/brew' })}
    <div class="card stack" style="gap:12px"><div class="eyebrow"><b>01</b>Ratio</div>
      <div class="field"><label>Method</label><select class="input" id="m">${METHODS.map(x => `<option value="${x.id}" ${x.id === M.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>
      <div class="grid3"><div class="field"><label>Coffee (g)</label><input class="input num" id="dose" type="number" inputmode="decimal" value="${state.dose}"></div><div class="field"><label>Ratio 1:</label><input class="input num" id="ratio" type="number" inputmode="decimal" step="0.5" value="${M.ratio}"></div><div class="field"><label>Water (g)</label><input class="input num" id="water" type="number" inputmode="decimal" value="${Math.round(state.dose * M.ratio)}"></div></div>
      <div class="small muted" id="r-note">Edit any box; the others follow. ${M.yieldRatio ? 'For espresso, water means beverage out.' : ''}</div></div>
    <div class="card stack" style="gap:12px;margin-top:12px"><div class="eyebrow"><b>02</b>Scale a recipe</div>
      <div class="grid2"><div class="field"><label>I want (g of coffee brewed)</label><input class="input num" id="want" type="number" inputmode="decimal" placeholder="500"></div><div class="field"><label>Use</label><div class="input num" id="scaled" style="display:flex;align-items:center">—</div></div></div></div>
    <div class="card stack" style="gap:12px;margin-top:12px"><div class="eyebrow"><b>03</b>Strength & extraction</div>
      <div class="grid2"><div class="field"><label>TDS % (refractometer)</label><input class="input num" id="tds" type="number" inputmode="decimal" step="0.01" placeholder="1.35"></div><div class="field"><label>Beverage weight (g), optional</label><input class="input num" id="bev" type="number" inputmode="decimal" placeholder="auto"></div></div>
      <div id="ey" class="small muted">Enter a TDS reading to see extraction yield. Without a refractometer, taste is the instrument: sour is under, bitter is over.</div></div>`)
  const g = id => Number($(id).value) || 0
  const paint = src => {
    const yieldR = byId($('m').value).yieldRatio
    if (src === 'water') $('ratio').value = (g('water') / g('dose')).toFixed(yieldR ? 1 : 1)
    else $('water').value = Math.round(g('dose') * g('ratio') * (yieldR ? 10 : 1)) / (yieldR ? 10 : 1)
    set({ dose: g('dose') })
    const want = g('want'); $('scaled').textContent = want ? `${(want / g('ratio')).toFixed(1)} g coffee → ${Math.round(want)} g water` : '—'
    const ey = extraction({ tds: g('tds'), dose: g('dose'), water: g('water'), beverage: g('bev') || undefined })
    $('ey').innerHTML = g('tds') ? `<b>${g('tds').toFixed(2)}% TDS</b> — ${strengthWord(g('tds'))}. <b>${ey.toFixed(1)}% extraction</b> — ${eyWord(ey)}. <span class="muted">Sweet spot is roughly 18–22% extraction at 1.15–1.35% TDS.</span>` : 'Enter a TDS reading to see extraction yield. Without a refractometer, taste is the instrument: sour is under, bitter is over.'
  }
  ;['dose', 'ratio', 'want', 'tds', 'bev'].forEach(id => $(id).oninput = () => paint(id))
  $('water').oninput = () => paint('water')
  $('m').onchange = () => { const x = byId($('m').value); $('ratio').value = x.ratio; set({ method: x.id }); paint('ratio') }
}
