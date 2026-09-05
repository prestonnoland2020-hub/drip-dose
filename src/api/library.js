import { supa, uid } from '../supa.js'
import { imageUrl } from './coffees.js'

export async function mine() {
  const c = await supa(); const me = uid(); if (!me) return []
  const { data } = await c.from('library').select('*, coffees(id, roaster, name, origin, process, roast_level, blend, decaf, image_path, tasting_notes)').eq('user_id', me).order('added_at', { ascending: false })
  const rows = (data || []).map(r => ({ ...r, coffees: r.coffees ? { ...r.coffees, image_url: imageUrl(r.coffees.image_path) } : null }))
  // personal stats per coffee
  const { data: brews } = await c.from('brews').select('coffee_id, rating, created_at, ratio, temp_c, method').eq('user_id', me)
  const by = {}
  for (const b of brews || []) { const k = b.coffee_id; by[k] ??= { n: 0, best: null, last: null, ratings: [] }; by[k].n++; by[k].ratings.push(b.rating); if (!by[k].last || b.created_at > by[k].last.created_at) by[k].last = b; if (b.rating != null && (!by[k].best || b.rating > by[k].best.rating)) by[k].best = b }
  return rows.map(r => ({ ...r, my: by[r.coffee_id] || { n: 0, best: null, last: null, ratings: [] } }))
}
export async function set(coffeeId, patch) {
  const c = await supa(); const me = uid()
  const { error } = await c.from('library').upsert({ user_id: me, coffee_id: coffeeId, ...patch }, { onConflict: 'user_id,coffee_id' })
  if (error) throw error
}
export async function remove(coffeeId) { const c = await supa(); await c.from('library').delete().match({ user_id: uid(), coffee_id: coffeeId }) }
export async function status(coffeeId) {
  const c = await supa(); const me = uid(); if (!me) return null
  const { data } = await c.from('library').select('status').match({ user_id: me, coffee_id: coffeeId }).maybeSingle(); return data?.status ?? null
}
