// POR — brewing method registry
// One place for every method. Adding a brewer means adding an entry here and
// (server-side) a brew_reference row. Nothing else in the app knows a method by name.
//
// steps(dose, water, bloomMul) returns the guided timeline for that dose:
//   { t:[start,end] seconds, type:'pour'|'wait'|'action'|'press', label, target:cumulative grams|null }

const round5 = g => Math.round(g / 5) * 5
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
// Seconds to pour `g` grams at `rate` g/s, in 5 s steps. Floors keep a small pour from
// being a splash; the cap keeps a big one from turning into a trickle that drops the bed temp.
const pourSecs = (g, rate, lo = 10, hi = 45) => clamp(Math.round(g / rate / 5) * 5, lo, hi)
// Turn a list of durations into the timeline the timer plays: { t:[start,end], ... }
function timeline(parts) {
  let t = 0
  return parts.filter(Boolean).map(p => { const s = { ...p, t: [t, t + p.dur] }; delete s.dur; t += p.dur; return s })
}
// Split `grams` across `n` pours and return cumulative targets ending exactly at `w`.
function cumulative(from, w, n) {
  const each = (w - from) / n
  return Array.from({ length: n }, (_, i) => i === n - 1 ? w : round5(from + each * (i + 1)))
}

// Hoffmann's V60 schedules. Under ~320 g of water it is his 1-cup method (2023): bloom, then
// four equal 10 s pours 25 s apart, done by 3:00. Above that it is his 2019 technique: bloom,
// a pour to 60 % at ~8 g/s, a slower pour to the top at ~6.5 g/s, a swirl, done by ~3:30 at 500 g.
function v60Schedule(d, w, bm, drawdownAdj = 0) {
  const bloom = Math.min(round5(d * bm), w)
  if (w <= 320) {
    const targets = cumulative(bloom, w, 4)
    const parts = [
      { dur: 10, type: 'pour', label: 'Bloom', target: bloom, hint: 'Wet every ground, then swirl' },
      { dur: 35, type: 'wait', label: 'Let it bloom', target: null, hint: 'Gas escapes — watch the dome' },
    ]
    targets.forEach((tg, i) => {
      parts.push({ dur: 10, type: 'pour', label: `Pour ${i + 2}`, target: tg, hint: i === 0 ? 'Gentle circles, wet the walls' : 'Same pace, same circles' })
      if (i < 3) parts.push({ dur: 15, type: 'wait', label: 'Let it drain', target: null, hint: 'Level drops, then pour again' })
    })
    const poured = 45 + 4 * 10 + 3 * 15 // 130
    parts.push({ dur: 10, type: 'action', label: 'Gentle swirl', target: w, hint: 'Flatten the bed' })
    parts.push({ dur: Math.max(30, 180 + drawdownAdj - poured - 10), type: 'wait', label: 'Drawdown', target: w, hint: 'Done when the bed is flat and dry' })
    return timeline(parts)
  }
  const mid = round5(w * 0.6)
  const p2 = pourSecs(mid - bloom, 8), p3 = pourSecs(w - mid, 6.5)
  const parts = [
    { dur: 10, type: 'pour', label: 'Bloom', target: bloom, hint: 'Wet every ground, then swirl' },
    { dur: 35, type: 'wait', label: 'Let it bloom', target: null, hint: 'Gas escapes — watch the dome' },
    { dur: p2, type: 'pour', label: 'Pour 2', target: mid, hint: 'Steady spiral, hold the level' },
    { dur: p3, type: 'pour', label: 'Pour 3', target: w, hint: 'Slower now, straight down the middle' },
    { dur: 10, type: 'action', label: 'Gentle swirl', target: w, hint: 'Flatten the bed' },
  ]
  const poured = 45 + p2 + p3 + 10
  const finish = Math.round(180 + (w - 250) * 0.12) + drawdownAdj // 210 s at 500 g, 240 s at 750 g
  parts.push({ dur: Math.max(45, finish - poured), type: 'wait', label: 'Drawdown', target: w, hint: 'Done when the bed is flat and dry' })
  return timeline(parts)
}

