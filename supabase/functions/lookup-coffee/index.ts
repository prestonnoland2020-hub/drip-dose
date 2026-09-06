// POR — lookup-coffee
// "I don't have the bag with me." Search the web for a coffee by name, read what the
// roaster publishes, and store it like a scanned bag would be stored — so the next
// person who types the same name gets an instant hit.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const slugify = (r: string, n: string) => `${r}|${n}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9|]+/g, '-').replace(/^-|-$/g, '')

const PROMPT = (q: string) => `Find the coffee "${q}" as sold by its roaster. Use the roaster's own product page above all else.
Report only what the page or a reliable source states. Nulls are fine; guesses are not.

Return one JSON object and nothing else:
{
  "found": boolean,
  "roaster": string|null,
  "name": string|null,
  "origin": string|null,
  "country": string|null,
  "region": string|null,
  "producer": string|null,
  "process": string|null,
  "varietal": string|null,
  "altitude_m": number|null,
  "roast_label": string|null,
  "roast_level": "light"|"medium-light"|"medium"|"medium-dark"|"dark"|"very-dark"|null,
  "tasting_notes": string|null,
  "blend": boolean,
  "decaf": boolean,
  "roaster_guide_found": boolean,
  "guide_method": "v60"|"chemex"|"kalita"|"aeropress"|"frenchpress"|"clever"|null,
  "grind_note": string|null,
  "water_temp_c": number|null,
  "ratio": number|null,
  "advice": string|null,
  "about": string|null,
  "confidence": "high"|"medium"|"low"
}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return json({ error: 'not_configured' }, 503)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: u } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
  if (!u?.user) return json({ error: 'unauthorised' }, 401)
  const body = await req.json().catch(() => ({}))
  const q = String(body.query ?? '').trim().slice(0, 120)
  if (q.length < 3) return json({ error: 'no_query' }, 400)

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: Deno.env.get('RESEARCH_MODEL') || 'gpt-5.6-luna', tools: [{ type: 'web_search' }], tool_choice: 'auto', input: PROMPT(q) }),
  })
  if (!res.ok) return json({ error: 'research_failed', detail: (await res.text()).slice(0, 200) }, 502)
  const out = await res.json()
  let text = out.output_text ?? ''
  const sources: { title: string; url: string }[] = []
  for (const item of out.output ?? []) for (const c of item.content ?? []) if (c.type === 'output_text') {
    if (!text) text = c.text ?? ''
    for (const a of c.annotations ?? []) if (a.type === 'url_citation' && a.url && !sources.some(s => s.url === a.url)) sources.push({ title: a.title ?? a.url, url: a.url })
  }
  let d: any = null
  try { d = JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0] ?? 'null') } catch {}
  if (!d?.found || !d.name) return json({ error: 'not_found', message: `Couldn't find “${q}” online. Try the roaster and coffee name together, or enter it by hand.` }, 404)

  const roaster = d.roaster || 'Unknown roaster'
  const slug = slugify(roaster, d.name)
  const fields = ['origin', 'country', 'region', 'producer', 'process', 'varietal', 'altitude_m', 'roast_label', 'roast_level', 'tasting_notes', 'blend', 'decaf']
  const field_sources = Object.fromEntries(['roaster', 'name', ...fields].filter(f => d[f] != null && d[f] !== '').map(f => [f, 'web']))
  const research = { found: true, roaster_identified: d.roaster, roaster_guide_found: !!d.roaster_guide_found, guide_method: d.guide_method ?? null,
    grind_note: d.grind_note ?? null, grind_microns: null, water_temp_c: d.water_temp_c ?? null, ratio: d.ratio ?? null, advice: d.advice ?? null, about: d.about ?? null, confidence: d.confidence ?? 'medium' }
  const row: any = { slug, roaster, name: d.name, origin: d.origin, country: d.country, region: d.region, producer: d.producer, process: d.process, varietal: d.varietal,
    altitude_m: Number.isFinite(Number(d.altitude_m)) && d.altitude_m ? Math.round(Number(d.altitude_m)) : null, roast_label: d.roast_label, roast_level: d.roast_level,
    tasting_notes: d.tasting_notes, blend: d.blend === true, decaf: d.decaf === true, confidence: d.confidence === 'high' ? 0.8 : d.confidence === 'low' ? 0.5 : 0.65,
    source: 'web', field_sources, research, sources: sources.slice(0, 5), researched_at: new Date().toISOString(), created_by: u.user.id,
    raw: { ...d, confidence: d.confidence === 'high' ? 0.8 : 0.65 } }
  // Never clobber a scanned bag with a web read: only fill blanks on an existing row.
  const { data: existing } = await admin.from('coffees').select('*').eq('slug', slug).maybeSingle()
  if (existing) {
    const patch: any = {}
    for (const f of fields) if ((existing[f] == null || existing[f] === '' || existing[f] === false) && row[f] != null) patch[f] = row[f]
    if (!existing.researched_at) { patch.research = research; patch.sources = row.sources; patch.researched_at = row.researched_at }
    if (Object.keys(patch).length) await admin.from('coffees').update(patch).eq('id', existing.id)
    const { data: fresh } = await admin.from('coffees').select('*').eq('id', existing.id).maybeSingle()
    return json({ coffee: fresh, sources: row.sources, existed: true })
  }
  const { data: coffee, error } = await admin.from('coffees').insert(row).select().single()
  if (error) return json({ error: 'save_failed', detail: error.message }, 500)
  return json({ coffee, sources: row.sources, existed: false })
})
