// Run:  node --test test/   (after: npx esbuild recipe.ts --format=esm --outfile=test/recipe.mjs)
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveRecipe, mergeLabel, processRule, densityShift } from './recipe.mjs'

const REF = {
  v60:         { method:'v60', display_name:'Hario V60', grind_label:'Medium-fine', grind_min_um:450, grind_max_um:750, temp_min_c:90, temp_max_c:96, ratio_min:'15.0', ratio_max:'17.0' },
  frenchpress: { method:'frenchpress', display_name:'French Press', grind_label:'Coarse', grind_min_um:800, grind_max_um:1200, temp_min_c:92, temp_max_c:96, ratio_min:'14.0', ratio_max:'17.0' },
  chemex:      { method:'chemex', display_name:'Chemex', grind_label:'Medium-coarse', grind_min_um:700, grind_max_um:900, temp_min_c:92, temp_max_c:96, ratio_min:'15.0', ratio_max:'17.0' },
}
const strawberry = { name:'The New School Strawberry', roaster:'Unknown roaster', roast_level:'light', blend:true,
  tasting_notes:'strawberry jam, canned pineapple, milk chocolate', confidence:0.95 }

test('a null roast is assumed medium, flagged, and never written as a fact', () => {
  const r = deriveRecipe({ name:'X', roaster:'Y' }, REF.v60, null, null, 'v60')
  assert.equal(r.roast_assumed, true)
  assert.equal(r.roast_level, 'medium')
  assert.match(r.notes[0], /not printed/)
  const known = deriveRecipe(strawberry, REF.v60, null, null, 'v60')
  assert.equal(known.roast_assumed, false)
})

test('light roast in a V60 goes hotter and finer than medium', () => {
  const light = deriveRecipe(strawberry, REF.v60, null, null, 'v60')
  const med = deriveRecipe({ ...strawberry, roast_level:'medium' }, REF.v60, null, null, 'v60')
  assert.ok(light.temp > med.temp, `${light.temp} > ${med.temp}`)
  assert.ok(light.grind_microns < med.grind_microns)
  assert.equal(light.temp, 96)      // (90+96)/2 + 2.5 = 95.5 → 96, the top of the V60 range
})

test('the same bag re-tailored for French press moves everything', () => {
  const v = deriveRecipe(strawberry, REF.v60, null, null, 'v60')
  const f = deriveRecipe(strawberry, REF.frenchpress, null, null, 'frenchpress')
  assert.ok(f.grind_microns > v.grind_microns + 200)
  assert.notEqual(f.ratio, v.ratio)
  assert.equal(f.method, 'frenchpress')
})

test('process rules: natural cooler+coarser than washed; anaerobic more so; washed no change', () => {
  const base = { ...strawberry, roast_level:'medium', blend:false }
  const washed = deriveRecipe({ ...base, process:'Washed' }, REF.v60, null, null, 'v60')
  const natural = deriveRecipe({ ...base, process:'Natural' }, REF.v60, null, null, 'v60')
  const anaerobic = deriveRecipe({ ...base, process:'Anaerobic natural' }, REF.v60, null, null, 'v60')
  assert.equal(washed.temp, 93); assert.equal(washed.notes.length, 0)
  assert.ok(natural.temp < washed.temp); assert.ok(natural.grind_microns > washed.grind_microns)
  assert.ok(anaerobic.temp < natural.temp); assert.ok(anaerobic.grind_microns > natural.grind_microns)
  assert.equal(processRule('Anaerobic natural').key, 'anaerobic')   // anaerobic must win over natural
  assert.equal(processRule('Fully washed').key, 'washed')
  assert.equal(processRule('Black honey').key, 'honey')
  assert.equal(processRule(null), null)
})

test('decaf grinds coarser; detected from name too', () => {
  const reg = deriveRecipe({ ...strawberry, roast_level:'medium' }, REF.v60, null, null, 'v60')
  const dec = deriveRecipe({ ...strawberry, roast_level:'medium', decaf:true }, REF.v60, null, null, 'v60')
  const byName = deriveRecipe({ ...strawberry, roast_level:'medium', name:'House Decaf' }, REF.v60, null, null, 'v60')
  assert.ok(dec.grind_microns > reg.grind_microns)
  assert.equal(byName.grind_microns, dec.grind_microns)
})

