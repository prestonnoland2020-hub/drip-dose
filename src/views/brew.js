// BREW hub — the coffee on the counter, the brewer, the dose. Then a recipe.
import { mount, top, esc, icon, I, $, bagImg, coffeeTitle, coffeeMeta } from '../ui.js'
import { state, set } from '../store.js'
import { byId } from '../methods.js'
import { methodGrid, doseStepper, bindStepper } from './shared.js'

export async function render() {
  const c = state.coffee
  mount(`${top('Brew')}
    <div class="eyebrow"><b>01</b>Coffee</div>
    <div class="card" style="margin:8px 0 22px">${c
      ? `<div class="coffee-hero">${bagImg(c)}<div style="min-width:0">${coffeeTitle(c)}${coffeeMeta(c)}</div></div><div class="row" style="margin-top:12px;gap:8px"><a class="btn sm" href="#/add">Change coffee</a><button class="btn sm ghost" id="no-coffee">Brew without a coffee</button></div>`
      : `<p class="muted" style="margin:0 0 12px">Add the bag and the recipe is worked out for it. Or brew without one.</p><a class="btn primary" href="#/add">${icon(I.camera)} Add a coffee</a>`}</div>
    <div class="eyebrow"><b>02</b>Brewer</div>
    <div style="margin:8px 0 22px" id="methods">${methodGrid(state.method)}</div>
    <div class="eyebrow"><b>03</b>Dose</div>
    <div style="margin:8px 0 26px" id="dose">${doseStepper(state.dose)}</div>
    <a class="btn primary big" href="#/recipe" id="go">${icon(I.spark)} ${c ? 'Get my recipe' : 'Build a recipe'}</a>
    <div class="grid2" style="margin-top:14px"><a class="btn" href="#/calc">Calculators</a><a class="btn" href="#/barista">Ask the barista</a></div>`)
  $('methods').querySelectorAll('[data-method]').forEach(b => b.onclick = () => {
    set({ method: b.dataset.method }); $('methods').querySelectorAll('[data-method]').forEach(x => x.setAttribute('aria-pressed', x === b))
  })
  bindStepper($('dose'), () => state.dose, v => set({ dose: v }))
  $('no-coffee')?.addEventListener('click', () => { set({ coffee: null, rec: null }); render() })
}
