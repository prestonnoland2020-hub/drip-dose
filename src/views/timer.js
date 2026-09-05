// TIMER — the screen owns the phone. Big clock, one instruction, what's next.
import { mount, esc, icon, I, $, toast, fmtT, sheet, closeSheet } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import { byId } from '../methods.js'
import { Brew } from '../timer.js'
import * as brews from '../api/brews.js'

const R = 100, C = 2 * Math.PI * R
let engine = null, wake = null, ctx = null

function beep(kind) {
  try { ctx ??= new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination)
    o.frequency.value = kind === 'done' ? 660 : kind === 'pour' ? 880 : 520; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'done' ? 0.6 : 0.25)); o.start(); o.stop(ctx.currentTime + 0.7) } catch {}
  try { navigator.vibrate?.(kind === 'done' ? [120, 80, 120] : kind === 'pour' ? [60, 40, 60] : 40) } catch {}
}

export async function render() {
  const rec = state.rec
  if (!rec?.recipe) { location.hash = '#/recipe'; return }
  const r = rec.recipe, M = byId(r.method)
  const steps = r.steps
  mount(`<div class="timer" id="timer">
    <div class="top"><button class="back" id="leave">${icon(I.x)} Cancel</button><div class="eyebrow">${esc(M.name)} · ${esc(String(r.dose).replace(/\.0$/, ''))} g → ${Math.round(r.water)} g · ${r.temp_note ? esc(r.temp_note) : r.temp + ' °C'}</div></div>
    <div class="ring"><svg viewBox="0 0 240 240"><circle class="track" cx="120" cy="120" r="${R}"/>${steps.filter(s => s.type === 'pour').map(s => arc(s, r.total)).join('')}<circle class="prog" id="prog" cx="120" cy="120" r="${R}" stroke-dasharray="0 ${C}"/></svg>
      <div class="mid"><div class="clock num" id="clock">0:00</div><div class="stage" id="stage">Ready</div><div class="target" id="target"></div></div></div>
    <div class="cue" id="cue"><b>Tap start when the water's on</b><small>Kettle at ${r.temp_note ? esc(r.temp_note).toLowerCase() : r.temp + ' °C · ' + Math.round(r.temp * 9 / 5 + 32) + ' °F'}, ${esc(String(r.dose).replace(/\.0$/, ''))} g ground ${esc((r.grind_label || '').toLowerCase())}</small></div>
    <div class="next" id="next"></div>
    <div class="ctrl"><button class="btn" id="skip" disabled>${icon(I.skip)} Skip</button><button class="btn primary big" id="main" style="min-height:56px">${icon(I.play)} Start</button><button class="btn" id="log" disabled>Log</button></div>
    <div class="row" style="justify-content:center;margin-top:10px"><button class="btn ghost sm" id="end" hidden>End early</button></div>
  </div>`)
  const el = { clock: $('clock'), stage: $('stage'), target: $('target'), cue: $('cue'), next: $('next'), prog: $('prog'), main: $('main'), skip: $('skip'), log: $('log'), end: $('end'), root: $('timer') }
  engine = new Brew(steps, {
    onTick: (t, i) => {
      el.clock.textContent = fmtT(t)
      const p = Math.min(1, t / r.total) * C
      el.prog.setAttribute('stroke-dasharray', `${p.toFixed(1)} ${(C - p).toFixed(1)}`)
      const s = steps[i]
      if (s) {
        el.stage.textContent = s.label
        el.target.innerHTML = s.type === 'pour' && s.target != null ? `${Math.round(s.target)} <small>g on the scale</small>` : s.target != null && s.type !== 'action' ? `<small>${Math.round(s.target)} g total</small>` : ''
        const left = s.t[1] - t
        el.next.textContent = i < steps.length - 1 ? `Next: ${steps[i + 1].label}${steps[i + 1].target != null && steps[i + 1].type === 'pour' ? ` to ${Math.round(steps[i + 1].target)} g` : ''} in ${fmtT(left)}` : `Finishing in ${fmtT(left)}`
      } else {
        el.stage.textContent = 'Past target'; el.target.innerHTML = `<small>${fmtT(t - r.total)} over — stop when the bed is dry</small>`; el.next.textContent = ''
      }
    },
    onStage: (i, prev) => {
      const s = steps[i]
      el.root.classList.toggle('pour', !!s && s.type === 'pour')
      if (prev >= 0 || i > 0) beep(!s ? 'done' : s.type === 'pour' ? 'pour' : 'step')
      el.cue.classList.remove('flash'); void el.cue.offsetWidth; el.cue.classList.add('flash')
      if (s) el.cue.innerHTML = `<b>${esc(s.type === 'pour' ? (s.target != null ? `Pour to ${Math.round(s.target)} g` : s.label) : s.label)}</b><small>${esc(s.hint || (s.type === 'wait' ? 'Wait' : ''))}</small>`
      else { el.cue.innerHTML = `<b>Target time reached</b><small>Tap Done when the last drop falls</small>`; el.main.innerHTML = `${icon(I.check)} Done`; el.root.classList.add('done') }
    },
  })
  el.main.onclick = async () => {
    if (!engine.running && !engine.finished && engine.t() === 0) {
      engine.start(); el.main.innerHTML = `${icon(I.pause)} Pause`; el.skip.disabled = el.log.disabled = false; el.end.hidden = false
      try { wake = await navigator.wakeLock?.request('screen') } catch {}
      return
    }
    if (engine.stageAt(engine.t()) < 0 || engine.finished) return finish()
    engine.toggle(); el.main.innerHTML = engine.running ? `${icon(I.pause)} Pause` : `${icon(I.play)} Resume`
  }
  el.skip.onclick = () => engine.skip()
  el.end.onclick = () => finish(true)
  el.log.onclick = () => {
    const p = sheet(`<h3>What's on the scale?</h3><div class="row" style="gap:10px;margin-top:10px"><input class="input num" id="g" type="number" inputmode="decimal" placeholder="grams" style="font-size:22px"><button class="btn primary" id="ok">Log</button></div><p class="small muted">Recorded against this step so the brew shows what actually happened.</p>`)
    p.querySelector('#g').focus()
    p.querySelector('#ok').onclick = () => { const g = Number(p.querySelector('#g').value); if (g > 0) { engine.record(g); toast(`${g} g logged`) } closeSheet() }
  }
  $('leave').onclick = () => {
    if (engine.t() === 0) { location.hash = '#/recipe'; return }
    const p = sheet(`<h3>Stop this brew?</h3><p class="muted">Nothing is saved.</p><div class="grid2"><button class="btn" id="stay">Keep brewing</button><button class="btn danger" id="quit">Stop</button></div>`)
    p.querySelector('#stay').onclick = closeSheet; p.querySelector('#quit').onclick = () => { closeSheet(); teardown(); location.hash = '#/recipe' }
  }
  function arc(s, total) { const a = s.t[0] / total * C, b = s.t[1] / total * C; return `<circle class="pourarc" cx="120" cy="120" r="${R}" stroke-dasharray="${(b - a).toFixed(1)} ${(C - (b - a)).toFixed(1)}" stroke-dashoffset="${(-a).toFixed(1)}"/>` }

  async function finish(early = false) {
    engine.end(); teardown()
    const total = Math.round(engine.elapsed)
    const brew = { coffee_id: state.coffee?.id ?? null, method: r.method, dose_g: r.dose, water_g: r.water, temp_c: M.cold ? null : r.temp,
      grind_label: r.grind_label, recipe: r.steps, actual: { pours: engine.actual, skips: engine.skips, ended_early: early }, total_seconds: total,
      ai_recipe: { dose: r.dose, water: r.water, ratio: r.ratio, temp: r.temp, grind_microns: r.grind_microns, grind_label: r.grind_label, confidence: rec.confidence },
      ai_reason: rec.why, modifications: rec.modifications ?? null, public: true }
    if (!uid()) { set({ draft: { ...brew, local: true, id: 'local-' + Date.now() } }); location.hash = '#/rate/local'; return }
    try { const saved = await brews.create(brew); set({ draft: null }); location.hash = `#/rate/${saved.id}` }
    catch (e) { console.error(e); set({ draft: { ...brew, local: true, id: 'local-' + Date.now() } }); toast('Saved on this phone — will sync when you sign in'); location.hash = '#/rate/local' }
  }
  return { destroy: teardown, resume: () => engine?.tick() }
}
function teardown() { engine?.destroy(); try { wake?.release?.() } catch {} wake = null }
