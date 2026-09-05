// Turn a micron target into a setting on a specific grinder, and back.
// points: [[setting, microns], ...] ascending. Linear between points; clamped at the ends.

export function settingFor(g: any, um: number): number | null {
  const P = g.points
  if (!P?.length) return null
  if (um <= P[0][1]) return clampStep(g, P[0][0])
  if (um >= P[P.length - 1][1]) return clampStep(g, P[P.length - 1][0])
  for (let i = 1; i < P.length; i++) {
    const [s0, u0] = P[i - 1], [s1, u1] = P[i]
    if (um <= u1) return clampStep(g, s0 + (s1 - s0) * (um - u0) / (u1 - u0))
  }
  return null
}
export function micronsFor(g: any, setting: number): number | null {
  const P = g.points; if (!P?.length) return null
  if (setting <= P[0][0]) return P[0][1]
  if (setting >= P[P.length - 1][0]) return P[P.length - 1][1]
  for (let i = 1; i < P.length; i++) { const [s0, u0] = P[i - 1], [s1, u1] = P[i]; if (setting <= s1) return Math.round(u0 + (u1 - u0) * (setting - s0) / (s1 - s0)) }
  return null
}
function clampStep(g: any, s: number) {
  const step = Number(g.step) || 1
  const v = Math.round(s / step) * step
  return Math.max(Number(g.setting_min), Math.min(Number(g.setting_max), Math.round(v * 100) / 100))
}
export function fmtSetting(g: any, s: number | null) {
  if (s == null) return null
  const step = Number(g.step) || 1
  const txt = step < 1 ? s.toFixed(1) : String(Math.round(s))
  return g.scale === 'clicks' ? `${txt} clicks` : txt
}
// Move a setting by whole steps; +n = coarser.
export function stepSetting(g: any, s: number, n: number) { return clampStep(g, Number(s) + n * (Number(g.step) || 1)) }
export const grinderName = (g: any) => g ? `${g.brand} ${g.model}` : null
