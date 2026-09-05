// POR — scan-bag
// Photo of a bag in, brew recipe out.
//
// Three stages, cheapest first, each one skippable:
//   1. Read the label (vision).            costs a little
//   2. Match the roaster against our table. free
//   3. Research the coffee on the web.     costs a little, cached forever per coffee
//
// Stage 3 is an enhancement, never a dependency — if research fails the app still
// returns a sound label-based recipe rather than nothing.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ORDER = ['light', 'medium-light', 'medium', 'medium-dark', 'dark', 'very-dark']
// Roast shifts the middle of each method's published range: lighter roasts are denser
// and want hotter water and a finer grind; dark roasts are porous and want the reverse.
const ROAST_SHIFT: Record<string, { temp: number; grind: number; bloom: number }> = {
  'light':        { temp:  +2.5, grind: -0.20, bloom: 2.5 },
  'medium-light': { temp:  +1.5, grind: -0.10, bloom: 2.5 },
  'medium':       { temp:   0,   grind:  0,    bloom: 2.5 },
  'medium-dark':  { temp:  -2.0, grind: +0.12, bloom: 2.5 },
  'dark':         { temp:  -4.0, grind: +0.25, bloom: 2.0 },
  'very-dark':    { temp:  -5.5, grind: +0.35, bloom: 2.0 },
}

const slugify = (r: string, n: string) =>
  `${r}|${n}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9|]+/g, '-').replace(/^-|-$/g, '')
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function shiftRoast(level: string, by: number) {
  const i = ORDER.indexOf(level)
  return i < 0 ? level : ORDER[Math.max(0, Math.min(ORDER.length - 1, Math.round(i + by)))]
}

const READ_PROMPT = `You are reading a photo of a bag of coffee for a pour-over app.

Report ONLY what is printed on the bag or clearly visible. A wrong answer is worse than
no answer, because someone will brew to it. If a field is not legible, use null.
Never infer origin or varietal from the appearance of beans — that is not reliably
possible and you must not guess it.

Practical notes:
- The photo may be rotated or sideways. Read it anyway; never refuse over orientation.
- If you recognise the roaster from a logo alone, say so in "roaster" and set
  "roaster_from_logo" true. If you are not confident, leave roaster null — a wrong
  roaster is worse than none.
- Many bags show no roaster name in text. That is fine; still report the coffee's name.
- Speciality bags often print a roast SCALE: a line labelled Light at one end and Dark
  at the other, with a marker along it. Read the marker's position and map it to
  roast_level. A marker at the Light end means "light", not "medium". Ignore any
  Clean/Funky or Body scale beside it — that is flavour, not roast.
- If no roast is indicated anywhere, leave roast_level null rather than guessing.

Return one JSON object and nothing else:
{
  "is_coffee_bag": boolean,
  "roaster": string|null,
  "roaster_from_logo": boolean,
  "name": string|null,
  "origin": string|null,
  "process": string|null,
  "varietal": string|null,
  "tasting_notes": string|null,
  "roast_label": string|null,
  "roast_level": "light"|"medium-light"|"medium"|"medium-dark"|"dark"|"very-dark"|null,
  "roast_date": string|null,
  "confidence": number,
  "notes": string|null
}`

async function readLabel(key: string, image: string, mediaType: string, model: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: READ_PROMPT },
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${image}`, detail: 'high' } },
      ]}],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const out = await res.json()
  return out.choices?.[0]?.message?.content ?? ''
}

