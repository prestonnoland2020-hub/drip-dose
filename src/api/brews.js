import { supa, uid } from '../supa.js'
import { imageUrl } from './coffees.js'

const SEL = 'id, user_id, coffee_id, method, dose_g, water_g, ratio, temp_c, grind_label, grind_setting, grinder, brewer, recipe, actual, total_seconds, rating, acidity, sweetness, body, clarity, balance, notes, feedback, ai_recipe, ai_reason, modifications, next_time, photo_path, public, created_at, coffees(id, roaster, name, origin, process, roast_level, blend, image_path)'
const shape = b => b ? { ...b, photo_url: imageUrl(b.photo_path), coffees: b.coffees ? { ...b.coffees, image_url: imageUrl(b.coffees.image_path) } : null } : b

export async function create(brew) {
  const c = await supa()
  const { data, error } = await c.from('brews').insert({ ...brew, user_id: uid() }).select(SEL).single()
  if (error) throw error
  return shape(data)
}
export async function update(id, patch) {
  const c = await supa()
  const { data, error } = await c.from('brews').update(patch).eq('id', id).select(SEL).single()
  if (error) throw error
  return shape(data)
}
export async function get(id) {
  const c = await supa()
  const { data } = await c.from('brews').select(SEL).eq('id', id).maybeSingle()
  return shape(data)
}
export async function mine(limit = 50) {
  const c = await supa()
  const { data } = await c.from('brews').select(SEL).eq('user_id', uid()).order('created_at', { ascending: false }).limit(limit)
  return (data || []).map(shape)
}
export async function forCoffee(coffeeId, limit = 20) {
  const c = await supa()
  const { data } = await c.from('brews').select(SEL).eq('coffee_id', coffeeId).eq('public', true).not('rating', 'is', null)
    .order('rating', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
  return (data || []).map(shape)
}
export async function forUser(userId, limit = 20) {
  const c = await supa()
  const { data } = await c.from('brews').select(SEL).eq('user_id', userId).eq('public', true).order('created_at', { ascending: false }).limit(limit)
  return (data || []).map(shape)
}
export async function uploadPhoto(file) {
  const c = await supa()
  const path = `${uid()}/${Date.now()}.jpg`
  const { error } = await c.storage.from('brew-photos').upload(path, file, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}
// What changed between two brews of the same coffee — the "compare" view.
export function diff(a, b) {
  const rows = [['Dose', 'dose_g', 'g'], ['Water', 'water_g', 'g'], ['Ratio', 'ratio', ''], ['Temp', 'temp_c', '°C'], ['Grind', 'grind_setting', ''], ['Time', 'total_seconds', 's'], ['Rating', 'rating', '/10']]
  return rows.map(([label, k, unit]) => ({ label, unit, a: a?.[k] ?? null, b: b?.[k] ?? null, changed: (a?.[k] ?? null) !== (b?.[k] ?? null) }))
}
