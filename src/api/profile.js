import { supa, uid } from '../supa.js'
export async function me() {
  const c = await supa(); const id = uid(); if (!id) return null
  const { data } = await c.from('profiles').select('id, email, username, display_name, avatar_url, bio, favorite_method, equipment, prefs, plan, scans_used, scan_limit').eq('id', id).maybeSingle()
  return data
}
export async function update(patch) {
  const c = await supa()
  const { data, error } = await c.from('profiles').update(patch).eq('id', uid()).select().single()
  if (error) throw error
  return data
}
export async function statsFor(userId) {
  const c = await supa()
  const { data } = await c.from('brews').select('coffee_id, rating, method, coffees(roaster)').eq('user_id', userId).eq('public', true)
  const rows = data || []
  const rated = rows.filter(r => r.rating != null)
  const count = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const methods = {}, roasters = {}
  for (const r of rows) { methods[r.method] = (methods[r.method] || 0) + 1; const ro = r.coffees?.roaster; if (ro && ro !== 'Unknown roaster') roasters[ro] = (roasters[ro] || 0) + 1 }
  return { brews: rows.length, coffees: new Set(rows.map(r => r.coffee_id).filter(Boolean)).size, roasters: Object.keys(roasters).length,
    avg: rated.length ? (rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(1) : null,
    favMethod: count(methods), favRoaster: count(roasters) }
}
