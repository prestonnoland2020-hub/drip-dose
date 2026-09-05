// POR — from "how was it?" to "what to change next time"
//
// One variable at a time. A brewer who changes grind, temperature and ratio at
// once learns nothing about which one mattered. Priority when several things
// are wrong: extraction faults first (they are the biggest lever), then
// strength, then texture. The rest is mentioned, not acted on.

export const FEEDBACK = [
  { id: 'too_sour',        label: 'Too sour',        group: 'extraction' },
  { id: 'too_acidic',      label: 'Too acidic',      group: 'extraction' },
  { id: 'too_bitter',      label: 'Too bitter',      group: 'extraction' },
  { id: 'too_astringent',  label: 'Too astringent',  group: 'extraction' },
  { id: 'too_dry',         label: 'Too dry',         group: 'extraction' },
  { id: 'too_weak',        label: 'Too weak',        group: 'strength' },
  { id: 'too_strong',      label: 'Too strong',      group: 'strength' },
  { id: 'too_flat',        label: 'Too flat',        group: 'texture' },
  { id: 'too_little_body', label: 'Too little body', group: 'texture' },
  { id: 'too_much_body',   label: 'Too much body',   group: 'texture' },
  { id: 'just_right',      label: 'Just right',      group: 'ok' },
]

// Each rule names the ONE variable to move and by how much, in plain words.
// grindPct: fraction of grind size (+ = coarser). temp: °C. ratio: points of 1:x.
const RULES: Record<string, any> = {
  too_sour:        { var: 'grind', grindPct: -0.08, why: 'Sour means under-extraction — the water did not pull enough sweetness out. A finer grind gives it more surface to work on.' },
  too_acidic:      { var: 'grind', grindPct: -0.06, why: 'Sharp acidity with little sweetness behind it is under-extraction. Slightly finer brings the sweetness up to meet it.' },
  too_bitter:      { var: 'grind', grindPct: +0.08, why: 'Bitter is over-extraction. Coarser slows the water down and stops it pulling the harsh end out.' },
  too_astringent:  { var: 'temp',  temp: -2,        why: 'That drying, sandpaper feel comes from over-extracting the fines. Cooler water is the gentlest fix; grind is next if it persists.' },
  too_dry:         { var: 'temp',  temp: -2,        why: 'Dryness is astringency’s cousin — ease the temperature off before touching the grind.' },
  too_weak:        { var: 'ratio', ratio: -1,       why: 'Weak is strength, not extraction: there is too much water for the coffee. Less water, same everything else.' },
  too_strong:      { var: 'ratio', ratio: +1,       why: 'Too strong is a ratio problem. More water, same grind and temperature.' },
  too_flat:        { var: 'temp',  temp: +2,        why: 'Flat usually means the aromatics never got going. Hotter water lifts extraction across the board.' },
  too_little_body: { var: 'ratio', ratio: -1,       why: 'Body tracks strength. A tighter ratio puts more coffee in the cup without changing what you extract.' },
  too_much_body:   { var: 'grind', grindPct: +0.06, why: 'Heavy, muddy body comes from fines. Coarser cleans it up.' },
  just_right:      { var: null,                     why: 'That is your recipe for this coffee. Change nothing.' },
}
const PRIORITY = ['extraction', 'strength', 'texture', 'ok']

// feedback: string[] of ids. last: { grind_microns?, grind_setting?, grinder?, temp_c, ratio }
// Returns { change: {var, from, to, text} | null, why, also: string[] }
export function nextTime(feedback: string[], last: any = {}) {
  const ids = (feedback || []).filter(f => RULES[f])
  if (!ids.length) return null
  if (ids.includes('just_right')) return { change: null, why: RULES.just_right.why, also: [] }
  // pick the first by group priority, then by the order the brewer tapped them
  const chosen = PRIORITY.map(g => ids.find(id => FEEDBACK.find(f => f.id === id)?.group === g)).find(Boolean)
  const r = RULES[chosen]
  const others = ids.filter(i => i !== chosen).map(i => FEEDBACK.find(f => f.id === i)?.label.toLowerCase())
  let change = null
  if (r.var === 'grind') {
    const dir = r.grindPct > 0 ? 'coarser' : 'finer'
    const clicks = Math.abs(r.grindPct) >= 0.08 ? '2' : '1–2'
    const from = last.grind_microns ?? null
    const to = from ? Math.round(from * (1 + r.grindPct)) : null
    const steps = Math.abs(r.grindPct) >= 0.08 ? 2 : 1
    const cur = last.grind_setting != null && last.grind_setting !== '' ? parseFloat(last.grind_setting) : NaN
    const stepSize = Number(last.grind_step) || 1
    const finerIsLower = last.finest_is_low !== false
    const nextSetting = Number.isFinite(cur) ? Math.round((cur + (dir === 'finer' ? -1 : 1) * (finerIsLower ? 1 : -1) * steps * stepSize) * 100) / 100 : null
    change = { var: 'grind', from, to, pct: r.grindPct, setting_from: Number.isFinite(cur) ? cur : null, setting_to: nextSetting,
      text: last.grinder && nextSetting != null ? `Set your ${last.grinder} to ${String(nextSetting).replace(/\.0$/, '')} (was ${String(cur).replace(/\.0$/, '')}, ${steps === 1 ? 'one step' : 'two steps'} ${dir})`
        : last.grinder ? `Grind ${clicks} clicks ${dir} on your ${last.grinder}` : `Grind one step ${dir}` }
  } else if (r.var === 'temp') {
    const from = last.temp_c ?? null, to = from ? from + r.temp : null
    change = { var: 'temp', from, to, delta: r.temp, text: `Water ${r.temp > 0 ? '+' : ''}${r.temp} °C${from ? ` (${from} → ${to} °C)` : ''}` }
  } else if (r.var === 'ratio') {
    const from = last.ratio ?? null, to = from ? Math.round((from + r.ratio) * 2) / 2 : null
    change = { var: 'ratio', from, to, delta: r.ratio, text: `Ratio ${from ? `1:${from} → 1:${to}` : (r.ratio < 0 ? 'one point tighter' : 'one point looser')}` }
  }
  const keep = { grind: 'ratio and temperature', temp: 'grind and ratio', ratio: 'grind and temperature' }[r.var]
  return {
    change,
    why: `${r.why} Keep your ${keep} the same.`,
    also: others.length ? [`Also noted: ${others.join(', ')}. One change at a time — we’ll look at that after this.`] : [],
  }
}
