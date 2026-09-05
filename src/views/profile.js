// PROFILE — yours (#/profile) or someone else's (#/user/:id).
import { mount, top, esc, icon, I, $, avatar, toast, signInPrompt } from '../ui.js'
import { uid, signOut } from '../supa.js'
import * as profile from '../api/profile.js'
import * as brews from '../api/brews.js'
import * as social from '../api/social.js'
import { postCard, bindPosts, methodName } from './shared.js'

export async function render({ params, name }) {
  const id = name === 'user' ? params[0] : uid()
  const own = id && id === uid()
  if (!id) { mount(`${top('Profile')}${signInPrompt('have a profile')}`); return }
  const [p, stats, counts, fol] = await Promise.all([own ? profile.me() : social.person(id), profile.statsFor(id), social.followerCounts(id), social.following('user')])
  if (!p) { mount(`${top('', { back: '#/home' })}<div class="empty">No such person.</div>`); return }
  const following = fol.has(id)
  mount(`${top('', { back: own ? null : '#/home', right: own ? `<a class="iconbtn" href="#/settings" aria-label="Settings">${icon(I.edit)}</a>` : '' })}
    <div class="row" style="gap:14px;margin-bottom:14px">${avatar(p).replace('class="avatar', 'class="avatar" style="width:64px;height:64px;font-size:22px" data-x="')}<div><h1 style="margin:0">${esc(p.display_name || p.username)}</h1><div class="muted">@${esc(p.username || '')}${p.favorite_method ? ` · ${esc(methodName(p.favorite_method))}` : ''}</div>${p.bio ? `<div class="small" style="margin-top:4px">${esc(p.bio)}</div>` : ''}</div></div>
    <div class="stats"><div class="stat"><b>${stats.brews}</b><span>Brews</span></div><div class="stat"><b>${stats.coffees}</b><span>Coffees</span></div><div class="stat"><b>${stats.roasters}</b><span>Roasters</span></div><div class="stat"><b>${stats.avg ?? '—'}</b><span>Avg rating</span></div></div>
    <div class="row" style="margin:14px 0;gap:8px">${own ? `<a class="chip" href="#/settings">Equipment & preferences</a><button class="chip" id="out">Sign out</button>` : `<button class="chip" id="follow" aria-pressed="${following}">${following ? 'Following' : 'Follow'}</button>`}<span class="small muted" style="margin-left:auto">${counts.followers} followers · ${counts.following} following</span></div>
    ${stats.favMethod || stats.favRoaster ? `<div class="small muted" style="margin-bottom:8px">${stats.favMethod ? `Favourite method: <b>${esc(methodName(stats.favMethod))}</b>` : ''}${stats.favRoaster ? ` · Favourite roaster: <b>${esc(stats.favRoaster)}</b>` : ''}</div>` : ''}
    <div class="section"><div class="section-h"><h2>Recent brews</h2>${own ? '<a href="#/library?tab=history">All</a>' : ''}</div><div id="recent" class="list"><div class="skeleton"></div></div></div>`)
  $('out')?.addEventListener('click', async () => { await signOut(); location.hash = '#/home' })
  $('follow')?.addEventListener('click', async () => { const on = $('follow').getAttribute('aria-pressed') !== 'true'; $('follow').setAttribute('aria-pressed', on); $('follow').textContent = on ? 'Following' : 'Follow'; await social.follow('user', id, on) })
  const rows = await (own ? brews.mine(10) : brews.forUser(id, 10)).then(social.decorateBrews).catch(() => [])
  $('recent').innerHTML = rows.length ? rows.map(b => postCard(b)).join('') : `<div class="empty">Nothing brewed yet.</div>`
  bindPosts($('recent'))
}