// Stage 3: what does the web actually say about brewing THIS coffee?
// Uses the Responses API's built-in web search so answers come with citations.
async function research(key: string, model: string, coffee: any, method: string) {
  const q = `Coffee: ${coffee.roaster && coffee.roaster !== 'Unknown roaster' ? coffee.roaster + ' — ' : ''}${coffee.name}` +
    `${coffee.origin ? ` (${coffee.origin})` : ''}${coffee.roast_label ? `, labelled ${coffee.roast_label}` : ''}.

Search the web for brewing guidance for this specific coffee, brewed as ${method}.
Prefer the roaster's own brew guide above all else, then well-established sources
(SCA, James Hoffmann, respected speciality publications). Do not invent numbers.

Return one JSON object and nothing else:
{
  "found": boolean,
  "roaster_identified": string|null,
  "roaster_guide_found": boolean,
  "grind_note": string|null,
  "grind_microns": number|null,
  "water_temp_c": number|null,
  "ratio": number|null,
  "advice": string|null,
  "about": string|null,
  "confidence": "high"|"medium"|"low"
}

Set found false and leave fields null if you cannot find real information about this
coffee. A null is fine. A guess dressed up as a finding is not.`

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, tools: [{ type: 'web_search' }], tool_choice: 'auto', input: q }),
  })
  if (!res.ok) throw new Error(`research ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const out = await res.json()

  // pull the text and any url citations out of the response
  let text = out.output_text ?? ''
  const sources: { title: string; url: string }[] = []
  for (const item of out.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === 'output_text') {
        if (!text) text = c.text ?? ''
        for (const a of c.annotations ?? []) {
          if (a.type === 'url_citation' && a.url && !sources.some(s => s.url === a.url)) {
            sources.push({ title: a.title ?? a.url, url: a.url })
          }
        }
      }
    }
  }
  const m = String(text).match(/\{[\s\S]*\}/)
  if (!m) throw new Error('research returned no json')
  return { data: JSON.parse(m[0]), sources: sources.slice(0, 5) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ error: 'not_configured', message: 'Scanning is not switched on yet.' }, 503)
  const scanModel = Deno.env.get('SCAN_MODEL') || 'gpt-4o'
  const researchModel = Deno.env.get('RESEARCH_MODEL') || 'gpt-5.6-luna'
  let usedScanModel = scanModel

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: userData, error: userErr } =
    await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
  if (userErr || !userData?.user) return json({ error: 'unauthorised' }, 401)
  const user = userData.user

  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) return json({ error: 'no_profile' }, 403)
  if (profile.plan === 'free' && profile.scans_used >= profile.scan_limit) {
    return json({ error: 'limit_reached', scans_used: profile.scans_used, scan_limit: profile.scan_limit }, 402)
  }

  const body = await req.json().catch(() => null)
  const image: string | undefined = body?.image
  const mediaType: string = body?.media_type ?? 'image/jpeg'
  const method: string = body?.method ?? 'v60'
  if (!image) return json({ error: 'no_image' }, 400)
  if (image.length > 8_000_000) return json({ error: 'image_too_large', message: 'Resize before uploading.' }, 413)

  // ---- stage 1: read the label -------------------------------------------
  // Try the configured model, then fall back through known-good ones. Model
  // availability varies by account, and a scan should not die over a name.
  const candidates = [...new Set([scanModel, 'gpt-4o', 'gpt-4o-mini', 'gpt-5.6-luna'])]
  let parsed: any = null
  const attempts: { model: string; error: string }[] = []
  for (const m0 of candidates) {
    try {
      const text = await readLabel(key, image, mediaType, m0)
      const m = String(text).replace(/^```(?:json)?|```$/gm, '').trim().match(/\{[\s\S]*\}/)
      if (!m) throw new Error('no json in reply: ' + String(text).slice(0, 120))
      parsed = JSON.parse(m[0]); usedScanModel = m0
      break
    } catch (e) {
      attempts.push({ model: m0, error: String(e).slice(0, 200) })
    }
  }
  if (!parsed) {
    await admin.from('scan_errors').insert(
      attempts.map(a => ({ stage: 'vision', model: a.model, detail: a.error })))
    return json({ error: 'vision_failed', model: scanModel, attempts,
      detail: attempts[0]?.error ?? 'unknown' }, 502)
  }
  if (!parsed.is_coffee_bag || (!parsed.name && !parsed.roaster)) {
    return json({ error: 'not_recognised',
      message: 'I can see a photo but no coffee name on it. Try the face of the bag with the name in frame.',
      parsed }, 422)
  }
  if (!parsed.roaster) parsed.roaster = 'Unknown roaster'
  if (!parsed.name) parsed.name = parsed.roaster

  // ---- stage 2: reference lookups (free) ---------------------------------
  const { data: ref } = await admin.from('brew_reference').select('*').eq('method', method).maybeSingle()
  const { data: allRoasters } = await admin.from('roasters').select('*')
  const target = norm(parsed.roaster)
  const roaster = (allRoasters ?? []).find(r =>
    norm(r.name) === target || (r.aliases ?? []).some((a: string) => norm(a) === target)) ??
    (allRoasters ?? []).find(r => target.length > 3 &&
      (norm(r.name).includes(target) || target.includes(norm(r.name))))

  let level = parsed.roast_level ?? 'medium'
  const notes: string[] = []
  if (roaster && Number(roaster.roast_bias) !== 0 && roaster.confidence !== 'low') {
    const adj = shiftRoast(level, Number(roaster.roast_bias))
    if (adj !== level) {
      notes.push(`${roaster.name} ${Number(roaster.roast_bias) > 0 ? 'roasts darker' : 'roasts lighter'} than the label suggests, so this is treated as ${adj.replace('-', ' ')}.`)
      level = adj
    }
  }

  // Start from the method's published middle, then shift for roast.
  const sh = ROAST_SHIFT[level] ?? ROAST_SHIFT['medium']
  const midTemp = ref ? (ref.temp_min_c + ref.temp_max_c) / 2 : 93
  const midGrind = ref ? (ref.grind_min_um + ref.grind_max_um) / 2 : 600
  const recipe: any = {
    temp: ref ? Math.max(ref.temp_min_c, Math.min(ref.temp_max_c, Math.round(midTemp + sh.temp))) : Math.round(midTemp + sh.temp),
    grind_microns: ref ? Math.max(ref.grind_min_um, Math.min(ref.grind_max_um, Math.round(midGrind * (1 + sh.grind)))) : Math.round(midGrind * (1 + sh.grind)),
    grind: ref?.grind_label ?? 'Medium',
    ratio: ref ? Number(((ref.ratio_min + ref.ratio_max) / 2).toFixed(1)) : 16,
    bloom: sh.bloom,
    roast_level: level,
    notes,
    basis: ref ? `${ref.display_name} published range, adjusted for a ${level.replace('-', ' ')} roast` : 'method defaults',
  }
  if (ref?.note) notes.push(ref.note)

  const days = parsed.roast_date
    ? Math.max(0, Math.round((Date.now() - Date.parse(parsed.roast_date)) / 86_400_000)) : null
  if (days !== null && Number.isFinite(days)) {
    if (days <= 7) { recipe.bloom = 3.0; notes.push('Very fresh — still degassing, so bloom longer and expect a big dome.') }
    else if (days >= 45) { notes.push(`About ${days} days off roast — grind a touch finer to compensate.`) }
  }

  // ---- stage 3: research, cached per coffee -------------------------------
  const slug = slugify(parsed.roaster, parsed.name)
  const { data: existing } = await admin.from('coffees').select('*').eq('slug', slug).maybeSingle()
  let researchData = existing?.research ?? null
  let sources = existing?.sources ?? null
  let researched = !!existing?.researched_at
  let researchError: string | null = null

  if (!researched) {
    try {
      const r = await research(key, researchModel, parsed, ref?.display_name ?? method)
      if (r.data?.found) {
        researchData = r.data; sources = r.sources; researched = true
        if (r.data.water_temp_c)  recipe.temp = Math.round(r.data.water_temp_c)
        if (r.data.grind_microns) recipe.grind_microns = Math.round(r.data.grind_microns)
        if (r.data.grind_note)    recipe.grind = r.data.grind_note
        if (r.data.ratio)         recipe.ratio = Number(r.data.ratio)
        if (r.data.roaster_guide_found) recipe.basis = "the roaster's own brew guide"
        else recipe.basis = 'published guidance found for this coffee'
        if (r.data.advice) notes.push(r.data.advice)
      } else { researched = true }
    } catch (e) {
      researchError = String(e).slice(0, 200)   // enhancement only — never fatal
      await admin.from('scan_errors').insert({ stage: 'research', model: researchModel, detail: researchError })
    }
  } else if (researchData) {
    if (researchData.water_temp_c)  recipe.temp = Math.round(researchData.water_temp_c)
    if (researchData.grind_microns) recipe.grind_microns = Math.round(researchData.grind_microns)
    if (researchData.grind_note)    recipe.grind = researchData.grind_note
    if (researchData.ratio)         recipe.ratio = Number(researchData.ratio)
    recipe.basis = 'saved research for this coffee'
    if (researchData.advice) notes.push(researchData.advice)
  }

  const { data: coffee } = await admin.from('coffees').upsert({
    slug,
    roaster: parsed.roaster,
    name: parsed.name,
    origin: parsed.origin,
    process: parsed.process,
    varietal: parsed.varietal,
    roast_label: parsed.roast_label,
    roast_level: level,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    recipe,
    research: researchData,
    sources,
    researched_at: researched ? new Date().toISOString() : null,
    source: 'vision',
  }, { onConflict: 'slug' }).select().single()

  await admin.from('scans').insert({
    user_id: user.id, coffee_id: coffee?.id ?? null, cache_hit: !!existing?.researched_at, raw: parsed,
  })
  await admin.from('profiles').update({ scans_used: profile.scans_used + 1 }).eq('id', user.id)

  return json({
    coffee, recipe, sources: sources ?? [],
    research_error: researchError,
    scan_model: usedScanModel,
    matched_roaster: roaster?.name ?? null,
    cache_hit: !!existing?.researched_at,
    scans_used: profile.scans_used + 1, scan_limit: profile.scan_limit, plan: profile.plan,
  })
})
