import { supa, fn, uid } from '../supa.js'
import { SB_URL } from '../config.js'

// A photo someone took of the bag wins over the shop's product image.
export const pic = c => c?.image_path ? imageUrl(c.image_path) : (c?.image_url || null)
export const imageUrl = path => path ? (path.startsWith('http') ? path : `${SB_URL}/storage/v1/object/public/brew-photos/${path}`) : null
const withImg = c => c ? { ...c, image_url: pic(c) } : c

export async function get(id) {
  const c = await supa()
  const { data } = await c.from('coffees').select('*').eq('id', id).maybeSingle()
  return withImg(data)
}
export async function search(q, limit = 12) {
  const c = await supa()
  const clean = q.replace(/[%_,]/g, ' ').trim()
  if (clean.length < 2) return []
  // Fuzzy, server-side: typos and word order don't matter ("blak white strawbery" still finds it).
  const { data } = await c.rpc('search_coffees', { q: clean, lim: limit })
  return (data || []).map(withImg)
}
export async function recent(limit = 8) {
  const c = await supa()
  const { data } = await c.from('coffees').select('id, roaster, name, origin, process, roast_level, blend, decaf, image_path, image_url, created_at').order('created_at', { ascending: false }).limit(limit)
  return (data || []).map(withImg)
}
export async function stats(id) {
  const c = await supa()
  const [{ data: overall }, { data: byMethod }] = await Promise.all([
    c.from('coffee_stats').select('*').eq('coffee_id', id).maybeSingle(),
    c.from('coffee_method_stats').select('*').eq('coffee_id', id).order('brews', { ascending: false }),
  ])
  return { overall: overall || { brews: 0, avg_rating: null, brewers: 0 }, byMethod: byMethod || [] }
}
// Manual creation — the person is the source of every field they typed.
export async function create(fields) {
  const c = await supa()
  const slug = `${fields.roaster || 'unknown-roaster'}|${fields.name}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9|]+/g, '-').replace(/^-|-$/g, '')
  const sources = Object.fromEntries(Object.keys(fields).filter(k => fields[k] != null && fields[k] !== '').map(k => [k, 'user']))
  const row = { ...fields, slug, roaster: fields.roaster || 'Unknown roaster', created_by: uid(), source: 'manual', field_sources: sources, confidence: 1 }
  const { data, error } = await c.from('coffees').upsert(row, { onConflict: 'slug' }).select().single()
  if (error) throw error
  return withImg(data)
}
// The person corrects what the AI read. Their word beats the model's.
export async function correct(id, fields) {
  const c = await supa()
  const { data: cur } = await c.from('coffees').select('field_sources').eq('id', id).maybeSingle()
  const field_sources = { ...(cur?.field_sources || {}), ...Object.fromEntries(Object.keys(fields).map(k => [k, 'user'])) }
  const { data, error } = await c.from('coffees').update({ ...fields, field_sources }).eq('id', id).select().maybeSingle()
  if (error) throw error
  return withImg(data)
}
export async function scan(imageB64, method, roast) {
  const out = await fn('scan-bag', { image: imageB64, media_type: 'image/jpeg', method, roast })
  return { ...out, coffee: withImg(out.coffee) }
}
export async function retailor(coffeeId, method, roast) {
  const out = await fn('scan-bag', { coffee_id: coffeeId, method, roast })
  return { ...out, coffee: withImg(out.coffee) }
}
export async function recommend(body) { return fn('recommend', body) }
export async function lookup(query) { const out = await fn('lookup-coffee', { query }); return { ...out, coffee: withImg(out.coffee) } }
export async function roasters(q, limit = 6) {
  const c = await supa()
  const { data } = await c.rpc('search_roasters', { q: q.trim(), lim: limit })
  return data || []
}
// The roaster's current menu, with photos, from their own shop (synced at most daily; no AI).
export async function catalog({ roaster_id, roaster }) {
  const data = await fn('roaster-catalog', roaster_id ? { roaster_id } : { roaster })
  if (data.error === 'unknown_roaster') throw new Error('unknown_roaster')
  return { ...data, coffees: (data.coffees || []).map(withImg) }
}
export async function byRoaster(name, limit = 60) {
  const c = await supa()
  const { data } = await c.from('coffees').select('id, roaster, name, origin, process, roast_level, blend, decaf, image_path, image_url, product_url, price, currency').ilike('roaster', name).eq('available', true).order('name').limit(limit)
  return (data || []).map(withImg)
}
export async function roasterByName(name) {
  const c = await supa()
  const { data } = await c.from('roasters').select('id, name, city, country, website, tier, house_style, logo_url, catalog_count, catalog_synced_at').ilike('name', name).maybeSingle()
  return data
}
