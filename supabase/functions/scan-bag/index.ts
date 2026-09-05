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
import { deriveRecipe, mergeLabel } from './recipe.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const slugify = (r: string, n: string) =>
  `${r}|${n}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9|]+/g, '-').replace(/^-|-$/g, '')
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const READ_PROMPT = `You are reading a photo of a bag of coffee for a pour-over app.

Report ONLY what is printed on the bag or clearly visible. A wrong answer is worse than
no answer, because someone will brew to it. If a field is not legible, use null.
Never infer origin, process or varietal from the look of the bag or beans — that is not
reliably possible and you must not guess it. A blend usually has no single origin.

Practical notes:
- The photo may be rotated or sideways. Read it anyway; never refuse over orientation.
- If you recognise the roaster from a logo alone, say so in "roaster" and set
  "roaster_from_logo" true. If you are not confident, leave roaster null — a wrong
  roaster is worse than none. The coffee's name is not the roaster.
- Many bags show no roaster name in text. That is fine; still report the coffee's name.
- ROAST SCALE. Speciality bags often print a line labelled Light at one end and Dark at
  the other with a marker on it. Read the marker's position along that line:
    first fifth → "light", second fifth → "medium-light", middle → "medium",
    fourth fifth → "medium-dark", last fifth → "dark".
  Ignore any Clean/Funky, Body, or Acidity scale next to it — that is flavour, not roast.
- ROAST WORDS. Copy the printed words into "roast_label" verbatim. Map them:
  "light"/"filter"/"omni"/"Nordic" → light or medium-light; "city" → medium;
  "full city"/"espresso" → medium-dark; "French"/"Italian" → dark or very-dark.
- If no roast is indicated anywhere — no scale, no word — leave roast_level null.
- ALTITUDE. If printed (e.g. "1,850 masl", "1900 m", "6,200 ft"), report metres as a number.
- DECAF. True only if the bag says decaf / decaffeinated / Swiss Water / sugarcane / EA / CO2.
- BLEND. True if the bag says blend, or lists more than one origin.

