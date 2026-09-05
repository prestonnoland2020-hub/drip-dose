import { supa, fn, uid } from '../supa.js'
import { SB_URL } from '../config.js'

export const imageUrl = path => path ? (path.startsWith('http') ? path : `${SB_URL}/storage/v1/object/public/brew-photos/${path}`) : null
const withImg = c => c ? { ...c, image_url: imageUrl(c.image_path) } : c

export async function get(id) {
  const c = await supa()
  const { data } = await c.from('coffees').select('*').eq('id', id).maybeSingle()
  return withImg(data)
}
export async function search(q, limit = 12) {
  const c = await supa()
  const like = `%${q.replace(/[%_]/g, '')}%`
  const { data } = await c.from('coffees').select('id, roaster, name, origin, process, roast_level, blend, decaf, image_path')
    .or(`name.ilike.${like},roaster.ilike.${like},origin.ilike.${like}`).order('updated_at', { ascending: false }).limit(limit)
  return (data || []).map(withImg)
}
export async function recent(limit = 8) {
  const c = await supa()
  const { data } = await c.from('coffees').select('id, roaster, name, origin, process, roast_level, blend, decaf, image_path, created_at').order('created_at', { ascending: false }).limit(limit)
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
