// POR — recipe derivation
//
// Everything in here is deterministic and runs on what the label says. No model,
// no network. Each rule is small, cites the reasoning next to it, and explains
// itself on the card in one line, so a brewer can see why a number moved and
// disagree with it.
//
// Shifts are deliberately modest (grind shifts were halved after checking them
// against real grinder charts: a light-roast V60 should land a click or two finer
// than the grinder's usual pour-over setting, not at its espresso end). The published per-method ranges in
// brew_reference are the frame; the label nudges within it.

export const ORDER = ['light', 'medium-light', 'medium', 'medium-dark', 'dark', 'very-dark'] as const
export type RoastLevel = typeof ORDER[number]

// Roast shifts the middle of each method's published range: lighter roasts are denser
// and less soluble, so they want hotter water and a finer grind; dark roasts are
// porous and give up their solubles fast, so the reverse.
export const ROAST_SHIFT: Record<string, { temp: number; grind: number; bloom: number }> = {
  'light':        { temp:  +2.5, grind: -0.12, bloom: 2.5 },
  'medium-light': { temp:  +1.5, grind: -0.06, bloom: 2.5 },
  'medium':       { temp:   0,   grind:  0,    bloom: 2.5 },
  'medium-dark':  { temp:  -2.0, grind: +0.08, bloom: 2.5 },
  'dark':         { temp:  -4.0, grind: +0.15, bloom: 2.0 },
  'very-dark':    { temp:  -5.5, grind: +0.22, bloom: 2.0 },
}

export function shiftRoast(level: string, by: number) {
  const i = ORDER.indexOf(level as RoastLevel)
  return i < 0 ? level : ORDER[Math.max(0, Math.min(ORDER.length - 1, Math.round(i + by)))]
}

// ---- process ---------------------------------------------------------------
// How the fruit was removed changes how soluble the bean is. Washed is the baseline.
// Dried-in-fruit coffees carry more sugars and ferment character, extract faster,
// and turn muddy or boozy when pushed with heat — so a touch cooler and coarser.
// Anaerobic and other fermentation-forward lots are the extreme of that.
type ProcessRule = { key: string; test: RegExp; temp: number; grind: number; note: string }
export const PROCESS_RULES: ProcessRule[] = [
  { key: 'anaerobic', test: /anaerob|carbonic|macerat|co-?ferment|thermal shock|yeast|lactic|experimental|infus/i,
    temp: -2.5, grind: +0.08,
    note: 'Fermentation-forward process extracts fast — cooler water, coarser grind and gentle pours keep it clean.' },
  { key: 'natural', test: /\bnatural|\bdry[- ]process|sun[- ]dried|\bdry\b/i,
    temp: -1.5, grind: +0.05,
    note: 'Natural process: sweeter and more soluble, so slightly cooler and coarser than a washed lot.' },
  { key: 'honey', test: /honey|pulped natural|semi[- ]wash|miel/i,
    temp: -1.0, grind: +0.03,
    note: 'Honey process sits between washed and natural — a small step cooler and coarser.' },
  { key: 'wet-hulled', test: /wet[- ]hull|giling basah/i,
    temp: -1.0, grind: +0.05,
    note: 'Wet-hulled: heavy body and earthy tones come easily, so ease off temperature and grind a bit coarser.' },
  { key: 'washed', test: /wash|\bwet[- ]process/i, temp: 0, grind: 0, note: '' },
]
export function processRule(process: string | null | undefined) {
  if (!process) return null
  return PROCESS_RULES.find(r => r.test.test(process)) ?? null
}

// ---- decaf -----------------------------------------------------------------
// Decaffeination weakens the cell structure; decaf beans are more porous, take on
// colour faster in the roaster (they look darker than they are), and extract faster.
// The roast scale on the bag is still the truth for roast; the grind is what moves.
export const DECAF = { temp: -1.0, grind: +0.08,
  note: 'Decaf beans are more porous and extract faster — grind coarser than the roast alone suggests.' }
export const DECAF_TEST = /decaf|decaffeinated|swiss water|sugar ?cane|\bEA\b|CO2 process/i

