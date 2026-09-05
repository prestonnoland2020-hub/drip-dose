// POR — identify-gear
// Photo of a grinder or brewer → which one it is, matched against the catalogue.
// Says "not sure" rather than guessing a model; the person confirms either way.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const METHOD_WORDS: [RegExp, string][] = [
  [/v60|hario cone|hario dripper/i, 'v60'], [/origami/i, 'origami'], [/chemex/i, 'chemex'], [/kalita|wave/i, 'kalita'],
  [/aeropress/i, 'aeropress'], [/clever/i, 'clever'], [/french press|press pot|cafeti|plunger|bodum chambord/i, 'frenchpress'],
  [/moka|bialetti|stovetop/i, 'moka'], [/espresso|portafilter|breville barista|gaggia|rancilio|la marzocco/i, 'espresso'], [/cold brew|toddy/i, 'coldbrew'],
]

const PROMPT = `You are identifying a piece of coffee equipment from a photo, for a brewing app.
Report only what you can actually see. If the exact model is not readable or unmistakable, give the brand and a null model — a wrong model is worse than none.

Return one JSON object and nothing else:
{
  "is_coffee_gear": boolean,
  "kind": "grinder"|"brewer"|"kettle"|"scale"|"other"|null,
  "brand": string|null,
  "model": string|null,
  "description": string,        // 8 words max, e.g. "black conical burr grinder with hopper"
  "confidence": number          // 0-1
}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return json({ error: 'not_configured' }, 503)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: u } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
  if (!u?.user) return json({ error: 'unauthorised' }, 401)
  const body = await req.json().catch(() => ({}))
  if (!body.image && !body.query) return json({ error: 'no_image' }, 400)

  // Text mode: "look up my <grinder>" when it is not in the catalogue. Learns it and stores it.
  if (!body.image && body.query) {
    const learned = await learnGrinder(key, admin, String(body.query).slice(0, 80), u.user.id)
    return learned ? json({ kind: 'grinder', brand: learned.brand, model: learned.model, confidence: 0.6, grinder: learned, candidates: [learned], method: null, learned: true })
      : json({ error: 'not_recognised', message: 'Could not work out that grinder. Check the spelling, or add it by name — POR will still say finer or coarser.' }, 422)
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: Deno.env.get('SCAN_MODEL') || 'gpt-4.1', response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${body.image}`, detail: 'low' } }] }] }),
  })
  if (!res.ok) return json({ error: 'vision_failed', detail: (await res.text()).slice(0, 200) }, 502)
  const out = await res.json()
  let parsed: any = null
  try { parsed = JSON.parse(String(out.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)?.[0] ?? 'null') } catch {}
  if (!parsed?.is_coffee_gear) return json({ error: 'not_recognised', message: 'That does not look like coffee gear. Try the grinder or brewer on its own, in good light.' }, 422)

  // Match against the catalogue by brand + model, then aliases.
  const text = norm(`${parsed.brand ?? ''} ${parsed.model ?? ''}`)
  let match: any = null, candidates: any[] = []
  if (parsed.kind === 'grinder' || !parsed.kind) {
    const { data: gs } = await admin.from('grinders').select('id, brand, model, aliases, kind, scale, note, dial, verified')
    const scored = (gs ?? []).map((g: any) => {
      const names = [`${g.brand} ${g.model}`, g.model, ...(g.aliases ?? [])].map(norm)
      const hit = names.some(n => n && (text.includes(n) || n.includes(text) && text.length > 3))
      const brandHit = norm(g.brand) && text.includes(norm(g.brand))
      return { g, score: hit ? 2 : brandHit ? 1 : 0 }
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
    candidates = scored.slice(0, 5).map(x => x.g)
    if (scored[0]?.score === 2) match = scored[0].g
  }
  let method: string | null = null
  if (parsed.kind === 'brewer' || (!match && parsed.kind !== 'grinder')) {
    const t = `${parsed.brand ?? ''} ${parsed.model ?? ''} ${parsed.description ?? ''}`
    method = METHOD_WORDS.find(([re]) => re.test(t))?.[1] ?? null
  }
  // A grinder we can name but do not know: learn it now, so the next person gets a setting too.
  let learned = false
  if (!match && parsed.kind === 'grinder' && parsed.brand && parsed.model && Number(parsed.confidence) >= 0.6) {
    const g = await learnGrinder(key, admin, `${parsed.brand} ${parsed.model}`, u.user.id)
    if (g) { match = g; candidates = [g, ...candidates]; learned = true }
  }
  return json({ kind: parsed.kind, brand: parsed.brand, model: parsed.model, description: parsed.description, confidence: parsed.confidence, grinder: match, candidates, method, learned })
})

// Ask the model what it knows about a grinder's adjustment and store it, flagged unverified.
// The chart it produces is a starting point; brews on it will tell us how far off it is.
const LEARN = `You know coffee grinders. For the grinder named below, describe its grind adjustment precisely.
If you are not confident this grinder exists, return {"known": false}.

Return one JSON object and nothing else:
{
  "known": boolean,
  "brand": string, "model": string,
  "kind": "electric"|"hand",
  "scale": "numbers"|"clicks"|"stepless",
  "setting_min": number, "setting_max": number, "step": number,
  "finest_is_low": boolean,
  "dial": string,                     // what is physically on it: count of steps, which way is finer, markings. 25 words max.
  "points": [[number, number]],       // 3 to 5 [setting, microns] pairs, ascending, spanning the range. Realistic: espresso ~250 µm, pour-over ~600, French press ~1000.
  "confidence": number
}`
async function learnGrinder(key: string, admin: any, name: string, userId: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4.1', response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: LEARN }, { role: 'user', content: `Grinder: ${name}` }] }),
  })
  if (!res.ok) return null
  const out = await res.json()
  let g: any = null
  try { g = JSON.parse(String(out.choices?.[0]?.message?.content ?? '').match(/\{[\s\S]*\}/)?.[0] ?? 'null') } catch {}
  if (!g?.known || !g.brand || !g.model || !Array.isArray(g.points) || g.points.length < 2) return null
  const id = `${g.brand} ${g.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-ai'
  const row = { id, brand: g.brand, model: g.model, aliases: [name], kind: g.kind === 'hand' ? 'hand' : 'electric',
    scale: ['numbers', 'clicks', 'stepless'].includes(g.scale) ? g.scale : 'numbers',
    setting_min: Number(g.setting_min) || 0, setting_max: Number(g.setting_max) || 40, step: Number(g.step) || 1,
    finest_is_low: g.finest_is_low !== false, dial: String(g.dial ?? '').slice(0, 240), points: g.points.slice(0, 6),
    note: 'Added from a description — the chart is an estimate until brews confirm it.',
    source: 'ai-estimated from model knowledge; unverified', verified: false, created_by: userId }
  const { data } = await admin.from('grinders').upsert(row, { onConflict: 'id' }).select().maybeSingle()
  return data
}
