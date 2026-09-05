// BARISTA — ask, grounded in your own brews. Says so when it can't know.
import { mount, top, esc, $, toast, signInPrompt } from '../ui.js'
import { state } from '../store.js'
import { uid, fn } from '../supa.js'
const log = []
export async function render() {
  mount(`${top('Barista', { back: '#/brew' })}
    ${uid() ? '' : signInPrompt('ask the barista about your brews')}
    <div id="log" class="list" style="margin:10px 0">${log.map(row).join('')}</div>
    <div class="chips" id="sugg">${['How should I brew this?', 'Why is this tasting sour?', 'Should I grind finer?', 'What is my best recipe so far?'].map(s => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="row" style="margin-top:12px"><input class="input" id="q" placeholder="Ask about your coffee" maxlength="600" ${uid() ? '' : 'disabled'}><button class="btn primary" id="send" ${uid() ? '' : 'disabled'}>Ask</button></div>
    <p class="small muted" style="margin-top:10px">Answers come from your logged brews and general brewing knowledge. The barista cannot browse the web and will say so rather than guess.</p>`)
  $('sugg').querySelectorAll('.chip').forEach(b => b.onclick = () => { $('q').value = b.dataset.q; ask() })
  $('send').onclick = ask; $('q').onkeydown = e => { if (e.key === 'Enter') ask() }
  async function ask() {
    const q = $('q').value.trim(); if (!q || !uid()) return
    $('q').value = ''; log.push({ q, a: null }); paint()
    try { const out = await fn('barista', { question: q, coffee_id: state.coffee?.id ?? null }); log[log.length - 1].a = out.answer || '…' }
    catch (e) { log[log.length - 1].a = e.code === 'not_configured' ? 'The barista is not switched on yet.' : 'Could not reach the barista right now.' }
    paint()
  }
  function paint() { $('log').innerHTML = log.map(row).join(''); window.scrollTo(0, document.body.scrollHeight) }
}
const row = x => `<div class="card flat" style="padding:0"><div style="text-align:right"><span class="chip" style="background:var(--ink);color:var(--bg);border-color:var(--ink)">${esc(x.q)}</span></div><div class="why" style="margin-top:10px">${x.a == null ? '<span class="muted">Thinking…</span>' : esc(x.a)}</div></div>`
