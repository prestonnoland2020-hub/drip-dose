// ONE BREW — the full record, comments, and (for your own) a comparison with the previous one.
import { mount, top, esc, icon, I, $, toast, avatar, timeAgo, ratioStr, fmtT, tempBoth, stars, bagImg, coffeeTitle } from '../ui.js'
import { state, set } from '../store.js'
import { uid } from '../supa.js'
import * as brews from '../api/brews.js'
import * as social from '../api/social.js'
import { postCard, bindPosts, stepsList, methodName } from './_shared.js'
import { FEEDBACK } from '../feedback.js'

export async function render({ params }) {
  const id = params[0]
  const b = await brews.get(id)
  if (!b) { mount(`${top('', { back: '#/library' })}<div class="empty">That brew isn't here.</div>`); return }
  const [deco] = await social.decorateBrews([b])
  const mine = b.user_id === uid()
  const c = b.coffees
  mount(`${top('', { back: mine ? '#/library?tab=history' : '#/home' })}
    ${postCard(deco)}
    <div class="section"><h3>Recipe</h3>${b.recipe?.length ? stepsList(b.recipe) : '<div class="small muted">No steps recorded.</div>'}
      ${b.actual?.pours?.length ? `<div class="small muted" style="margin-top:8px">Logged pours: ${b.actual.pours.map(p => `${p.grams} g at ${fmtT(p.at)}`).join(', ')}</div>` : ''}
      ${b.actual?.ended_early ? '<div class="small muted">Ended early.</div>' : ''}</div>
    ${b.acidity || b.sweetness || b.body || b.clarity || b.balance ? `<div class="section"><h3>Tasting</h3><dl class="kv">${[['Acidity', b.acidity], ['Sweetness', b.sweetness], ['Body', b.body], ['Clarity', b.clarity], ['Balance', b.balance]].filter(([, v]) => v).map(([l, v]) => `<dt>${l}</dt><dd>${stars(v)}</dd>`).join('')}</dl></div>` : ''}
    ${b.feedback?.length ? `<div class="section"><h3>Verdict</h3><div class="chips">${b.feedback.map(f => `<span class="chip">${esc(FEEDBACK.find(x => x.id === f)?.label || f)}</span>`).join('')}</div>${b.next_time ? `<div class="why" style="margin-top:10px">${b.next_time.change ? `<b>${esc(b.next_time.change.text)}.</b> ` : ''}${esc(b.next_time.why)}</div>` : ''}</div>` : ''}
    ${b.ai_reason ? `<div class="section"><h3>Why this recipe was suggested</h3><div class="small muted">${esc(b.ai_reason)}</div></div>` : ''}
    <div class="section" id="compare"></div>
    <div class="section"><div class="section-h"><h2>Comments</h2></div><div id="comments" class="list"></div>
      ${uid() ? `<div class="row" style="margin-top:10px"><input class="input" id="cbody" placeholder="Say something useful" maxlength="500"><button class="btn primary" id="csend">Post</button></div>` : `<a class="small" href="#/signin" style="color:var(--accent)">Sign in to comment</a>`}</div>
    ${c ? `<div class="section"><button class="btn primary big" id="brewthis">${icon(I.play)} Brew this recipe</button></div>` : ''}`)
  bindPosts($('view'))
  $('brewthis')?.addEventListener('click', () => {
    set({ coffee: c, method: b.method, dose: Number(b.dose_g), rec: null })
    toast('Recipe loaded — dose and method set'); location.hash = '#/recipe'
  })
  loadComments(id)
  $('csend')?.addEventListener('click', async () => { const t = $('cbody').value.trim(); if (!t) return; await social.comment(id, t); $('cbody').value = ''; loadComments(id) })
  if (mine && c) compare(b)
}
async function loadComments(id) {
  const rows = await social.comments(id).catch(() => [])
  $('comments').innerHTML = rows.length ? rows.map(x => `<div class="row" style="align-items:flex-start">${avatar(x.person)}<div><b class="small">${esc(x.person?.display_name || x.person?.username || 'Someone')}</b> <span class="small muted">${timeAgo(x.created_at)}</span><div>${esc(x.body)}</div></div></div>`).join('') : `<div class="small muted">No comments yet.</div>`
}
async function compare(b) {
  const mine = await brews.mine(100)
  const same = mine.filter(x => x.coffee_id === b.coffee_id && x.method === b.method).sort((a, z) => new Date(a.created_at) - new Date(z.created_at))
  const i = same.findIndex(x => x.id === b.id); const prev = i > 0 ? same[i - 1] : null
  if (!prev) return
  const d = brews.diff(prev, b)
  $('compare').innerHTML = `<h3>vs. your previous brew <span class="small muted">(#${i} → #${i + 1})</span></h3><dl class="kv">${d.map(r => `<dt>${r.label}</dt><dd class="${r.changed ? (r.label === 'Rating' ? (Number(r.b) > Number(r.a) ? 'up' : 'down') : 'up') : ''}">${r.changed ? `${fmt(r.a, r.unit)} → ${fmt(r.b, r.unit)}` : fmt(r.b, r.unit)}</dd>`).join('')}</dl>
    <div class="small muted" style="margin-top:6px">${d.filter(r => r.changed && r.label !== 'Rating').length === 1 ? 'One variable changed — that is how you learn what did it.' : d.filter(r => r.changed && r.label !== 'Rating').length === 0 ? 'Same recipe both times.' : 'Several things changed; harder to say which one mattered.'}</div>`
}
const fmt = (v, u) => v == null ? '—' : u === 's' ? fmtT(v) : u === '' && typeof v === 'number' ? ratioStr(v) : `${String(v).replace(/\.0$/, '')}${u}`