// Chemex: thick paper and a big bed. 45 s bloom, then three pours at ~5 g/s with short pauses to
// let the level fall below the rim, finishing around 4:00 at 500 g and 4:30 at 700 g.
function chemexSchedule(d, w, bm) {
  const bloom = Math.min(round5(d * bm), w)
  const targets = cumulative(bloom, w, 3)
  const parts = [
    { dur: 15, type: 'pour', label: 'Bloom', target: bloom, hint: 'Saturate the whole bed, wait for the dome' },
    { dur: 30, type: 'wait', label: 'Let it bloom', target: null },
  ]
  let from = bloom, poured = 45
  targets.forEach((tg, i) => {
    const secs = pourSecs(tg - from, 5)
    parts.push({ dur: secs, type: 'pour', label: `Pour ${i + 2}`, target: tg, hint: i === 2 ? 'Keep the level below the rim' : 'Spiral out, then back to the middle' })
    poured += secs
    if (i < 2) { parts.push({ dur: 20, type: 'wait', label: 'Let it drain', target: null, hint: 'Let the level fall a little' }); poured += 20 }
    from = tg
  })
  const finish = Math.round(240 + (w - 500) * 0.15)
  parts.push({ dur: Math.max(60, finish - poured), type: 'wait', label: 'Drawdown', target: w, hint: 'Done when the bed is flat and dry' })
  return timeline(parts)
}

// Kalita Wave: flat bed, pulse pours. Bloom 30 s, then equal pulses of about 60 g started every
// 30 s, each poured at ~5 g/s; drawdown about 45 s after the last pulse (3:15 at 300 g).
function kalitaSchedule(d, w, bm) {
  const bloom = Math.min(round5(d * bm), w)
  const n = clamp(Math.round((w - bloom) / 60), 3, 6)
  const targets = cumulative(bloom, w, n)
  const parts = [
    { dur: 10, type: 'pour', label: 'Bloom', target: bloom, hint: 'Wet every ground, then swirl' },
    { dur: 20, type: 'wait', label: 'Let it bloom', target: null },
  ]
  let from = bloom
  targets.forEach((tg, i) => {
    const secs = pourSecs(tg - from, 5, 10, 25)
    parts.push({ dur: secs, type: 'pour', label: `Pulse ${i + 1}`, target: tg, hint: 'Small circles, keep the bed flat' })
    if (i < n - 1) parts.push({ dur: 30 - secs, type: 'wait', label: 'Let it drain', target: null, hint: 'Pour again when the surface is just wet' })
    from = tg
  })
  parts.push({ dur: 45, type: 'wait', label: 'Drawdown', target: w, hint: 'Done when the bed is flat and dry' })
  return timeline(parts)
}


