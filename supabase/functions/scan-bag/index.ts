// POR — scan-bag
// Reads a photo of a coffee bag and returns a brew recipe.
//
// Order matters: identity and quota first (free), then the model (costs money).
// Works with either OpenAI or Anthropic — whichever key is present.
// Set SCAN_MODEL to override the default model.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ROAST: Record<string, { temp: number; grind: string; ratio: number; bloom: number }> = {
  'light':        { temp: 96, grind: 'Medium-fine — dense beans give up their sugars slowly', ratio: 16,   bloom: 2.5 },
  'medium-light': { temp: 95, grind: 'Medium-fine',                                           ratio: 16,   bloom: 2.5 },
  'medium':       { temp: 93, grind: 'Medium — like table salt',                              ratio: 16,   bloom: 2.5 },
  'medium-dark':  { temp: 90, grind: 'Medium-coarse',                                         ratio: 16.5, bloom: 2.5 },
  'dark':         { temp: 88, grind: 'Coarse — porous beans give up too much, too fast',      ratio: 17,   bloom: 2.0 },
  'very-dark':    { temp: 86, grind: 'Coarse',                                                ratio: 17,   bloom: 2.0 },
}
const ORDER = ['light', 'medium-light', 'medium', 'medium-dark', 'dark', 'very-dark']

const slugify = (roaster: string, name: string) =>
  `${roaster}|${name}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9|]+/g, '-').replace(/^-|-$/g, '')

function shiftRoast(level: string, shift: number): string {
  const i = ORDER.indexOf(level)
  if (i < 0) return level
  return ORDER[Math.max(0, Math.min(ORDER.length - 1, Math.round(i + shift)))]
}

function buildRecipe(level: string, daysOffRoast: number | null) {
  const base = ROAST[level] ?? ROAST['medium']
  const r = { ...base, notes: [] as string[] }
  if (daysOffRoast !== null) {
    if (daysOffRoast <= 7) { r.bloom = 3.0; r.notes.push('Very fresh — still degassing, so bloom longer and expect a big dome.') }
    else if (daysOffRoast >= 45) { r.bloom = 2.0; r.notes.push(`About ${daysOffRoast} days off roast — past its best. Grind a touch finer to compensate.`) }
  }
  return r
}

const PROMPT = `You are reading a photo of a bag of coffee for a pour-over app.

Report ONLY what is printed on the bag or clearly visible. A wrong answer is worse
than no answer, because someone will brew to it. If a field is not legible, use null.
Do not infer origin or varietal from the beans themselves — that is not reliably
possible from a photograph and you must not guess it.

Return a single JSON object and nothing else:
{
  "is_coffee_bag": boolean,
  "roaster": string|null,
  "name": string|null,
  "origin": string|null,
  "process": string|null,
  "varietal": string|null,
  "roast_label": string|null,
  "roast_level": "light"|"medium-light"|"medium"|"medium-dark"|"dark"|"very-dark"|null,
  "roast_date": string|null,
  "confidence": number,
  "notes": string|null
}`

// --- provider adapters -------------------------------------------------------
async function readWithOpenAI(key: string, image: string, mediaType: string, model: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      max_completion_tokens: 700,
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${image}`, detail: 'high' } },
      ]}],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`)
  const out = await res.json()
  return out.choices?.[0]?.message?.content ?? ''
}

async function readWithAnthropic(key: string, image: string, mediaType: string, model: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 700,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: PROMPT },
      ]}],
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`)
  const out = await res.json()
  return out.content?.[0]?.text ?? ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!openaiKey && !anthropicKey) {
    return json({ error: 'not_configured', message: 'Scanning is not switched on yet.' }, 503)
  }
  const provider = openaiKey ? 'openai' : 'anthropic'
  const model = Deno.env.get('SCAN_MODEL') || (provider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-5')

  // --- who is asking, and do they have scans left ---
  const authHeader = req.headers.get('Authorization') ?? ''
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
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
  if (!image) return json({ error: 'no_image' }, 400)
  if (image.length > 8_000_000) return json({ error: 'image_too_large', message: 'Resize before uploading.' }, 413)

  // --- read the label ---
  let text = ''
  try {
    text = provider === 'openai'
      ? await readWithOpenAI(openaiKey!, image, mediaType, model)
      : await readWithAnthropic(anthropicKey!, image, mediaType, model)
  } catch (e) {
    return json({ error: 'vision_failed', provider, model, detail: String(e) }, 502)
  }

  let parsed: any
  try { parsed = JSON.parse(String(text).replace(/^```(?:json)?|```$/gm, '').trim()) }
  catch { return json({ error: 'unparseable', text }, 502) }

  if (!parsed.is_coffee_bag || !parsed.roaster || !parsed.name) {
    return json({ error: 'not_recognised', message: "That doesn't look like a coffee bag label. Try the front of the bag, in good light.", parsed }, 422)
  }

  // --- roaster calibration: a "medium" is not the same everywhere ---
  let level = parsed.roast_level ?? 'medium'
  let calNote: string | null = null
  const { data: cal } = await admin.from('roaster_calibration')
    .select('*').eq('roaster', String(parsed.roaster).toLowerCase().trim()).maybeSingle()
  if (cal && Number(cal.shift) !== 0) {
    const adjusted = shiftRoast(level, Number(cal.shift))
    if (adjusted !== level) {
      calNote = `${parsed.roaster} runs ${Number(cal.shift) > 0 ? 'darker' : 'lighter'} than the label suggests, so this is treated as ${adjusted.replace('-', ' ')}.`
      level = adjusted
    }
  }

  const days = parsed.roast_date
    ? Math.max(0, Math.round((Date.now() - Date.parse(parsed.roast_date)) / 86_400_000))
    : null
  const recipe = buildRecipe(level, Number.isFinite(days as number) ? days : null)
  if (calNote) recipe.notes.unshift(calNote)

  const slug = slugify(parsed.roaster, parsed.name)
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
    source: 'vision',
  }, { onConflict: 'slug' }).select().single()

  await admin.from('scans').insert({ user_id: user.id, coffee_id: coffee?.id ?? null, cache_hit: false, raw: parsed })
  await admin.from('profiles').update({ scans_used: profile.scans_used + 1 }).eq('id', user.id)

  return json({
    coffee, recipe, cache_hit: false, provider, model,
    scans_used: profile.scans_used + 1,
    scan_limit: profile.scan_limit,
    plan: profile.plan,
  })
})
