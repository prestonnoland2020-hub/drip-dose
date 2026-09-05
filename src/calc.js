// Brewing arithmetic. Pure.
import { byId } from './methods.js'

export const water = (dose, ratio) => dose * ratio
export const dose = (water, ratio) => water / ratio
export const ratio = (dose, water) => water / dose
export function scale(recipe, toWater) {   // scale a recipe to a different beverage size, keeping ratio
  const f = toWater / recipe.water
  return { ...recipe, dose: Math.round(recipe.dose * f * 2) / 2, water: Math.round(toWater),
    steps: recipe.steps?.map(s => ({ ...s, target: s.target == null ? null : Math.round(s.target * f / 5) * 5 })) }
}
// Extraction yield from TDS. EY% = TDS% × beverage mass / dose. Beverage ≈ water − retained (2 g per g of coffee).
export function extraction({ tds, dose, water, beverage }) {
  const bev = beverage ?? Math.max(0, water - dose * 2)
  return tds && dose ? (tds * bev) / dose : null
}
export const strengthWord = tds => tds == null ? '' : tds < 1.15 ? 'weak' : tds <= 1.35 ? 'balanced' : tds <= 1.5 ? 'strong' : 'very strong'
export const eyWord = ey => ey == null ? '' : ey < 18 ? 'under-extracted' : ey <= 22 ? 'in the sweet spot' : 'over-extracted'

// Caffeine: C(t) = C_dry · Emax · (1 − e^(−kt)); k moves with roast and temperature.
const MG = { arabica: 12, robusta: 22 }
const KMUL = { light: 0.90, medium: 1.0, dark: 1.10 }
export function caffeine({ dose, method, roast = 'medium', species = 'arabica', temp = 93, seconds }) {
  const M = byId(method)
  const k = M.k * (KMUL[roast] ?? 1) * (1 + (temp - 93) * 0.015)
  const cdry = dose * (MG[species] ?? 12)
  return cdry * M.emax * (1 - Math.exp(-k * (seconds ?? 180)))
}