// ---- density: altitude, or origin as a weaker proxy --------------------------
// Coffee grown high and slow is denser and harder, and needs more energy to extract:
// hotter water, finer grind. The label's altitude is the real signal. Origin alone
// is only a tendency, so it is applied at half strength and never to blends.
// Dark roasts erase most density differences — the shift fades out with roast.
export const DENSE_ORIGINS  = /ethiopia|kenya|colombia|guatemala|rwanda|burundi|bolivia|peru|panama|costa rica|yemen|huehue|nari[nñ]o|huila|yirg|sidam|guji|nyeri|kirinyaga/i
export const SOFT_ORIGINS   = /brazil|brasil|hawaii|kona|india|vietnam|laos|thailand|philippines|minas|cerrado|mogiana/i

export function densityShift(p: { altitude_m?: number | null; origin?: string | null; blend?: boolean | null }, level: string) {
  const roastFade = level === 'light' || level === 'medium-light' ? 1 : level === 'medium' ? 0.75 : level === 'medium-dark' ? 0.4 : 0
  if (roastFade === 0) return null
  const alt = Number(p.altitude_m)
  if (Number.isFinite(alt) && alt > 0) {
    if (alt >= 1800) return { temp: +1.0 * roastFade, grind: -0.03 * roastFade,
      note: `Grown at ${Math.round(alt)} m — dense beans want a little more heat and a finer grind.` }
    if (alt <= 1200) return { temp: -1.0 * roastFade, grind: +0.03 * roastFade,
      note: `Grown at ${Math.round(alt)} m — softer beans extract easily; a touch cooler and coarser.` }
    return null
  }
  if (p.blend || !p.origin) return null
  if (DENSE_ORIGINS.test(p.origin)) return { temp: +0.5 * roastFade, grind: -0.015 * roastFade,
    note: `${p.origin.trim()} is typically high-grown and dense — a little more heat helps.` }
  if (SOFT_ORIGINS.test(p.origin)) return { temp: -0.5 * roastFade, grind: +0.015 * roastFade,
    note: `${p.origin.trim()} is typically lower-grown and soft — ease off the heat a touch.` }
  return null
}

// ---- merging two reads of the same bag ---------------------------------------
// A scan never replaces a known value with a blank. When both reads have a value
// and disagree, the more confident read wins; on a tie the newer one does.
export const LABEL_FIELDS = ['origin', 'process', 'varietal', 'roast_label', 'roast_level', 'roast_date',
  'tasting_notes', 'altitude_m', 'decaf', 'blend'] as const
export function mergeLabel(existing: any, fresh: any) {
  if (!existing) return { ...fresh }
  const out: any = { ...existing, ...fresh }
  const freshWins = Number(fresh?.confidence ?? 0) >= Number(existing?.confidence ?? 0)
  for (const f of LABEL_FIELDS) {
    const a = existing?.[f], b = fresh?.[f]
    const aHas = a !== null && a !== undefined && a !== '' && a !== false
    const bHas = b !== null && b !== undefined && b !== '' && b !== false
    out[f] = bHas && aHas ? (freshWins ? b : a) : bHas ? b : aHas ? a : (b ?? a ?? null)
  }
  const known = (r: any) => r && r !== 'Unknown roaster'
  out.roaster = known(fresh?.roaster) ? fresh.roaster : known(existing?.roaster) ? existing.roaster : 'Unknown roaster'
  out.name = fresh?.name || existing?.name
  out.confidence = Math.max(Number(existing?.confidence ?? 0), Number(fresh?.confidence ?? 0))
  return out
}

// ---- the recipe ---------------------------------------------------------------
// The app only has three roast buttons; the label has six levels. Same bucket = agreement.
export const BUCKET: Record<string, string> = { 'light': 'light', 'medium-light': 'light', 'medium': 'medium',
  'medium-dark': 'dark', 'dark': 'dark', 'very-dark': 'dark' }

