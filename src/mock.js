// Offline fixtures for local screenshots and smoke tests (?mock=1). Not loaded in production.
const ME = '00000000-0000-0000-0000-000000000001', AL = '00000000-0000-0000-0000-000000000002'
const C1 = '11111111-1111-1111-1111-111111111111', C2 = '22222222-2222-2222-2222-222222222222'
const B1 = 'b1', B2 = 'b2', B3 = 'b3'
const now = Date.now(), ago = h => new Date(now - h * 3600000).toISOString()
const T = {
  profiles: [{ id: ME, email: 'preston@example.com', username: 'preston', display_name: 'Preston', favorite_method: 'v60', equipment: { grinder: 'OXO Brew Conical Burr', brewer: 'V60' }, prefs: { dose: 20 }, setup: [{ id: 'g1', kind: 'grinder', catalog_id: 'oxo-brew-conical', name: 'OXO Brew Conical Burr', active: true }, { id: 'g2', kind: 'grinder', catalog_id: 'baratza-encore', name: 'Baratza Encore', active: false }, { id: 'b1', kind: 'brewer', method: 'v60', name: 'V60', active: true }], plan: 'free', scans_used: 2, scan_limit: 5 }],
  people: [{ id: ME, username: 'preston', display_name: 'Preston', favorite_method: 'v60' }, { id: AL, username: 'alex_k', display_name: 'Alex', favorite_method: 'chemex' }],
  coffees: [
    { id: C1, available: true, slug: 'black-white|the-new-school-strawberry', roaster: 'Black & White', name: 'The New School Strawberry', origin: null, process: null, roast_level: 'light', blend: true, decaf: false, tasting_notes: 'strawberry jam, canned pineapple, milk chocolate', field_sources: {}, researched_at: ago(30), created_at: ago(40), updated_at: ago(2) },
    { id: C2, available: true, slug: 'onyx|geometry', roaster: 'Onyx Coffee Lab', name: 'Geometry', origin: 'Ethiopia / Colombia', process: 'Natural / Washed', roast_level: 'light', blend: true, decaf: false, tasting_notes: 'blueberry, jasmine, black tea', field_sources: { origin: 'user' }, created_at: ago(300), updated_at: ago(3) },
  ],
  brews: [
    { id: B1, user_id: ME, coffee_id: C1, method: 'v60', dose_g: 20, water_g: 320, ratio: 16, temp_c: 96, grind_label: 'Medium-fine', grind_setting: '18', total_seconds: 182, rating: 9.4, acidity: 4, sweetness: 5, body: 3, clarity: 4, balance: 5, notes: 'Blueberry, super sweet, very clean.', feedback: ['just_right'], next_time: { change: null, why: 'That is your recipe for this coffee. Change nothing.', also: [] }, recipe: [{ t: [0, 10], type: 'pour', label: 'Bloom', target: 50 }, { t: [10, 45], type: 'wait', label: 'Let it bloom', target: null }, { t: [45, 75], type: 'pour', label: 'Pour 2', target: 190 }, { t: [75, 105], type: 'pour', label: 'Pour 3', target: 320 }, { t: [120, 180], type: 'wait', label: 'Drawdown', target: 320 }], ai_recipe: { grind_microns: 440 }, ai_reason: 'This is a light roast, a blend. Lighter roasts are dense and less soluble, so the water runs hot.', public: true, created_at: ago(5) },
    { id: B2, user_id: ME, coffee_id: C1, method: 'v60', dose_g: 20, water_g: 320, ratio: 16, temp_c: 94, grind_label: 'Medium-fine', grind_setting: '20', total_seconds: 171, rating: 8.2, notes: 'A bit sharp.', feedback: ['too_acidic'], next_time: { change: { var: 'grind', text: 'Grind 1–2 clicks finer on your Baratza Encore' }, why: 'Sharp acidity with little sweetness behind it is under-extraction. Keep your ratio and temperature the same.', also: [] }, public: true, created_at: ago(30) },
    { id: B3, user_id: AL, coffee_id: C2, method: 'chemex', dose_g: 22, water_g: 330, ratio: 15, temp_c: 96, grind_label: 'Medium-coarse', total_seconds: 248, rating: 7.9, notes: 'Too acidic for me.', feedback: ['too_acidic'], public: true, created_at: ago(9) },
  ],
  library: [{ user_id: ME, coffee_id: C1, status: 'drinking', added_at: ago(40), roast_date: new Date(now - 12 * 86400000).toISOString().slice(0, 10) }, { user_id: ME, coffee_id: C2, status: 'want', added_at: ago(100) }],
  follows: [{ follower_id: ME, target_type: 'user', target_id: AL }], brew_likes: [{ brew_id: B1, user_id: AL }], brew_comments: [{ id: 'c1', brew_id: B1, user_id: AL, body: 'Trying this tomorrow.', created_at: ago(3) }], saved_recipes: [{ user_id: ME, brew_id: B3 }],
  brew_reference: [], roasters: [{ id: 'r1', name: 'Black & White Coffee Roasters', city: 'Raleigh', country: 'USA', website: 'blackwhiteroasters.com', logo_url: null, catalog_count: 2 }, { id: 'r2', name: 'Onyx Coffee Lab', city: 'Rogers', country: 'USA', website: 'onyxcoffeelab.com', logo_url: null, catalog_count: 1 }],
  grinders: [{ id: 'oxo-brew-conical', brand: 'OXO', model: 'Brew Conical Burr', aliases: ['OXO conical'], kind: 'electric', scale: 'numbers', setting_min: 1, setting_max: 15, step: 1, note: '1 is finest.', dial: '15 numbered settings, 1 is finest. The ring is marked Fine → Medium → Coarse with no brew-method labels. Pour-over usually 7–10.', verified: true }, { id: 'baratza-encore', brand: 'Baratza', model: 'Encore', aliases: [], kind: 'electric', scale: 'numbers', setting_min: 1, setting_max: 40, step: 1, note: '' }],
}
T.coffee_stats = [{ coffee_id: C1, brews: 2, avg_rating: 8.8, brewers: 1, last_brewed: ago(5) }, { coffee_id: C2, brews: 1, avg_rating: 7.9, brewers: 1, last_brewed: ago(9) }]
T.coffee_method_stats = [{ coffee_id: C1, method: 'v60', brews: 2, avg_rating: 8.8, median_rating: 8.8, recommend_pct: 100, common_ratio: 16, common_temp: 96, common_grind: 'Medium-fine', avg_seconds: 176 }]
T.brew_social = [{ brew_id: B1, likes: 1, comments: 1 }, { brew_id: B2, likes: 0, comments: 0 }, { brew_id: B3, likes: 0, comments: 0 }]