export const METHODS = [
  {
    id: 'v60', name: 'V60', kind: 'Pour-over', icon: 'cone',
    ratio: 16, ratioRange: [14, 18], grind: 'Medium-fine, like table salt', k: 0.025, emax: 0.92,
    note: 'Cone with a large single hole; flow is controlled by grind and pour rate.',
    basis: 'James Hoffmann’s V60 technique: the 2019 method above 320 g (bloom 45 s, pour to 60 % at ~8 g/s, top up at ~6.5 g/s, swirl, done by ~3:30 at 500 g) and his 2023 one-cup method below it (four 10 s pours 25 s apart, done by 3:00).',
    steps: (d, w, bm = 2.5) => v60Schedule(d, w, bm),
  },
  {
    id: 'origami', name: 'Origami', kind: 'Pour-over', icon: 'origami',
    ratio: 16, ratioRange: [14, 18], grind: 'Medium-fine', k: 0.025, emax: 0.92,
    note: 'Ribbed cone that takes a V60 or a flat-bottom filter; fast and clean.',
    basis: 'With a cone filter the Origami drains a little faster than a V60, so this is Hoffmann’s V60 schedule with a 15 s shorter drawdown.',
    steps: (d, w, bm = 2.5) => v60Schedule(d, w, bm, -15),
  },
  {
    id: 'chemex', name: 'Chemex', kind: 'Pour-over', icon: 'chemex',
    ratio: 16, ratioRange: [15, 17], grind: 'Medium-coarse', k: 0.022, emax: 0.90,
    note: 'Thick filter, slow draw; go coarser than V60 and give it time.',
    basis: 'Chemex’s own guide and Blue Bottle’s: 45 s bloom, three pours at ~5 g/s in equal thirds with a pause to let the level fall, finishing around 4:00 at 500 g and 4:30 at 700 g.',
    steps: (d, w, bm = 2.5) => chemexSchedule(d, w, bm),
  },
  {
    id: 'kalita', name: 'Kalita Wave', kind: 'Pour-over', icon: 'wave',
    ratio: 16, ratioRange: [15, 17], grind: 'Medium', k: 0.024, emax: 0.92,
    note: 'Flat bed, three small holes; forgiving of pour technique. Pulse pours.',
    basis: 'Kalita’s pulse-pour method: 30 s bloom, then ~60 g pulses started every 30 s and poured at ~5 g/s, with drawdown about 45 s after the last pulse (3:15 at 300 g).',
    steps: (d, w, bm = 2.5) => kalitaSchedule(d, w, bm),
  },
  {
    id: 'aeropress', name: 'AeroPress', kind: 'Immersion + press', icon: 'press',
    ratio: 14, ratioRange: [10, 17], grind: 'Medium-fine to fine', k: 0.030, emax: 0.88,
    note: 'Full immersion then pressure; short, strong, forgiving.',
    basis: 'AeroPress’s standard recipe as refined by Hoffmann: all water in, 75 s steep, brief stir, a slow 30 s press stopped at the hiss.',
    steps: (d, w) => [
      { t: [0, 15],   type: 'pour',   label: 'Add all water', target: w, hint: 'Pour fast, no bloom needed' },
      { t: [15, 90],  type: 'wait',   label: 'Steep',         target: w, hint: 'Cap on, no stirring yet' },
      { t: [90, 100], type: 'action', label: 'Stir 3 times',  target: w },
      { t: [100, 130], type: 'press', label: 'Press',         target: w, hint: 'Slow — about 30 seconds. Stop at the hiss.' },
    ],
  },
  {
    id: 'clever', name: 'Clever Dripper', kind: 'Immersion', icon: 'clever',
    ratio: 16, ratioRange: [15, 17], grind: 'Medium to medium-coarse', k: 0.021, emax: 0.90,
    note: 'Immersion with a valve; steep, then drain like a pour-over.',
    basis: 'Clever Dripper’s guide: stir once at the start, 2 min steep, then a ~60 s drain.',
    steps: (d, w) => [
      { t: [0, 20],    type: 'pour',   label: 'Add all water', target: w },
      { t: [20, 30],   type: 'action', label: 'Stir once',     target: w, hint: 'Break the crust, lid on' },
      { t: [30, 150],  type: 'wait',   label: 'Steep',         target: w },
      { t: [150, 210], type: 'wait',   label: 'Release & drain', target: w, hint: 'Set it on the cup to open the valve' },
    ],
  },
  {
    id: 'frenchpress', name: 'French Press', kind: 'Immersion', icon: 'plunger',
    ratio: 15, ratioRange: [12, 17], grind: 'Coarse, like sea salt', k: 0.018, emax: 0.90,
    note: 'Steep, break the crust, let it settle. Don’t plunge to the bottom.',
    basis: 'Hoffmann’s French press method: 4 min steep, break and skim the crust, let the grounds settle, plunge only to the surface.',
    steps: (d, w) => [
      { t: [0, 20],    type: 'pour',   label: 'Add all water',   target: w },
      { t: [20, 240],  type: 'wait',   label: 'Steep',           target: w, hint: 'Lid off, hands off' },
      { t: [240, 260], type: 'action', label: 'Break the crust', target: w, hint: 'Stir the top, skim the foam' },
      { t: [260, 360], type: 'wait',   label: 'Settle',          target: w, hint: 'Grounds sink; the cup gets cleaner' },
      { t: [360, 380], type: 'press',  label: 'Plunge & pour',   target: w, hint: 'Plunger just to the surface, pour gently' },
    ],
  },
  {
    id: 'moka', name: 'Moka Pot', kind: 'Stovetop', icon: 'moka',
    ratio: 10, ratioRange: [8, 12], grind: 'Fine, coarser than espresso', k: 0.035, emax: 0.90,
    note: 'Fill the boiler with hot water to the valve, basket level and un-tamped, medium heat.',
    basis: 'Bialetti’s guide with Hoffmann’s hot-water start: medium heat, lower it once coffee flows, off the heat at the first sputter.',
    steps: (d, w) => [
      { t: [0, 30],    type: 'action', label: 'Assemble',        target: null, hint: 'Hot water to the valve, basket level, lid open' },
      { t: [30, 180],  type: 'wait',   label: 'Heat, medium',    target: null, hint: 'Watch for the first golden flow' },
      { t: [180, 240], type: 'wait',   label: 'Flowing',         target: w, hint: 'Lower the heat once it flows' },
      { t: [240, 255], type: 'action', label: 'Stop at the first sputter', target: w, hint: 'Off the heat; run the base under cold water' },
    ],
  },
  {
    id: 'espresso', name: 'Espresso', kind: 'Pressure', icon: 'espresso',
    ratio: 2, ratioRange: [1.5, 3], grind: 'Fine', k: 0.12, emax: 0.85, yieldRatio: true,
    note: 'Ratio here is dose to beverage weight — 18 g in, 36 g out.',
    basis: 'SCA espresso norms: 1:2 in 25–30 s, first drops at 6–10 s; stop on weight, not time.',
    steps: (d, w) => [
      { t: [0, 8],   type: 'wait', label: 'Pre-infusion', target: null, hint: 'First drops around 6–10 s' },
      { t: [8, 30],  type: 'pour', label: 'Extraction',   target: w, hint: 'Stop at the target weight, not the time' },
    ],
  },
  {
    id: 'coldbrew', name: 'Cold Brew', kind: 'Cold immersion', icon: 'cold',
    ratio: 8, ratioRange: [6, 12], grind: 'Extra coarse', k: 0.0004, emax: 0.85, cold: true,
    note: 'Concentrate at 1:8; dilute 1:1 to drink. Room temperature steeps faster than the fridge.',
    basis: 'Common concentrate practice (Toddy, Hoffmann): 1:8, 12–16 h at room temperature, filtered without squeezing.',
    steps: (d, w) => [
      { t: [0, 60],           type: 'pour',   label: 'Combine & stir',   target: w },
      { t: [60, 14 * 3600],   type: 'wait',   label: 'Steep',            target: w, hint: '12–16 hours. Stir once if you remember.' },
      { t: [14 * 3600, 14 * 3600 + 300], type: 'action', label: 'Filter', target: w, hint: 'Paper over a sieve; don’t squeeze' },
    ],
  },
]