// roastHint is what the brewer has set in the app. It fills the gap when the bag says
// nothing, and it wins when the brewer deliberately disagrees with the bag.
export function deriveRecipe(parsed: any, ref: any, roaster: any, researchData: any, method: string, roastHint?: string | null) {
  const notes: string[] = []
  const hint = roastHint && BUCKET[roastHint] ? roastHint : null
  const roastAssumed = !parsed.roast_level
  let level: string = parsed.roast_level ?? hint ?? 'medium'
  let roastOverridden = false
  if (roastAssumed) {
    notes.push(`Roast not printed on the bag — assuming ${level}. Pick the roast yourself if you know it.`)
  } else if (hint && BUCKET[parsed.roast_level] !== hint) {
    level = hint; roastOverridden = true
    notes.push(`You set ${hint}; the bag says ${String(parsed.roast_level).replace('-', ' ')}. Going with yours.`)
  }

  if (roaster && Number(roaster.roast_bias) !== 0 && roaster.confidence !== 'low') {
    const adj = shiftRoast(level, Number(roaster.roast_bias))
    if (adj !== level) {
      notes.push(`${roaster.name} ${Number(roaster.roast_bias) > 0 ? 'roasts darker' : 'roasts lighter'} than the label suggests, so this is treated as ${adj.replace('-', ' ')}.`)
      level = adj
    }
  }

  const sh = ROAST_SHIFT[level] ?? ROAST_SHIFT['medium']
  const tMin = ref ? Number(ref.temp_min_c) : 88, tMax = ref ? Number(ref.temp_max_c) : 96
  const gMin = ref ? Number(ref.grind_min_um) : 400, gMax = ref ? Number(ref.grind_max_um) : 900
  let temp = (tMin + tMax) / 2 + sh.temp
  let grindMul = 1 + sh.grind
  let bloom = sh.bloom
  const why: string[] = [`${level.replace('-', ' ')} roast`]

  const pr = processRule(parsed.process)
  if (pr && (pr.temp || pr.grind)) { temp += pr.temp; grindMul += pr.grind; notes.push(pr.note); why.push(pr.key) }

  const isDecaf = parsed.decaf === true || DECAF_TEST.test(String(parsed.name ?? '')) || DECAF_TEST.test(String(parsed.roast_label ?? ''))
  if (isDecaf) { temp += DECAF.temp; grindMul += DECAF.grind; notes.push(DECAF.note); why.push('decaf') }

  const dz = densityShift(parsed, level)
  if (dz) { temp += dz.temp; grindMul += dz.grind; notes.push(dz.note); why.push('altitude') }

  const days = parsed.roast_date
    ? Math.max(0, Math.round((Date.now() - Date.parse(parsed.roast_date)) / 86_400_000)) : null
  if (days !== null && Number.isFinite(days)) {
    if (days <= 7) { bloom = 3.0; notes.push('Very fresh — still degassing, so bloom longer and expect a big dome.') }
    else if (days >= 45) { grindMul -= 0.03; notes.push(`About ${days} days off roast — ground a touch finer to compensate.`) }
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const recipe: any = {
    method,
    method_name: ref?.display_name ?? method,
    temp: Math.round(clamp(temp, tMin, tMax)),
    grind_microns: Math.round(clamp((gMin + gMax) / 2 * grindMul, gMin, gMax)),
    grind: ref?.grind_label ?? 'Medium',
    ratio: ref ? Number(((Number(ref.ratio_min) + Number(ref.ratio_max)) / 2).toFixed(1)) : 16,
    bloom,
    roast_level: level,
    roast_assumed: roastAssumed,
    roast_overridden: roastOverridden,
    notes,
    guide: null as any,
    about: researchData?.about ?? null,
    basis: ref ? `${ref.display_name} published ranges, set for ${why.join(', ')}` : 'method defaults',
  }

  // Research numbers override the label-derived ones ONLY for the method they were
  // written for. A roaster's V60 temperature is not a French press temperature.
  if (researchData?.found) {
    const gm = researchData.guide_method
    if (!gm || gm === method) {
      if (researchData.water_temp_c)  recipe.temp = Math.round(researchData.water_temp_c)
      if (researchData.grind_microns) recipe.grind_microns = Math.round(researchData.grind_microns)
      if (researchData.grind_note)    recipe.grind = researchData.grind_note
      if (researchData.ratio)         recipe.ratio = Number(researchData.ratio)
      recipe.basis = researchData.roaster_guide_found ? "the roaster's own brew guide" : 'published guidance found for this coffee'
      if (researchData.advice) notes.push(researchData.advice)
    } else {
      const bits = [
        researchData.ratio ? `1:${researchData.ratio}` : null,
        researchData.water_temp_c ? `${Math.round(researchData.water_temp_c)} °C` : null,
        researchData.grind_note,
      ].filter(Boolean)
      if (bits.length) recipe.guide = { method: gm, text: bits.join(' · ') }
    }
  }
  return recipe
}
