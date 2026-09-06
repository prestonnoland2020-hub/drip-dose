// BREW hub — the coffee on the counter, the brewer, the dose. Then a recipe.
import { mount, top, esc, icon, I, $, bagImg, coffeeTitle, coffeeMeta } from '../ui.js'
import { state, set } from '../store.js'
import { byId } from '../methods.js'
import { methodGrid, doseStepper, bindStepper } from './shared.js'
import * as setup from '../api/setup.js'
import { uid } from '../supa.js'
import { sheet, closeSheet } from '../ui.js'

export async function render() {
  const c = state.coffee
  const items = uid() ? await setup.get().catch(() => []) : []
  const g = setup.activeGrinder(items)
  mount(`${top('Brew')}
    <div class="eyebrow"><b>01</b>Coffee</div>
    <div class="card" style="margin:8px 0 22px">${c
      ? `<div class="coffee-hero">${bagImg(c)}<div style="min-width:0">${coffeeTitle(c)}${coffeeMeta(c)}</div></div><div class="row between" style="margin-top:10px"><a href="#/add" class="small" style="color:var(--accent)">Change coffee</a><button class="small muted" id="no-coffee" style="background:none;padding:0">Brew without one</button></div>`
      : `<p class="muted" style="margin:0 0 12px">Add the bag and the recipe is worked out for it. Or brew without one.</p><a class="btn primary" href="#/add">${icon(I.camera)} Add a coffee</a>`}</div>
    <div class="eyebrow"><b>02</b>Brewer</div>
    <div style="margin:8px 0 22px" id="methods">${methodGrid(state.method)}</div>
    <div class="eyebrow"><b>03</b>Dose</div>
    <div style="margin:8px 0 22px" id="dose">${doseStepper(state.dose)}</div>
    <div class="eyebrow"><b>04</b>Grinder</div>
    <button class="card row between" id="gear" style="margin:8px 0 26px;width:100%;text-align:left;padding:12px 14px"><div><b>${g ? esc(g.name) : uid() ? 'Add your grinder' : 'Sign in to add your grinder'}</b><div class="small muted">${g ? 'You get a setting, not a vague grind size' : 'POR turns the recipe into a number on your dial'}</div></div>${icon(I.chev)}</button>
    <a class="btn primary big" href="#/recipe" id="go">${icon(I.spark)} ${c ? 'Get my recipe' : 'Build a recipe'}</a>
    <div class="row" style="justify-content:center;gap:22px;margin-top:16px"><a href="#/calc" class="small muted">Calculators</a><a href="#/barista" class="small muted">Ask the barista</a></div>`)
  $('methods').querySelectorAll('[data-method]').forEach(b => b.onclick = () => {
    set({ method: b.dataset.method, rec: null }); $('methods').innerHTML = methodGrid(state.method); bindMethods()
  })
  function bindMethods() { $('methods').querySelectorAll('[data-method]').forEach(b => b.onclick = () => { set({ method: b.dataset.method, rec: null }); $('methods').innerHTML = methodGrid(state.method); bindMethods() }) }
  bindStepper($('dose'), () => state.dose, v => set({ dose: v }))
  $('no-coffee')?.addEventListener('click', () => { set({ coffee: null, rec: null }); render() })
  $('gear').onclick = () => {
    if (!uid()) return location.hash = '#/signin'
    const gs = items.filter(i => i.kind === 'grinder')
    if (gs.length < 2) return location.hash = '#/setup'
    const p = sheet(`<h3>Which grinder?</h3><div class="list" style="margin-top:8px">${gs.map(i => `<button class="chip" data-g="${i.id}" aria-pressed="${!!i.active}" style="justify-content:flex-start;min-height:46px">${esc(i.name)}</button>`).join('')}<a class="btn ghost" href="#/setup">Edit setup</a></div>`)
    p.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => { await setup.setActive(b.dataset.g); set({ rec: null }); closeSheet(); render() })
  }
}
