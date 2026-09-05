// POR — barista
// A short answer grounded in what this person has actually brewed. No web, no
// pretending. If the history is empty it says so and answers generally.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SYSTEM = `You are the barista inside POR, a coffee brewing app. You answer in 2–5 short sentences, plainly, like a good barista at the counter — no headers, no bullet lists, no emoji.

Rules that matter:
- Ground every answer in the brewer's own history below when it is relevant. Quote their numbers back to them.
- Recommend ONE change at a time. Never tell someone to change grind, temperature and ratio together.
- Sour/thin = under-extraction (finer, hotter). Bitter/harsh = over-extraction (coarser, cooler). Weak/strong = ratio, not extraction.
- You have NO web access. Never claim to have looked something up. If you don't know a specific coffee or roaster, say so.
- If the history is empty, say you don't have their brews yet and answer generally.
- Units: grams, °C (with °F in brackets the first time), 1:x ratios.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ error: 'not_configured' }, 503)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: userData } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
  if (!userData?.user) return json({ error: 'unauthorised' }, 401)
  const user = userData.user

  const body = await req.json().catch(() => ({}))
  const question = String(body.question ?? '').slice(0, 600).trim()
  if (!question) return json({ error: 'no_question' }, 400)

  const { data: brews } = await admin.from('brews')
    .select('created_at, method, dose_g, water_g, ratio, temp_c, grind_label, grind_setting, total_seconds, rating, feedback, notes, coffees(roaster, name, roast_level, process, origin)')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
  const { data: profile } = await admin.from('profiles').select('equipment, prefs, favorite_method').eq('id', user.id).maybeSingle()

  let current: any = null
  if (body.coffee_id) {
    const { data } = await admin.from('coffees').select('roaster, name, roast_level, process, origin, tasting_notes, blend, decaf, altitude_m, recipe').eq('id', body.coffee_id).maybeSingle()
    current = data
  }

  const history = (brews ?? []).map((b: any) => {
    const c = b.coffees ?? {}
    return `${new Date(b.created_at).toISOString().slice(0, 10)} · ${c.roaster ?? '?'} ${c.name ?? ''} (${c.roast_level ?? 'roast ?'}${c.process ? ', ' + c.process : ''}) · ${b.method} · ${b.dose_g}g→${b.water_g}g 1:${b.ratio} · ${b.temp_c ?? '?'}°C · ${b.grind_setting ?? b.grind_label ?? 'grind ?'} · ${b.total_seconds ? Math.round(b.total_seconds) + 's' : ''} · ${b.rating ? b.rating + '/10' : 'unrated'}${b.feedback?.length ? ' · said: ' + b.feedback.join(', ') : ''}${b.notes ? ' · "' + String(b.notes).slice(0, 80) + '"' : ''}`
  }).join('\n')

  const context = [
    profile?.equipment && Object.keys(profile.equipment).length ? `Equipment: ${JSON.stringify(profile.equipment)}` : '',
    current ? `Coffee on the counter now: ${current.roaster} ${current.name} — ${current.roast_level ?? 'roast unknown'}${current.process ? ', ' + current.process : ''}${current.origin ? ', ' + current.origin : ''}${current.tasting_notes ? '. Notes: ' + current.tasting_notes : ''}` : '',
    history ? `Their last ${(brews ?? []).length} brews, newest first:\n${history}` : 'They have no brews logged yet.',
  ].filter(Boolean).join('\n\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: Deno.env.get('BARISTA_MODEL') || 'gpt-4.1-mini',
      max_tokens: 350,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${context}\n\nQuestion: ${question}` },
      ],
    }),
  })
  if (!res.ok) return json({ error: 'model_failed', detail: (await res.text()).slice(0, 200) }, 502)
  const out = await res.json()
  return json({ answer: out.choices?.[0]?.message?.content?.trim() ?? '', brews_used: (brews ?? []).length })
})
