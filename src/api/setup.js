// Your gear. A list of items on the profile; one grinder is active at a time.
import { supa, uid, fn } from '../supa.js'
import * as profile from './profile.js'
import { METHODS, byId } from '../methods.js'

export const KINDS = [['grinder', 'Grinder'], ['brewer', 'Brewer'], ['kettle', 'Kettle'], ['scale', 'Scale'], ['filter', 'Filter'], ['water', 'Water']]
let cache = null
export async function get() {
  if (cache) return cache
  const p = await profile.me().catch(() => null)
  cache = Array.isArray(p?.setup) ? p.setup : []
  return cache
}
export function invalidate() { cache = null }
export async function save(items) {
  cache = items
  await profile.update({ setup: items, equipment: equipmentFrom(items), favorite_method: activeBrewer(items)?.method || undefined })
  return items
}
export function equipmentFrom(items) {
  const g = items.find(i => i.kind === 'grinder' && i.active) || items.find(i => i.kind === 'grinder')
  const pick = k => items.find(i => i.kind === k)?.name || null
  return { grinder: g?.name || null, brewer: pick('brewer'), kettle: pick('kettle'), scale: pick('scale'), filter: pick('filter'), water: pick('water') }
}
export const activeGrinder = items => items.find(i => i.kind === 'grinder' && i.active) || items.find(i => i.kind === 'grinder') || null
export const activeBrewer = items => items.find(i => i.kind === 'brewer' && i.active) || items.find(i => i.kind === 'brewer') || null
export async function setActive(id) {
  const items = await get()
  const it = items.find(i => i.id === id); if (!it) return items
  return save(items.map(i => i.kind === it.kind ? { ...i, active: i.id === id } : i))
}
export async function add(item) {
  const items = await get()
  const it = { id: 'g' + Math.random().toString(36).slice(2, 9), active: !items.some(i => i.kind === item.kind), ...item }
  return save([...items, it])
}
export async function remove(id) {
  const items = (await get()).filter(i => i.id !== id)
  for (const k of new Set(items.map(i => i.kind))) if (!items.some(i => i.kind === k && i.active)) { const f = items.find(i => i.kind === k); if (f) f.active = true }
  return save(items)
}

let grinders = null
export async function catalogue() {
  if (grinders) return grinders
  const c = await supa()
  const { data } = await c.from('grinders').select('id, brand, model, aliases, kind, scale, setting_min, setting_max, step, note').order('brand')
  grinders = data || []
  return grinders
}
// Search across grinders, brewers (the method list) and free text.
export async function search(q) {
  const ql = q.toLowerCase().trim(); if (!ql) return []
  const gs = await catalogue()
  const hits = []
  for (const g of gs) { const hay = `${g.brand} ${g.model} ${(g.aliases || []).join(' ')}`.toLowerCase(); if (hay.includes(ql)) hits.push({ kind: 'grinder', catalog_id: g.id, name: `${g.brand} ${g.model}`, sub: `${g.kind} · ${g.scale === 'clicks' ? 'clicks' : g.scale === 'stepless' ? 'stepless' : `settings ${g.setting_min}–${g.setting_max}`}` }) }
  for (const m of METHODS) if (m.name.toLowerCase().includes(ql) || m.kind.toLowerCase().includes(ql)) hits.push({ kind: 'brewer', method: m.id, name: m.name, sub: m.kind })
  return hits.slice(0, 12)
}
export async function identify(imageB64) { return fn('identify-gear', { image: imageB64 }) }
