// POR — recommend
// "Here's how I'd brew this." One coffee, one brewer, one person → one recipe,
// with the reasoning and the sources laid out, and never more than one change
// from what they brewed last time.
//
// Priority of evidence (brief §21):
//   1. the roaster's own guidance (from research, cached on the coffee)
//   2. published method ranges (brew_reference)
//   3. community brews of this exact coffee + method
//   4. this person's own last brew of it, plus what they said about it
//   5. general rules from the label (roast, process, altitude, decaf, freshness)
//
// Everything here is deterministic. No model writes the numbers. The "why"
// is assembled from the rules that actually fired, so it is always true.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { deriveRecipe } from './recipe.ts'
import { byId } from './methods.ts'
import { nextTime } from './feedback.ts'
import { settingFor, fmtSetting, stepSetting, micronsFor, grinderName } from './grind.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const r1 = (n: number) => Math.round(n * 10) / 10
const r5 = (n: number) => Math.round(n / 5) * 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: userData } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
  const user = userData?.user ?? null   // anonymous is allowed: you get the coffee + community, not personal history

  const body = await req.json().catch(() => ({}))
  const coffeeId: string | null = body.coffee_id ?? null
  const method: string = body.method || 'v60'
  const M = byId(method)
  const dose: number = Math.max(5, Math.min(120, Number(body.dose) || Number(body.prefs?.dose) || 20))
  const roastHint: string | null = typeof body.roast === 'string' ? body.roast : null
  const equipment = body.equipment ?? {}
  // The grinder: a catalogue row when we have one, or just a name.
  let grinder: any = null
  if (body.grinder_id) { const { data } = await admin.from('grinders').select('*').eq('id', body.grinder_id).maybeSingle(); grinder = data }
  const grinderLabel: string | null = grinder ? grinderName(grinder) : (equipment.grinder || null)

  // ---- the coffee -------------------------------------------------------------
  let coffee: any = null
  if (coffeeId) {
    const { data } = await admin.from('coffees').select('*').eq('id', coffeeId).maybeSingle()
    coffee = data
  }
  const label = coffee ? { ...(coffee.raw ?? {}), roaster: coffee.roaster, name: coffee.name, origin: coffee.origin,
    process: coffee.process, varietal: coffee.varietal, roast_label: coffee.roast_label, roast_level: coffee.roast_level,
    roast_date: coffee.roast_date, tasting_notes: coffee.tasting_notes, altitude_m: coffee.altitude_m,
    decaf: coffee.decaf, blend: coffee.blend, confidence: coffee.confidence } : { name: 'Unknown coffee' }

  const { data: ref } = await admin.from('brew_reference').select('*').eq('method', method).maybeSingle()
  const { data: allRoasters } = await admin.from('roasters').select('*')
  const target = norm(label.roaster)
  const roaster = target ? (allRoasters ?? []).find((r: any) =>
    norm(r.name) === target || (r.aliases ?? []).some((a: string) => norm(a) === target)) ?? null : null

  // ---- 1 + 2 + 5: label rules, published ranges, roaster guide ---------------------
  const base = deriveRecipe(label, ref, roaster, coffee?.research ?? null, method, roastHint)
  const sources: { kind: string; text: string; url?: string }[] = []
  if (coffee) sources.push({ kind: 'label', text: `What the bag says${coffee.roast_level ? ` (${coffee.roast_level.replace('-', ' ')} roast)` : ''}${coffee.process ? `, ${coffee.process}` : ''}` })
  if (ref) sources.push({ kind: 'reference', text: `${ref.display_name} published ranges — ${ref.source}` })
  if (coffee?.research?.found) {
    sources.push({ kind: 'roaster', text: coffee.research.roaster_guide_found ? "The roaster's own brew guide" : 'Published guidance for this coffee' })
    for (const s of (coffee.sources ?? []).slice(0, 3)) sources.push({ kind: 'web', text: s.title, url: s.url })
  }
  if (roaster && Number(roaster.roast_bias) !== 0) sources.push({ kind: 'roaster', text: `${roaster.name} house style (${roaster.house_style ?? 'roast bias'})` })

  let ratio = base.ratio, temp = base.temp, grindUm = base.grind_microns
  const changed: { var: string; from: any; to: any; why: string }[] = []
  const why: string[] = []
  let confidence: 'high' | 'medium' | 'low' = base.roast_assumed ? 'low' : 'medium'
  if (coffee?.research?.roaster_guide_found) confidence = 'high'

  // Espresso and moka ratios come from the method, not the label. Cold brew ignores temperature.
  if (M.yieldRatio) ratio = ref ? r1((Number(ref.ratio_min) + Number(ref.ratio_max)) / 2) : M.ratio
  if (M.cold) temp = 20

  // ---- 3: community, this exact coffee + method ---------------------------------
  let community: any = null
  if (coffee) {
    const { data } = await admin.from('coffee_method_stats').select('*').eq('coffee_id', coffee.id).eq('method', method).maybeSingle()
    community = data
    if (community && community.brews >= 5 && community.avg_rating >= 7) {
      // Pull halfway toward what has worked for people — never all the way; the label still matters.
      if (community.common_ratio && !M.yieldRatio) {
        const pulled = r1((ratio + Number(community.common_ratio)) / 2)
        if (pulled !== ratio) { changed.push({ var: 'ratio', from: ratio, to: pulled, why: 'community' }); ratio = pulled }
      }
      if (community.common_temp && !M.cold) {
        const pulled = Math.round((temp + Number(community.common_temp)) / 2)
        if (pulled !== temp) { changed.push({ var: 'temp', from: temp, to: pulled, why: 'community' }); temp = pulled }
      }
      why.push(`${community.brews} people have brewed this on a ${M.name} and rate it ${community.avg_rating}/10 on average, mostly around 1:${community.common_ratio} at ${community.common_temp} °C — the recipe leans that way.`)
      sources.push({ kind: 'community', text: `${community.brews} community brews of this coffee on ${M.name}` })
      if (community.brews >= 10) confidence = 'high'
    }
  }

  // ---- 4: this person's own last brew, and what they said about it ----------------
  let last: any = null
  let next: any = null
  if (user && coffee) {
    const { data } = await admin.from('brews').select('*').eq('user_id', user.id).eq('coffee_id', coffee.id).eq('method', method)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    last = data
  }
  if (last) {
    // Their last brew is the starting point. Everything above becomes context, not the recipe.
    ratio = Number(last.ratio) || ratio
    if (last.temp_c) temp = last.temp_c
    if (last.ai_recipe?.grind_microns) grindUm = last.ai_recipe.grind_microns
    // If they dialled in on this same grinder, that setting is the truth, not the chart.
    if (grinder && last.grinder === grinderLabel && last.grind_setting && Number.isFinite(parseFloat(last.grind_setting))) {
      const um = micronsFor(grinder, parseFloat(last.grind_setting)); if (um) grindUm = um
    }
    sources.push({ kind: 'you', text: `Your last brew of this (${last.rating ? last.rating + '/10' : 'unrated'})` })
    confidence = 'high'
    next = last.next_time ?? nextTime(last.feedback ?? [], { grind_microns: grindUm, grinder: grinderLabel, temp_c: temp, ratio })
    if (next?.change) {
      const c = next.change
      if (c.var === 'ratio' && c.to) { changed.push({ var: 'ratio', from: ratio, to: c.to, why: 'your feedback' }); ratio = c.to }
      if (c.var === 'temp' && c.to)  { changed.push({ var: 'temp', from: temp, to: c.to, why: 'your feedback' }); temp = c.to }
      if (c.var === 'grind' && c.pct) {
        let to = Math.round(grindUm * (1 + c.pct))
        if (grinder) { const cur = settingFor(grinder, grindUm); if (cur != null) { const n = (Math.abs(c.pct) >= 0.08 ? 2 : 1) * Math.sign(c.pct); to = micronsFor(grinder, stepSetting(grinder, cur, n)) ?? to } }
        changed.push({ var: 'grind', from: grindUm, to, why: 'your feedback' }); grindUm = to
      }
      why.unshift(`Last time you said ${(last.feedback ?? []).map((f: string) => f.replace(/_/g, ' ')).join(', ')}. ${next.why}`)
    } else if (next) {
      why.unshift(`Last time was ${last.rating ? last.rating + '/10' : 'good'} and you said it was just right — this is that recipe again.`)
    } else {
      why.unshift(`Starting from your last brew of this coffee${last.rating ? ` (${last.rating}/10)` : ''}.`)
    }
  } else {
    // No history: explain the label-driven choices.
    const bits: string[] = []
    if (base.roast_level && !base.roast_assumed) bits.push(`a ${base.roast_level.replace('-', ' ')} roast`)
    if (label.process) bits.push(label.process.toLowerCase())
    if (label.origin && !label.blend) bits.push(`from ${label.origin}`)
    if (label.blend) bits.push('a blend')
    if (bits.length) why.push(`This is ${bits.join(', ')}. ${base.roast_level === 'light' || base.roast_level === 'medium-light'
      ? 'Lighter roasts are dense and less soluble, so the water runs hot and the grind sits on the fine side of the range.'
      : base.roast_level === 'dark' || base.roast_level === 'very-dark' ? 'Dark roasts give up their solubles fast, so the water is cooler and the grind coarser to keep bitterness in check.'
      : 'Middle-of-the-range numbers for the method, nudged by what the label says.'}`)
    for (const n of base.notes) why.push(n)
  }

  // ---- put it together --------------------------------------------------------------
  const water = M.yieldRatio ? r1(dose * ratio) : r5(dose * ratio)
  const steps = M.steps(dose, water, base.bloom ?? 2.5)
  const total = steps[steps.length - 1].t[1]
  const recipe = {
    method, method_name: M.name, dose, water, ratio, temp,
    temp_note: M.cold ? 'Room temperature' : null,
    grind_label: base.grind, grind_microns: grindUm, bloom: base.bloom,
    roast_level: base.roast_level, roast_assumed: base.roast_assumed,
    steps, total,
    grind_hint: grinderLabel ? `${base.grind} on your ${grinderLabel}` : base.grind,
    grinder: grinder ? { id: grinder.id, brand: grinder.brand, model: grinder.model, scale: grinder.scale, note: grinder.note } : grinderLabel ? { name: grinderLabel } : null,
    grind_setting: grinder ? fmtSetting(grinder, settingFor(grinder, grindUm)) : null,
    grind_setting_num: grinder ? settingFor(grinder, grindUm) : null,
  }
  if (grinder) sources.push({ kind: 'grinder', text: `${grinderName(grinder)} grind chart (approximate — burrs vary by a step or two)` })
  if (!why.length) why.push(`${M.name} published ranges${ref ? `` : ''}, set for ${base.basis.replace(/^.*set for /, '')}.`)

  return json({
    recipe,
    why: why.join(' '),
    confidence,
    changed,
    sources,
    community: community ? { brews: community.brews, avg_rating: community.avg_rating, recommend_pct: community.recommend_pct,
      common_ratio: community.common_ratio, common_temp: community.common_temp, common_grind: community.common_grind, avg_seconds: community.avg_seconds } : null,
    last_brew: last ? { id: last.id, rating: last.rating, feedback: last.feedback, created_at: last.created_at } : null,
    basis: base.basis,
  })
})
