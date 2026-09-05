// Small app state. Persisted bits survive reloads; the rest is per session.
const KEY = 'por.v3'
const defaults = {
  method: 'v60', dose: 20, roast: 'medium', species: 'arabica', units: 'c',
  coffee: null,            // the coffee on the counter: { id, roaster, name, ... }
  rec: null,               // last recommendation for that coffee+method
  draft: null,             // brew in progress { recipe, startedAt, actual }
}
export const state = { ...defaults }
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')) } catch {}
export function save() {
  try { const { method, dose, roast, species, units, coffee, rec, draft } = state
    localStorage.setItem(KEY, JSON.stringify({ method, dose, roast, species, units, coffee, rec, draft })) } catch {}
}
export function set(patch) { Object.assign(state, patch); save(); emit() }
const subs = new Set()
export function subscribe(f) { subs.add(f); return () => subs.delete(f) }
function emit() { subs.forEach(f => f(state)) }
