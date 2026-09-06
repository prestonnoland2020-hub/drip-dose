import { supa, uid } from '../supa.js'
import { imageUrl, pic } from './coffees.js'

const SEL = 'id, user_id, coffee_id, method, dose_g, water_g, ratio, temp_c, grind_label, grind_setting, total_seconds, rating, notes, photo_path, created_at, coffees(id, roaster, name, roast_level, process, origin, image_path, image_url)'
const shape = (b, people, social, mine) => ({ ...b, photo_url: imageUrl(b.photo_path),
  coffees: b.coffees ? { ...b.coffees, image_url: pic(b.coffees) } : null,
  person: people[b.user_id] || null, likes: social[b.id]?.likes ?? 0, comments: social[b.id]?.comments ?? 0,
  liked: mine.likes.has(b.id), saved: mine.saved.has(b.id) })

async function decorate(c, rows) {
  const ids = [...new Set(rows.map(r => r.user_id))], bids = rows.map(r => r.id)
  const me = uid()
  const [{ data: people }, { data: social }, likes, saved] = await Promise.all([
    ids.length ? c.from('people').select('*').in('id', ids) : { data: [] },
    bids.length ? c.from('brew_social').select('*').in('brew_id', bids) : { data: [] },
    me && bids.length ? c.from('brew_likes').select('brew_id').eq('user_id', me).in('brew_id', bids) : { data: [] },
    me && bids.length ? c.from('saved_recipes').select('brew_id').eq('user_id', me).in('brew_id', bids) : { data: [] },
  ])
  const P = Object.fromEntries((people || []).map(p => [p.id, p]))
  const S = Object.fromEntries((social || []).map(s => [s.brew_id, s]))
  const mine = { likes: new Set((likes.data || []).map(x => x.brew_id)), saved: new Set((saved.data || []).map(x => x.brew_id)) }
  return rows.map(r => shape(r, P, S, mine))
}

// Home feed priority (brief §16): people you follow, coffees you own, then everyone.
export async function feed(limit = 30) {
  const c = await supa(); const me = uid()
  let followed = [], owned = []
  if (me) {
    const [{ data: f }, { data: l }] = await Promise.all([
      c.from('follows').select('target_type, target_id').eq('follower_id', me),
      c.from('library').select('coffee_id').eq('user_id', me),
    ])
    followed = (f || []).filter(x => x.target_type === 'user').map(x => x.target_id)
    owned = (l || []).map(x => x.coffee_id)
  }
  const { data } = await c.from('brews').select(SEL).eq('public', true).not('rating', 'is', null).order('created_at', { ascending: false }).limit(limit * 2)
  const rows = data || []
  const score = b => (followed.includes(b.user_id) ? 2 : 0) + (owned.includes(b.coffee_id) ? 1 : 0)
  rows.sort((a, b) => score(b) - score(a) || new Date(b.created_at) - new Date(a.created_at))
  return decorate(c, rows.slice(0, limit))
}
export async function like(brewId, on) {
  const c = await supa(); const me = uid()
  if (on) await c.from('brew_likes').upsert({ brew_id: brewId, user_id: me }); else await c.from('brew_likes').delete().match({ brew_id: brewId, user_id: me })
}
export async function saveRecipe(brewId, on) {
  const c = await supa(); const me = uid()
  if (on) await c.from('saved_recipes').upsert({ brew_id: brewId, user_id: me }); else await c.from('saved_recipes').delete().match({ brew_id: brewId, user_id: me })
}
export async function comments(brewId) {
  const c = await supa()
  const { data } = await c.from('brew_comments').select('id, user_id, body, created_at').eq('brew_id', brewId).order('created_at')
  const ids = [...new Set((data || []).map(x => x.user_id))]
  const { data: people } = ids.length ? await c.from('people').select('*').in('id', ids) : { data: [] }
  const P = Object.fromEntries((people || []).map(p => [p.id, p]))
  return (data || []).map(x => ({ ...x, person: P[x.user_id] }))
}
export async function comment(brewId, body) {
  const c = await supa()
  const { error } = await c.from('brew_comments').insert({ brew_id: brewId, user_id: uid(), body })
  if (error) throw error
}
export async function following(type) {
  const c = await supa(); const me = uid(); if (!me) return new Set()
  const { data } = await c.from('follows').select('target_id').eq('follower_id', me).eq('target_type', type)
  return new Set((data || []).map(x => x.target_id))
}
export async function follow(type, id, on) {
  const c = await supa(); const me = uid()
  if (on) await c.from('follows').upsert({ follower_id: me, target_type: type, target_id: id }); else await c.from('follows').delete().match({ follower_id: me, target_type: type, target_id: id })
}
export async function person(id) {
  const c = await supa()
  const { data } = await c.from('people').select('*').eq('id', id).maybeSingle(); return data
}
export async function followerCounts(userId) {
  const c = await supa()
  const [{ count: followers }, { count: following }] = await Promise.all([
    c.from('follows').select('*', { count: 'exact', head: true }).eq('target_type', 'user').eq('target_id', userId),
    c.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ])
  return { followers: followers || 0, following: following || 0 }
}
export async function savedRecipes() {
  const c = await supa(); const me = uid(); if (!me) return []
  const { data } = await c.from('saved_recipes').select('brew_id').eq('user_id', me).order('created_at', { ascending: false })
  const ids = (data || []).map(x => x.brew_id); if (!ids.length) return []
  const { data: rows } = await c.from('brews').select(SEL).in('id', ids)
  return decorate(c, rows || [])
}
export async function decorateBrews(rows) { const c = await supa(); return decorate(c, rows) }