Return one JSON object and nothing else:
{
  "is_coffee_bag": boolean,
  "roaster": string|null,
  "roaster_from_logo": boolean,
  "name": string|null,
  "origin": string|null,
  "process": string|null,
  "varietal": string|null,
  "altitude_m": number|null,
  "decaf": boolean,
  "blend": boolean,
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
// Method-agnostic on purpose: the roaster publishes guidance for one method,
// and the per-method ranges are handled deterministically in stage 2. Asking the
// web the same question once per coffee means switching method costs nothing.
// Uses the Responses API's built-in web search so answers come with citations.
async function research(key: string, model: string, coffee: any) {
  const named = coffee.roaster && coffee.roaster !== 'Unknown roaster' ? coffee.roaster + ' — ' : ''
  const q = `Coffee: ${named}${coffee.name}` +
    `${coffee.origin ? ` (${coffee.origin})` : ''}${coffee.roast_label ? `, labelled ${coffee.roast_label}` : ''}.

Search the web for brewing guidance for this specific coffee. Prefer the roaster's own
brew guide above all else, then well-established sources (SCA, James Hoffmann, respected
speciality publications). Do not invent numbers.

If the guide you find is written for one brew method, say which in "guide_method" — the
app applies those numbers only to that method and shows them as a note elsewhere.

Rules for the text fields, which appear on a small phone card:
- "advice": at most 20 words, and only if it tells the brewer to DO something specific.
  If you found nothing coffee-specific, use null. Never write a sentence whose content is
  that you found nothing — null already says that.
- "about": at most 20 words on what this coffee tastes like or where it is from. Null if unknown.
- Never include disclaimers, caveats, or instructions about transferring parameters.

Return one JSON object and nothing else:
{
  "found": boolean,
  "roaster_identified": string|null,
  "roaster_guide_found": boolean,
  "guide_method": "v60"|"chemex"|"kalita"|"aeropress"|"frenchpress"|"clever"|null,
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
  const data = JSON.parse(m[0])
  // "Found" has to mean something usable, or the card fills up with polite nothing.
  const usable = data.water_temp_c || data.ratio || data.grind_microns || data.grind_note || data.advice || data.about
  if (!usable) data.found = false
  return { data, sources: sources.slice(0, 5) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ error: 'not_configured', message: 'Scanning is not switched on yet.' }, 503)
  const scanModel = Deno.env.get('SCAN_MODEL') || 'gpt-4.1'
  const researchModel = Deno.env.get('RESEARCH_MODEL') || 'gpt-5.6-luna'
  let usedScanModel = scanModel

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: userData, error: userErr } =
    await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
  if (userErr || !userData?.user) return json({ error: 'unauthorised' }, 401)
  const user = userData.user

  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) return json({ error: 'no_profile' }, 403)

  const body = await req.json().catch(() => null)
  const image: string | undefined = body?.image
  const mediaType: string = body?.media_type ?? 'image/jpeg'
  const method: string = body?.method ?? 'v60'
  const coffeeId: string | undefined = body?.coffee_id
  const roastHint: string | null = typeof body?.roast === 'string' ? body.roast : null

  // Two ways in. A photo is a scan: it costs a vision call and one of your scans.
  // A coffee_id is a re-tailor — same bag, different brewer — and costs nothing,
  // because everything expensive about that coffee is already on the row.
  const retailor = !image && !!coffeeId
  if (!image && !coffeeId) return json({ error: 'no_image' }, 400)
  if (image && image.length > 8_000_000) return json({ error: 'image_too_large', message: 'Resize before uploading.' }, 413)
  if (!retailor && profile.plan === 'free' && profile.scans_used >= profile.scan_limit) {
    return json({ error: 'limit_reached', scans_used: profile.scans_used, scan_limit: profile.scan_limit }, 402)
  }

  // ---- stage 1: know which coffee we are talking about --------------------
  let parsed: any = null
  let existing: any = null

  if (retailor) {
    const { data } = await admin.from('coffees').select('*').eq('id', coffeeId).maybeSingle()
    if (!data) return json({ error: 'unknown_coffee' }, 404)
    existing = data
    parsed = { ...(data.raw ?? {}), roaster: data.roaster, name: data.name, origin: data.origin,
               process: data.process, varietal: data.varietal, roast_label: data.roast_label,
               roast_level: data.roast_level, tasting_notes: data.tasting_notes, altitude_m: data.altitude_m,
               decaf: data.decaf, blend: data.blend, confidence: data.confidence }
  } else {
    // Try the configured model, then fall back through known-good ones. Model
    // availability varies by account, and a scan should not die over a name.
    const candidates = [...new Set([scanModel, 'gpt-4.1', 'gpt-4o', 'gpt-4.1-mini'])]
    const attempts: { model: string; error: string }[] = []
    for (const m0 of candidates) {
      try {
        const text = await readLabel(key, image!, mediaType, m0)
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
  }

  // ---- find what we already know about this bag ---------------------------
  // Same coffee, second photo: merge into the row rather than starting a new one.
  // A logo-only bag lands as "Unknown roaster" first; if a later read names the
  // roaster, that must still find the same row, so fall back to a name match.
  let slug = existing?.slug ?? slugify(parsed.roaster, parsed.name)
  if (!existing) {
    const { data } = await admin.from('coffees').select('*').eq('slug', slug).maybeSingle()
    existing = data
    if (!existing && parsed.name) {
      const { data: byName } = await admin.from('coffees').select('*')
        .eq('name', parsed.name).eq('roaster', 'Unknown roaster').maybeSingle()
      if (byName) { existing = byName; slug = byName.slug }
    }
  }
  if (!retailor && existing) parsed = mergeLabel({ ...(existing.raw ?? {}), roaster: existing.roaster, name: existing.name,
    origin: existing.origin, process: existing.process, varietal: existing.varietal, roast_label: existing.roast_label,
    roast_level: existing.roast_level, tasting_notes: existing.tasting_notes, altitude_m: existing.altitude_m,
    decaf: existing.decaf, blend: existing.blend, confidence: existing.confidence }, parsed)

  // ---- stage 2: reference lookups (free) ---------------------------------
  const { data: ref } = await admin.from('brew_reference').select('*').eq('method', method).maybeSingle()
  const { data: allRoasters } = await admin.from('roasters').select('*')
  const target = norm(parsed.roaster)
  const roaster = (allRoasters ?? []).find(r =>
    norm(r.name) === target || (r.aliases ?? []).some((a: string) => norm(a) === target)) ??
    (allRoasters ?? []).find(r => target.length > 3 &&
      (norm(r.name).includes(target) || target.includes(norm(r.name))))

  // ---- stage 3: research, once per coffee, cached forever -----------------
  let researchData = existing?.research ?? null
  let sources = existing?.sources ?? null
  let researched = !!existing?.researched_at
  let researchError: string | null = null

  if (!researched) {
    try {
      const r = await research(key, researchModel, parsed)
      researchData = r.data; sources = r.sources; researched = true
      // The web often knows the roaster when a logo-only bag does not.
      if (parsed.roaster === 'Unknown roaster' && r.data?.roaster_identified) {
        parsed.roaster = r.data.roaster_identified
      }
    } catch (e) {
      researchError = String(e).slice(0, 200)   // enhancement only — never fatal
      await admin.from('scan_errors').insert({ stage: 'research', model: researchModel, detail: researchError })
    }
  }

  const recipe = deriveRecipe(parsed, ref, roaster, researchData, method, roastHint)

  const { data: coffee } = await admin.from('coffees').upsert({
    slug,
    roaster: parsed.roaster,
    name: parsed.name,
    origin: parsed.origin,
    process: parsed.process,
    varietal: parsed.varietal,
    roast_label: parsed.roast_label ?? null,
    roast_level: parsed.roast_level ?? null,        // unread stays unread — never invented
    tasting_notes: parsed.tasting_notes ?? null,
    altitude_m: Number.isFinite(Number(parsed.altitude_m)) && parsed.altitude_m ? Math.round(Number(parsed.altitude_m)) : null,
    decaf: parsed.decaf === true,
    blend: parsed.blend === true,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    recipe,
    raw: parsed,
    research: researchData,
    sources,
    researched_at: researched ? (existing?.researched_at ?? new Date().toISOString()) : null,
    source: 'vision',
  }, { onConflict: 'slug' }).select().single()

  if (!retailor) {
    await admin.from('scans').insert({
      user_id: user.id, coffee_id: coffee?.id ?? null, cache_hit: !!existing?.researched_at, raw: parsed,
    })
    await admin.from('profiles').update({ scans_used: profile.scans_used + 1 }).eq('id', user.id)
  }

  return json({
    coffee, recipe, sources: sources ?? [],
    research_error: researchError,
    scan_model: retailor ? null : usedScanModel,
    matched_roaster: roaster?.name ?? null,
    cache_hit: !!existing?.researched_at,
    retailored: retailor,
    scans_used: profile.scans_used + (retailor ? 0 : 1),
    scan_limit: profile.scan_limit, plan: profile.plan,
  })
})