export const byId = id => METHODS.find(m => m.id === id) || METHODS[0]

// SVG icons, 24×24, stroke-based so they take the current colour.
export const ICON = {
  cone:     '<path d="M4 6h16l-6 12h-4L4 6z"/><path d="M9 18v2h6v-2"/>',
  origami:  '<path d="M4 6h16l-6 12h-4L4 6z"/><path d="M8 6l4 12 4-12"/>',
  chemex:   '<path d="M8 3h8l-2 7 3 9H7l3-9-2-7z"/><path d="M9 12h6"/>',
  wave:     '<path d="M5 6h14l-2 12H7L5 6z"/><path d="M8 10c1 1 2 1 3 0s2-1 3 0 2 1 3 0"/>',
  press:    '<rect x="7" y="8" width="10" height="12" rx="1"/><path d="M9 8V4h6v4M12 4V2"/>',
  clever:   '<path d="M5 5h14l-2 11H7L5 5z"/><path d="M9 16v3h6v-3"/><circle cx="12" cy="20" r="1"/>',
  plunger:  '<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M12 7V3M9 3h6M9 11h6"/>',
  moka:     '<path d="M8 3h8l1 7H7l1-7z"/><path d="M6 10h12l-1 10H7L6 10z"/><path d="M18 12h2v3h-2"/>',
  espresso: '<path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 4v2M11 4v2"/>',
  cold:     '<path d="M8 3h8v3l-1 2v11a3 3 0 0 1-3 3h0a3 3 0 0 1-3-3V8L8 6V3z"/><path d="M9 13h6"/>',
}
