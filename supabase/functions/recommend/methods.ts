// POR — brewing method registry (server copy; generated from src/methods.js — edit that, then run build.sh)
// One place for every method. Adding a brewer means adding an entry here and
// (server-side) a brew_reference row. Nothing else in the app knows a method by name.
//
// steps(dose, water, bloomMul) returns the guided timeline for that dose:
//   { t:[start,end] seconds, type:'pour'|'wait'|'action'|'press', label, target:cumulative grams|null }

const round5 = (g: number) => Math.round(g / 5) * 5

export const METHODS: any[] = [
  {
    id: 'v60', name: 'V60', kind: 'Pour-over', icon: 'cone',
    ratio: 16, ratioRange: [14, 18], grind: 'Medium-fine, like table salt', k: 0.025, emax: 0.92,
    note: 'Cone with a large single hole; flow is controlled by grind and pour rate.',
    steps: (d, w, bm = 2.5) => {
      const bloom = Math.min(round5(d * bm), w)
      return [
        { t: [0, 10],    type: 'pour',   label: 'Bloom',        target: bloom, hint: 'Wet every ground, then swirl' },
        { t: [10, 45],   type: 'wait',   label: 'Let it bloom', target: null,  hint: 'Gas escapes — watch the dome' },
        { t: [45, 75],   type: 'pour',   label: 'Pour 2',       target: round5(w * 0.6), hint: 'Steady spiral, hold the level' },
        { t: [75, 105],  type: 'pour',   label: 'Pour 3',       target: w, hint: 'Slower now, straight down the middle' },
        { t: [105, 120], type: 'action', label: 'Gentle swirl', target: w, hint: 'Flatten the bed' },
        { t: [120, 180], type: 'wait',   label: 'Drawdown',     target: w, hint: 'Done when the bed is flat and dry' },
      ]
    },
  },
  {
    id: 'origami', name: 'Origami', kind: 'Pour-over', icon: 'origami',
    ratio: 16, ratioRange: [14, 18], grind: 'Medium-fine', k: 0.025, emax: 0.92,
    note: 'Ribbed cone that takes a V60 or a flat-bottom filter; fast and clean.',
    steps: (d, w, bm = 2.5) => {
      const bloom = Math.min(round5(d * bm), w)
      return [
        { t: [0, 10],    type: 'pour',   label: 'Bloom',        target: bloom, hint: 'Saturate and swirl' },
        { t: [10, 40],   type: 'wait',   label: 'Let it bloom', target: null },
        { t: [40, 70],   type: 'pour',   label: 'Pour 2',       target: round5(w * 0.6) },
        { t: [70, 100],  type: 'pour',   label: 'Pour 3',       target: w },
        { t: [100, 165], type: 'wait',   label: 'Drawdown',     target: w },
      ]
    },
  },
  {
    id: 'chemex', name: 'Chemex', kind: 'Pour-over', icon: 'chemex',
    ratio: 16, ratioRange: [15, 17], grind: 'Medium-coarse', k: 0.022, emax: 0.90,
    note: 'Thick filter, slow draw; go coarser than V60 and give it time.',
    steps: (d, w, bm = 2.5) => {
      const bloom = Math.min(round5(d * bm), w)
      return [
        { t: [0, 10],    type: 'pour',   label: 'Bloom',        target: bloom },
        { t: [10, 45],   type: 'wait',   label: 'Let it bloom', target: null },
        { t: [45, 90],   type: 'pour',   label: 'Pour 2',       target: round5(w * 0.5) },
        { t: [90, 150],  type: 'pour',   label: 'Pour 3',       target: w, hint: 'Keep the level below the rim' },
        { t: [150, 240], type: 'wait',   label: 'Drawdown',     target: w },
      ]
    },
  },
  {
    id: 'kalita', name: 'Kalita Wave', kind: 'Pour-over', icon: 'wave',
    ratio: 16, ratioRange: [15, 17], grind: 'Medium', k: 0.024, emax: 0.92,
    note: 'Flat bed, three small holes; forgiving of pour technique. Pulse pours.',
    steps: (d, w, bm = 2.5) => {
      const bloom = Math.min(round5(d * bm), w)
      return [
        { t: [0, 10],    type: 'pour',   label: 'Bloom',   target: bloom },
        { t: [10, 30],   type: 'wait',   label: 'Bloom',   target: null },
        { t: [30, 60],   type: 'pour',   label: 'Pulse 1', target: round5(w * 0.4) },
        { t: [60, 105],  type: 'pour',   label: 'Pulse 2', target: round5(w * 0.7) },
        { t: [105, 150], type: 'pour',   label: 'Pulse 3', target: w },
        { t: [150, 195], type: 'wait',   label: 'Drawdown', target: w },
      ]
    },
  },
  {
    id: 'aeropress', name: 'AeroPress', kind: 'Immersion + press', icon: 'press',
    ratio: 14, ratioRange: [10, 17], grind: 'Medium-fine to fine', k: 0.030, emax: 0.88,
    note: 'Full immersion then pressure; short, strong, forgiving.',
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
    steps: (d, w) => [
      { t: [0, 8],   type: 'wait', label: 'Pre-infusion', target: null, hint: 'First drops around 6–10 s' },
      { t: [8, 30],  type: 'pour', label: 'Extraction',   target: w, hint: 'Stop at the target weight, not the time' },
    ],
  },
  {
    id: 'coldbrew', name: 'Cold Brew', kind: 'Cold immersion', icon: 'cold',
    ratio: 8, ratioRange: [6, 12], grind: 'Extra coarse', k: 0.0004, emax: 0.85, cold: true,
    note: 'Concentrate at 1:8; dilute 1:1 to drink. Room temperature steeps faster than the fridge.',
    steps: (d, w) => [
      { t: [0, 60],           type: 'pour',   label: 'Combine & stir',   target: w },
      { t: [60, 14 * 3600],   type: 'wait',   label: 'Steep',            target: w, hint: '12–16 hours. Stir once if you remember.' },
      { t: [14 * 3600, 14 * 3600 + 300], type: 'action', label: 'Filter', target: w, hint: 'Paper over a sieve; don’t squeeze' },
    ],
  },
]

export const byId = (id: string) => METHODS.find(m => m.id === id) || METHODS[0]

// SVG icons, 24×24, stroke-based so they take the current colour.
export const ICON: Record<string,string> = {
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