test('altitude beats origin; origin never applies to blends; density fades with dark roast', () => {
  assert.ok(densityShift({ altitude_m: 1900 }, 'light').temp > 0)
  assert.ok(densityShift({ altitude_m: 1000 }, 'light').temp < 0)
  assert.equal(densityShift({ altitude_m: 1500 }, 'light'), null)
  assert.ok(densityShift({ origin:'Ethiopia' }, 'light').temp > 0)
  assert.equal(densityShift({ origin:'Ethiopia', blend:true }, 'light'), null)
  assert.equal(densityShift({ origin:'Ethiopia' }, 'dark'), null)
  assert.ok(densityShift({ origin:'Brazil' }, 'medium').temp < 0)
  assert.equal(densityShift({ origin:'Somewhere' }, 'light'), null)
})

test('never leaves the published range', () => {
  // light + anaerobic + high altitude + very fresh: pushes in both directions, must stay clamped
  const r = deriveRecipe({ name:'x', roast_level:'light', process:'anaerobic', altitude_m:2100 }, REF.v60, null, null, 'v60')
  assert.ok(r.temp >= 90 && r.temp <= 96); assert.ok(r.grind_microns >= 450 && r.grind_microns <= 750)
  const d = deriveRecipe({ name:'x', roast_level:'very-dark', process:'natural', decaf:true }, REF.chemex, null, null, 'chemex')
  assert.ok(d.temp >= 92 && d.temp <= 96); assert.ok(d.grind_microns >= 700 && d.grind_microns <= 900)
})

test('roaster bias shifts roast, and Starbucks medium becomes dark', () => {
  const sb = { name:'Pike Place', roast_bias: 1.0, confidence:'high', roast_level:'medium' }
  const r = deriveRecipe({ name:'Pike Place', roast_level:'medium' }, REF.v60, sb, null, 'v60')
  assert.equal(r.roast_level, 'medium-dark')
  assert.match(r.notes[0], /roasts darker/)
})

test('research overrides only for its own method, shown otherwise', () => {
  const research = { found:true, guide_method:'v60', water_temp_c:94, ratio:15.5, roaster_guide_found:true, advice:'Pour slowly.' }
  const v = deriveRecipe(strawberry, REF.v60, null, research, 'v60')
  assert.equal(v.temp, 94); assert.equal(v.ratio, 15.5); assert.equal(v.guide, null)
  assert.match(v.basis, /roaster's own/)
  const f = deriveRecipe(strawberry, REF.frenchpress, null, research, 'frenchpress')
  assert.notEqual(f.temp, 94); assert.equal(f.guide.method, 'v60'); assert.match(f.guide.text, /94 °C/)
  assert.ok(!f.notes.includes('Pour slowly.'))
})

test('merge: a blank never overwrites a value; higher confidence wins a disagreement', () => {
  const first = { roaster:'Unknown roaster', name:'S', roast_level:'light', tasting_notes:'jam', confidence:0.95 }
  const second = { roaster:'Unknown roaster', name:'S', roast_level:null, tasting_notes:'jam', confidence:0.95 }
  const m = mergeLabel(first, second)
  assert.equal(m.roast_level, 'light')
  const third = { roaster:'Black & White', name:'S', roast_level:'medium-light', confidence:0.7 }
  const m2 = mergeLabel(m, third)
  assert.equal(m2.roast_level, 'light')          // 0.95 beats 0.7
  assert.equal(m2.roaster, 'Black & White')      // a known roaster always replaces Unknown
  const m3 = mergeLabel(m2, { roaster:null, name:'S', roast_level:'medium-light', confidence:0.98 })
  assert.equal(m3.roast_level, 'medium-light')   // 0.98 beats 0.95
  assert.equal(m3.roaster, 'Black & White')      // null never clobbers
  assert.equal(mergeLabel(null, first).roast_level, 'light')
})

test('roast hint fills a blank label and overrides a read one only when buckets differ', () => {
  const blank = deriveRecipe({ name:'x' }, REF.v60, null, null, 'v60', 'light')
  assert.equal(blank.roast_level, 'light'); assert.equal(blank.roast_assumed, true); assert.match(blank.notes[0], /assuming light/)
  const agree = deriveRecipe({ name:'x', roast_level:'medium-light' }, REF.v60, null, null, 'v60', 'light')
  assert.equal(agree.roast_level, 'medium-light'); assert.equal(agree.roast_overridden, false)
  const disagree = deriveRecipe({ name:'x', roast_level:'light' }, REF.v60, null, null, 'v60', 'dark')
  assert.equal(disagree.roast_level, 'dark'); assert.equal(disagree.roast_overridden, true); assert.match(disagree.notes[0], /Going with yours/)
  const junk = deriveRecipe({ name:'x', roast_level:'light' }, REF.v60, null, null, 'v60', 'burnt')
  assert.equal(junk.roast_level, 'light')
})