const joins = { coffees: r => T.coffees.find(c => c.id === r.coffee_id) }
function q(table) {
  let rows = [...(T[table] || [])], filters = [], order = null, lim = null, one = false, single = false, count = false, sel = '*'
  const api = {
    select(s = '*', o = {}) { sel = s; count = !!o.count; return api },
    eq(k, v) { filters.push(r => r[k] === v); return api }, ilike(k, v) { const t = String(v).replace(/%/g, '').toLowerCase(); filters.push(r => String(r[k] || '').toLowerCase().includes(t)); return api }, not(k, op, v) { filters.push(r => op === 'is' && v === null ? r[k] != null : true); return api },
    gte(k, v) { filters.push(r => r[k] >= v); return api }, in(k, vs) { filters.push(r => vs.includes(r[k])); return api },
    or(expr) { const like = expr.match(/ilike\.%(.*?)%/)?.[1]?.toLowerCase(); filters.push(r => !like || ['name', 'roaster', 'origin'].some(k => r[k]?.toLowerCase().includes(like))); return api },
    match(o) { for (const k in o) filters.push(r => r[k] === o[k]); return api },
    order(k, o = {}) { order = [k, o.ascending !== false]; return api }, limit(n) { lim = n; return api },
    maybeSingle() { one = true; return api }, single() { one = single = true; return api },
    insert(v) { const arr = Array.isArray(v) ? v : [v]; const out = arr.map(x => ({ id: 'id' + Math.random().toString(36).slice(2), created_at: new Date().toISOString(), ...x })); T[table] = [...(T[table] || []), ...out]; rows = out; return api },
    upsert(v) { return api.insert(v) },
    update(patch) { const target = rows.filter(r => filters.every(f => f(r))); target.forEach(r => Object.assign(r, patch)); rows = target; filters = []; return api },
    delete() { const keep = (T[table] || []).filter(r => !filters.every(f => f(r))); T[table] = keep; rows = []; filters = []; return api },
    then(res) {
      let out = rows.filter(r => filters.every(f => f(r)))
      if (order) out.sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1))
      if (lim) out = out.slice(0, lim)
      if (/coffees\(/.test(sel)) out = out.map(r => ({ ...r, coffees: joins.coffees(r) || null }))
      const data = one ? (out[0] ?? null) : out
      res({ data, error: single && !data ? { message: 'not found' } : null, count: count ? out.length : null })
    },
  }
  return api
}
export function mockClient() {
  const session = { user: { id: ME, email: 'preston@example.com' }, access_token: 'mock' }
  return { from: q,
    rpc: async (name, args) => { const ql = String(args?.q || '').toLowerCase(); if (name === 'search_coffees') return { data: T.coffees.filter(c => [c.name, c.roaster].some(v => v?.toLowerCase().includes(ql.split(' ')[0]))) }; if (name === 'search_roasters') return { data: T.roasters.filter(r => r.name.toLowerCase().includes(ql)) }; return { data: [] } },
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange() {}, signOut: async () => {}, signInWithOAuth: async () => ({}), signInWithOtp: async () => ({}) },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) } }
}
export async function mockFn(name, body) {
  await new Promise(r => setTimeout(r, 150))
  if (name === 'recommend') {
    const { METHODS } = await import('./methods.js'); const M = METHODS.find(m => m.id === body.method) || METHODS[0]
    const dose = body.dose || 20, water = Math.round(dose * 16 / 5) * 5, steps = M.steps(dose, water)
    return { recipe: { method: M.id, method_name: M.name, dose, water, ratio: 16, temp: 96, grind_label: 'Medium-fine, like table salt', grind_microns: 440, grind_hint: 'Medium-fine on your OXO Brew Conical Burr', grinder: { id: 'oxo-brew-conical', brand: 'OXO', model: 'Brew Conical Burr', scale: 'numbers', dial: '15 numbered settings, 1 is finest. The ring is marked Fine → Medium → Coarse with no brew-method labels. Pour-over usually 7–10.', verified: true }, grind_setting: '6', grind_setting_num: 6, steps, total: steps[steps.length - 1].t[1], bloom: 2.5 },
      why: 'Last time you said just right — this is that recipe again. This is a light roast, a blend. Lighter roasts are dense and less soluble, so the water runs hot and the grind sits on the fine side of the range.',
      confidence: 'high', changed: [], sources: [{ kind: 'label', text: 'What the bag says (light roast)' }, { kind: 'reference', text: 'Hario V60 published ranges — SCA brewing guidance' }, { kind: 'community', text: '2 community brews of this coffee on V60' }, { kind: 'you', text: 'Your last brew of this (9.4/10)' }],
      community: { brews: 2, avg_rating: 8.8, recommend_pct: 100, common_ratio: 16, common_temp: 96, common_grind: 'Medium-fine', avg_seconds: 176 }, basis: 'Hario V60 published ranges, set for light roast' }
  }
  if (name === 'roaster-catalog') return { roaster: T.roasters[0], coffees: T.coffees, synced: true }
  if (name === 'scan-bag') return { coffee: T.coffees[0], recipe: {}, sources: [], cache_hit: true, scans_used: 3, scan_limit: 5 }
  if (name === 'identify-gear') return { kind: 'grinder', brand: 'OXO', model: 'Brew Conical Burr', confidence: 0.9, grinder: T.grinders[0], candidates: T.grinders, method: null }
  if (name === 'barista') return { answer: 'Your last Strawberry was 20 g to 320 g at 96 °C (205 °F) and you rated it 9.4 — I would not touch it. If the next cup reads sharper, go one click finer and leave everything else alone.', brews_used: 2 }
  return {}
}
