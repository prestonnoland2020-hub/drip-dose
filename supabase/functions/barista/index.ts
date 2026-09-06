// POR — barista (Pro)
// A working barista who knows this person's gear, their coffee and every cup they've
// logged, and answers like one: specific numbers on their dial, one change at a time,
// no pretending. No web access, and it says so rather than guess.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SYSTEM = `You are the Barista in POR, a pour-over app. You are an elite, working specialty-coffee professional: competition-level barista, roaster's quality-control palate, and a brewing scientist who has read the SCA handbooks, Scott Rao, James Hoffmann, Matt Perger and the Coffee Ad Astra / Barista Hustle material. You talk like the best barista at the counter: warm, plain, specific, brief. No headers, no bullet lists, no emoji. Two to six sentences unless the person asks for a full recipe, in which case give a compact step list with times and target weights.

What you know cold, and use without being asked:
- Extraction: strength (TDS, ~1.15–1.45% filter, 7–12% espresso) vs extraction yield (18–22% sweet spot). Sour, thin, salty, quick-finishing = under-extracted → finer, hotter, longer contact, more agitation. Bitter, drying, astringent, hollow = over-extracted → coarser, cooler, less agitation, gentler pours. Weak or too strong is RATIO, not extraction; fix it with dose or water, never grind.
- Grind is the biggest lever, then temperature, then ratio, then agitation and pour rate. Fines cause astringency and stalls; too coarse gives fast drawdown and sourness. Drawdown time is a symptom, not a target.
- Roast and bean: light roasts are dense and less soluble (hotter water, finer, longer bloom); dark roasts are porous (cooler water, coarser, shorter bloom, go easy on agitation). Naturals and anaerobics extract fast and turn boozy or muddy when pushed — cooler and coarser. Decaf extracts fast — coarser. High-grown/dense coffees want more energy. Freshness: filter coffee is best ~5–21 days off roast, espresso ~10–30; under 5 days blooms violently (bloom longer, 45–60 s); past ~6 weeks grind slightly finer and expect flat aromatics.
- Water: SCA target ~75–150 ppm TDS, alkalinity ~40 ppm, GH:KH about 2:1 to 4:1. Soft or distilled water tastes flat and sour; very hard water goes dull and chalky; high alkalinity kills acidity. Third Wave Water, Lotus or Aquacode mineral packets are a reasonable fix. Boil-fresh, never re-boiled for long.
- Methods: V60 (bloom 2–3× dose 30–45 s, 60/40 or five-pour, ~8 g/s, swirl to flatten, 3:00–3:30), Origami (cone or wave filter changes flow), Chemex (thick paper, coarser, 4:00–4:30, keep below rim), Kalita Wave (flat bed, pulse pours, forgiving), AeroPress (immersion, fine, 1:12–1:15, 30 s press), Clever (immersion then drain), French press (4 min, break crust, don't plunge to the bottom), moka (hot-water start, medium heat, off at the first sputter), espresso (1:2 in 25–30 s, first drops 6–10 s, dial on taste not time), cold brew (1:8 concentrate, 12–16 h). Rinse paper filters. Preheat everything. Bypass (adding water after) is a legitimate way to fix a strong, well-extracted cup.
- Dialling in: change ONE variable per brew, taste before adjusting again, keep everything else identical, write it down. Move grind one step at a time on their grinder; two steps if the fault is strong. Temperature moves 2 °C at a time; ratio one point at a time.
- Grinders: know the common home grinders (OXO Brew Conical, Baratza Encore/Virtuoso/Sette, Fellow Ode/Opus, Timemore C2/C3, 1Zpresso JX/K, Comandante, Kingrinder, Hario Skerton, Niche, DF64, Eureka Mignon, Wilfa) and the fact that a number only means something on that grinder. Speak in the person's own dial numbers whenever they are given below. Never say "medium-fine" to someone whose grinder is known — say the setting.

How you behave:
- The context below is real: this person's setup, the coffee on the counter, the recipe POR is recommending, and their logged brews. Use it. Quote their own numbers and dates back to them ("your 9.4 on Tuesday was 20 g → 320 g at 96 °C on 6").
- Recommend exactly ONE change per answer and say what to keep the same. If they ask for a whole recipe, give one — dose, water, temperature, grind setting on their grinder, timeline — and say what it is based on.
- Be honest about uncertainty. You have NO web access and never claim to have looked anything up. If you don't know a specific coffee or roaster, say so and reason from what the bag says.
- If they have no brews yet, say so once and answer from the coffee and general knowledge.
- Units: grams, °C with °F in brackets the first time it appears, ratios as 1:x, times as m:ss.
- Never invent numbers about their equipment; if the grinder is unknown, ask which one and answer in general terms meanwhile.
- If asked something unrelated to coffee, answer in one friendly sentence and steer back.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ error: 'not_configured' }, 503)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: userData } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''))
  if (!userData?.user) return json({ error: 'unauthorised' }, 401)
  const user = userData.user

  const { data: profile } = await admin.from('profiles').select('display_name, username, equipment, prefs, setup, favorite_method, plan').eq('id', user.id).maybeSingle()
  // The Barista is part of POR Pro.
  if (!profile || !['pro', 'trial', 'founder'].includes(String(profile.plan))) return json({ error: 'pro_required' }, 402)

  const body = await req.json().catch(() => ({}))
  const question = String(body.question ?? '').slice(0, 800).trim()
  if (!question) return json({ error: 'no_question' }, 400)
  const prior: { q: string; a: string }[] = Array.isArray(body.history) ? body.history.slice(-6) : []

  // ---- their gear, with the grinder's chart so answers can be dial numbers ----------
  const items: any[] = Array.isArray(profile.setup) ? profile.setup : []
  const active = items.find(i => i.kind === 'grinder' && i.active) ?? items.find(i => i.kind === 'grinder')
  let grinder: any = null
  if (active?.catalog_id) { const { data } = await admin.from('grinders').select('brand, model, scale, setting_min, setting_max, step, points, dial, note, verified').eq('id', active.catalog_id).maybeSingle(); grinder = data }
  const gearLines = items.map(i => `${i.kind}: ${i.name}${i.active ? ' (in use)' : ''}`).join('; ')
  const grinderLine = grinder ? `Grinder in use: ${grinder.brand} ${grinder.model} — dial runs ${grinder.setting_min}–${grinder.setting_max} in steps of ${grinder.step ?? 1}${grinder.scale === 'clicks' ? ' (clicks)' : ''}; lower = finer. ${grinder.dial ? 'Dial: ' + grinder.dial + '. ' : ''}Chart (setting → microns): ${(grinder.points ?? []).map((p: any) => `${p[0]}→${p[1]}`).join(', ')}.${grinder.verified === false ? ' (Chart is an estimate.)' : ''}` : (active ? `Grinder in use: ${active.name} (no chart on file — speak in relative steps).` : 'No grinder on file.')

  // ---- the coffee on the counter -------------------------------------------------
  let current: any = null, stats: any[] = [], roasterRow: any = null
  if (body.coffee_id) {
    const { data } = await admin.from('coffees').select('roaster, name, roast_level, roast_label, process, varietal, origin, region, producer, altitude_m, tasting_notes, blend, decaf, roast_date, research, source, confidence').eq('id', body.coffee_id).maybeSingle()
    current = data
    const { data: st } = await admin.from('coffee_method_stats').select('*').eq('coffee_id', body.coffee_id)
    stats = st ?? []
    if (current?.roaster) { const { data: r } = await admin.from('roasters').select('name, house_style, roast_bias, city').ilike('name', current.roaster).maybeSingle(); roasterRow = r }
  }
  const method = String(body.method || profile.favorite_method || 'v60')
  const { data: ref } = await admin.from('brew_reference').select('display_name, ratio_min, ratio_max, temp_min_c, temp_max_c, grind_min_um, grind_max_um, grind_label, source').eq('method', method).maybeSingle()

  // ---- what they've brewed --------------------------------------------------------
  const { data: brews } = await admin.from('brews')
    .select('created_at, method, dose_g, water_g, ratio, temp_c, grind_label, grind_setting, grinder, total_seconds, rating, acidity, sweetness, body, clarity, balance, feedback, notes, next_time, coffees(roaster, name, roast_level, process, origin)')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(25)
  const history = (brews ?? []).map((b: any) => {
    const c = b.coffees ?? {}
    const dims = [b.acidity != null ? `acidity ${b.acidity}` : '', b.sweetness != null ? `sweetness ${b.sweetness}` : '', b.body != null ? `body ${b.body}` : '', b.clarity != null ? `clarity ${b.clarity}` : '', b.balance != null ? `balance ${b.balance}` : ''].filter(Boolean).join(', ')
    return `${new Date(b.created_at).toISOString().slice(0, 10)} · ${c.roaster ?? '?'} ${c.name ?? ''} (${c.roast_level ?? 'roast ?'}${c.process ? ', ' + c.process : ''}) · ${b.method} · ${b.dose_g} g → ${b.water_g} g (1:${b.ratio}) · ${b.temp_c ?? '?'} °C · grind ${b.grind_setting ?? b.grind_label ?? '?'}${b.grinder ? ' on ' + b.grinder : ''} · ${b.total_seconds ? Math.floor(b.total_seconds / 60) + ':' + String(Math.round(b.total_seconds % 60)).padStart(2, '0') : '?'} · ${b.rating ? b.rating + '/10' : 'unrated'}${dims ? ' (' + dims + ')' : ''}${b.feedback?.length ? ' · said: ' + b.feedback.map((f: string) => f.replace(/_/g, ' ')).join(', ') : ''}${b.notes ? ' · "' + String(b.notes).slice(0, 100) + '"' : ''}${b.next_time?.change?.text ? ' · POR suggested next: ' + b.next_time.change.text : ''}`
  }).join('\n')

  const days = current?.roast_date ? Math.round((Date.now() - Date.parse(current.roast_date)) / 86400000) : null
  const context = [
    `Brewer: ${profile.display_name || profile.username || 'a POR member'}. Favourite method: ${profile.favorite_method || 'unknown'}. ${gearLines ? 'Setup — ' + gearLines + '.' : ''}`,
    grinderLine,
    current ? `Coffee on the counter: ${current.roaster} — ${current.name}. Roast: ${current.roast_level ?? 'not stated'}${current.roast_label ? ' ("' + current.roast_label + '")' : ''}. Process: ${current.process ?? 'not stated'}. Origin: ${[current.origin, current.region, current.producer].filter(Boolean).join(', ') || 'not stated'}${current.varietal ? '. Varietal: ' + current.varietal : ''}${current.altitude_m ? '. Altitude: ' + current.altitude_m + ' m' : ''}${current.blend ? '. A blend' : ''}${current.decaf ? '. Decaf' : ''}${current.tasting_notes ? '. Roaster notes: ' + current.tasting_notes : ''}${days != null ? '. Roasted ' + days + ' days ago' : ''}. Label read by: ${current.source}${current.research?.advice ? '. Roaster guidance found online earlier: ' + current.research.advice : ''}${current.research?.about ? ' (' + current.research.about + ')' : ''}` : 'No coffee selected right now.',
    roasterRow ? `Roaster house style: ${roasterRow.house_style ?? 'unknown'}${roasterRow.roast_bias ? ` (roasts ${Number(roasterRow.roast_bias) > 0 ? 'darker' : 'lighter'} than labels suggest)` : ''}.` : '',
    stats.length ? `Community on this coffee: ${stats.map((s: any) => `${s.method}: ${s.brews} brews, avg ${s.avg_rating}/10, typical 1:${s.common_ratio} at ${s.common_temp} °C`).join('; ')}.` : '',
    body.recipe ? `Recipe POR is recommending right now: ${String(body.recipe).slice(0, 400)}` : '',
    ref ? `Published ${ref.display_name} ranges (${ref.source}): 1:${ref.ratio_min}–1:${ref.ratio_max}, ${ref.temp_min_c}–${ref.temp_max_c} °C, ${ref.grind_min_um}–${ref.grind_max_um} µm (${ref.grind_label}).` : '',
    body.screen ? `They are on the ${body.screen} screen.` : '',
    history ? `Their last ${(brews ?? []).length} brews, newest first:\n${history}` : 'They have no brews logged yet.',
  ].filter(Boolean).join('\n\n')

  const messages: any[] = [{ role: 'system', content: SYSTEM }, { role: 'system', content: `CONTEXT (real data from POR)\n\n${context}` }]
  for (const t of prior) { if (t.q) messages.push({ role: 'user', content: String(t.q).slice(0, 800) }); if (t.a) messages.push({ role: 'assistant', content: String(t.a).slice(0, 1200) }) }
  messages.push({ role: 'user', content: question })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: Deno.env.get('BARISTA_MODEL') || 'gpt-4.1', max_tokens: 600, temperature: 0.4, messages }),
  })
  if (!res.ok) return json({ error: 'model_failed', detail: (await res.text()).slice(0, 200) }, 502)
  const out = await res.json()
  return json({ answer: out.choices?.[0]?.message?.content?.trim() ?? '', brews_used: (brews ?? []).length })
})
