// POR — roaster-catalog
// The roaster's own shop is the best source of "what coffees exist right now", with
// photos, and it costs nothing: Shopify stores publish /products.json publicly, and most
// speciality roasters run on Shopify. No model is involved. We read the feed, keep the
// coffees, drop the mugs and t-shirts, and store what the roaster says about each one
// (origin, process, roast, notes) at modest confidence — a real bag scan can still win.
//
// Also grabs the roaster's logo from its homepage (apple-touch-icon / og:image) once.
//
// { roaster_id } or { roaster: name } → syncs if older than a day → { roaster, coffees }

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const slugify = (r: string, n: string) => `${r}|${n}`.toLowerCase().normalize('NFKD').replace(/[^a-z0-9|]+/g, '-').replace(/^-|-$/g, '')
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; POR/1.0; +https://prestonnoland2020-hub.github.io/drip-dose/)', 'Accept': 'application/json, text/html' }
const STALE_MS = 24 * 3600 * 1000

// Things a coffee shop sells that are not coffee.
const NOT_COFFEE = /wholesale|apparel|\bshirts?\b|\btees?\b|hoodie|\bhats?\b|\bcaps?\b|beanie|\bmugs?\b|\bcups\b|tumbler|drinkware|\bglass(es|ware)?\b|stickers?|\bpins?\b|accessor|gift ?cards?|e-?gift|subscription|merch|\btea\b|matcha|chai\b|instant|equipment|\bgear\b|brewers?\b|grinders?\b|kettles?\b|drippers?\b|filter papers?|\bfilters\b|\bscales?\b|bundle|\bbooks?\b|tote|poster|\bprints?\b|candle|ready to drink|\brtd\b|sampler|\bclasses\b|\bclass\b|tickets?|donation|training|cascara|capsules?|\bpods?\b|granola|cereal|\bcans?\b|bottled|\bcold brew (cans?|bottle|concentrate)|advent|calendar|box set|\bsets?\b|sub only|collab box|vinyl|record|\bmenu\b|food|pastry|bakery|sandwich|latte|cappuccino|macchiato|frapp|mocha|americano|cortado|flat white|ciabatta|croissant|frittata|bagel|muffin|scone|cookie|brownie|\blids?\b|l\u00e5g|poser?\b|bagerpose|papir|\bvand\b|\d+\s?stk|\btins?\b|paper bag|packets?|k-?cups?|single serve|pods\b|variety pack|chicory|flavou?red|filter basket|cold coffee|\d+ ?pack\b|\/ ?mo\b|monthly|cialde|nespresso|keurig|\bkit\b|brew guide|drip bags?|steeped/i
const COUNTRIES = ['Ethiopia', 'Kenya', 'Colombia', 'Brazil', 'Guatemala', 'Costa Rica', 'Honduras', 'El Salvador', 'Nicaragua', 'Panama', 'Peru', 'Bolivia', 'Ecuador', 'Mexico', 'Rwanda', 'Burundi', 'Uganda', 'Tanzania', 'Yemen', 'Indonesia', 'Sumatra', 'Java', 'Sulawesi', 'Papua New Guinea', 'India', 'Vietnam', 'Thailand', 'Myanmar', 'China', 'Yunnan', 'Hawaii', 'Kona', 'Jamaica', 'Dominican', 'Congo', 'Malawi', 'Zambia', 'Zimbabwe', 'Laos', 'Philippines', 'Taiwan', 'Nepal', 'Haiti', 'Cuba', 'Venezuela', 'Timor', 'Guji', 'Yirgacheffe', 'Sidamo', 'Sidama', 'Huila', 'Nariño', 'Narino', 'Antioquia', 'Tolima', 'Cauca']
const TLD_CCY: [RegExp, string][] = [[/\.co\.uk$|\.uk$/, 'GBP'], [/\.com\.au$|\.au$/, 'AUD'], [/\.co\.nz$|\.nz$/, 'NZD'], [/\.ca$/, 'CAD'], [/\.de$|\.fr$|\.es$|\.nl$|\.it$|\.paris$|\.ie$/, 'EUR'], [/\.dk$/, 'DKK'], [/\.se$/, 'SEK'], [/\.no$/, 'NOK'], [/\.jp$/, 'JPY'], [/\.sg$/, 'SGD'], [/\.hk$/, 'HKD'], [/\.kr$/, 'KRW'], [/\.ch$/, 'CHF']]

const strip = (html: string) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim()

function roastFrom(s: string): string | null {
  const t = s.toLowerCase()
  if (/medium[- ]?light|light[- ]?medium/.test(t)) return 'medium-light'
  if (/medium[- ]?dark|full city|espresso roast/.test(t)) return 'medium-dark'
  if (/\bvery dark|french roast|italian roast/.test(t)) return 'very-dark'
  if (/\blight(er|est)?\b|nordic|filter roast|omni/.test(t)) return 'light'
  if (/\bdark(er)?\b/.test(t)) return 'dark'
  if (/\bmedium\b|city roast/.test(t)) return 'medium'
  return null
}
function processFrom(s: string): string | null {
  const t = s.toLowerCase()
  const hits: string[] = []
  for (const [re, label] of [[/anaerobic natural/, 'Anaerobic Natural'], [/anaerobic washed/, 'Anaerobic Washed'], [/anaerobic honey/, 'Anaerobic Honey'], [/anaerobic/, 'Anaerobic'], [/carbonic macer/, 'Carbonic Maceration'], [/thermal shock/, 'Thermal Shock'], [/co-?ferment/, 'Co-ferment'], [/wet[- ]hull|giling basah/, 'Wet-hulled'], [/\bhoney\b/, 'Honey'], [/\bnatural\b/, 'Natural'], [/\bwashed\b/, 'Washed']] as [RegExp, string][]) if (re.test(t)) { hits.push(label); if (!/^Anaerobic$|Thermal|Co-ferment|Carbonic/.test(label)) break }
  return hits.length ? [...new Set(hits)].join(' ') : null
}
function originFrom(s: string): string | null {
  for (const c of COUNTRIES) if (new RegExp(`\\b${c}\\b`, 'i').test(s)) return c === 'Narino' ? 'Nariño' : c
  return null
}
function notesFrom(body: string): string | null {
  const t = strip(body)
  // Only accept something that reads like a list of flavours, not a sentence fragment.
  const m = t.match(/(?:tasting notes? of|tasting notes?|flavou?r notes? of|flavou?r notes?|notes of|notes|we taste|tastes? like|reminds us of|reminiscent of)\s*[:\-–—]?\s*([A-Za-z][^.;:!?()]{4,90})/i)
  if (!m) return null
  let n = m[1].replace(/\s+(?:and|&)\s+/g, ', ').replace(/\s*,\s*/g, ', ').replace(/, ,/g, ',').trim().replace(/[,\s]+$/, '')
  const all = n.split(', ').map(x => x.trim()).filter(Boolean)
  const parts = all.filter(x => x.length >= 3 && x.split(' ').length <= 3 && !/\b(almost|like|very|really|with|this|that|which|our|your)\b/i.test(x))
  if (parts.length < 2 || parts.length > 6 || parts.length < all.length - 1) return null
  return parts.join(', ')
}
const cleanName = (t: string) => t
  .replace(/[,\s(–-]+\d+(?:[.,]\d+)?\s?(?:kg|g|oz|lb|lbs|ml|l)\b[^,]*$/i, '')   // "Reshad, 250g" / "Basha - 1kg Tin"
  .replace(/\s*[-–|,]\s*(whole bean|ground|retail|drip grind|espresso grind)\b.*$/i, '')
  .replace(/\s+/g, ' ').replace(/[\s,–-]+$/, '').trim()
// Coffee for sale usually says so somewhere: the type, a country, a roast word, a process word.
const COFFEE_TYPE = /coffee|bean|single|blend|espresso|filter|retail|\bSO\b|\bYR\b|roast|omni|decaf|microlot|origin/i
const COFFEE_WORDS = /\b(coffee|beans?|roast(ed)?|washed|natural|honey|anaerobic|espresso|filter|omni|decaf|blend|single origin|geisha|gesha|bourbon|caturra|typica|sl-?28|pacamara|heirloom|arabica|microlot|lot\b)/i

async function fetchShopify(site: string) {
  for (const host of [`https://${site}`, `https://www.${site}`]) {
    try {
      const all: any[] = []
      for (let page = 1; page <= 4; page++) {
        const r = await fetch(`${host}/products.json?limit=250&page=${page}`, { headers: UA, signal: AbortSignal.timeout(12000) })
        if (!r.ok) break
        const d = await r.json(); const ps = d?.products
        if (!Array.isArray(ps)) break
        all.push(...ps); if (ps.length < 250) break
      }
      if (all.length) return { host, products: all }
    } catch { /* try next host */ }
  }
  return null
}

async function fetchLogo(host: string): Promise<string | null> {
  try {
    const r = await fetch(host, { headers: { ...UA, Accept: 'text/html' }, signal: AbortSignal.timeout(10000) })
    const html = (await r.text()).slice(0, 300000)
    const pick = (re: RegExp) => { const m = html.match(re); return m ? m[1] : null }
    const cand = pick(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
      || pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i)
      || pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      || pick(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
    if (!cand) return null
    return new URL(cand.startsWith('//') ? 'https:' + cand : cand, host).toString()
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))
  const force = body.force === true

  let q = admin.from('roasters').select('*')
  q = body.roaster_id ? q.eq('id', body.roaster_id) : q.ilike('name', String(body.roaster || ''))
  const { data: roaster } = await q.maybeSingle()
  if (!roaster) return json({ error: 'unknown_roaster' }, 404)

  const fresh = roaster.catalog_synced_at && Date.now() - Date.parse(roaster.catalog_synced_at) < STALE_MS
  let synced = false, error: string | null = null
  if (roaster.website && (!fresh || force)) {
    const site = String(roaster.website).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
    const feed = await fetchShopify(site)
    if (!feed) { error = 'no_feed' }
    else {
      const ccy = TLD_CCY.find(([re]) => re.test(site))?.[1] ?? 'USD'
      const seen = new Set<string>()
      const rows: any[] = []
      for (const p of feed.products) {
        const tags: string[] = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((s: string) => s.trim())
        const tagStr = tags.filter(t => !/^meta-|^collection/i.test(t)).join(' ')
        // A product the shop itself files under coffee only needs its title checked; anything else, check everything.
        const typed = COFFEE_TYPE.test(p.product_type || '')
        if (NOT_COFFEE.test(typed ? p.title : `${p.product_type} ${p.title} ${tagStr}`)) continue
        if (/wholesale|archive/i.test(tagStr) || /wholesale/i.test(p.product_type || '')) continue
        const bodyText = strip(p.body_html).slice(0, 1200)
        if (!typed && !COFFEE_WORDS.test(`${p.title} ${tagStr}`) && !originFrom(`${p.title} ${tagStr}`) && !(COFFEE_WORDS.test(bodyText) && originFrom(bodyText))) continue
        const variants: any[] = p.variants || []
        const available = variants.some(v => v.available !== false)
        const price = variants.map(v => Number(v.price)).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)[0] ?? null
        if (price == null) continue   // a café menu item, not a bag you can buy
        const name = cleanName(p.title || '')
        if (!name) continue
        const slug = slugify(roaster.name, name)
        if (seen.has(slug)) continue
        seen.add(slug)
        const text = `${p.title} ${tagStr} ${strip(p.body_html)}`
        const img = p.images?.[0]?.src || null
        const roast = roastFrom(tagStr) ?? roastFrom(p.title) ?? roastFrom(strip(p.body_html).slice(0, 600))
        const process = processFrom(`${tagStr} ${p.title}`) ?? processFrom(strip(p.body_html).slice(0, 800))
        const single = /single[- ]origin/i.test(`${p.title} ${tagStr} ${p.product_type}`)
        const blend = !single && (/\bblends?\b/i.test(`${p.title} ${p.product_type}`) || tags.some(t => /^blends?$/i.test(t.trim())))
        rows.push({
          slug, roaster: roaster.name, name,
          origin: blend ? null : (originFrom(`${p.title} ${tagStr}`) ?? originFrom(strip(p.body_html).slice(0, 800))),
          process, roast_level: roast, roast_label: roast ? (tags.find(t => roastFrom(t)) ?? null) : null,
          tasting_notes: notesFrom(p.body_html),
          blend, decaf: /decaf/i.test(text),
          image_url: img ? img.replace(/(\.[a-z]{3,4})(\?.*)?$/i, '_600x$1') : null,
          product_url: `${feed.host}/products/${p.handle}`,
          price, currency: ccy, available, catalog_id: String(p.id), catalog_synced_at: new Date().toISOString(),
          confidence: 0.55, source: 'catalog', field_sources: { roaster: 'catalog', name: 'catalog', origin: 'catalog', process: 'catalog', roast_level: 'catalog', tasting_notes: 'catalog' },
          raw: { title: p.title, tags, product_type: p.product_type, handle: p.handle },
        })
      }
      // Never let a shop listing overwrite what a real bag said: for rows that came from a scan
      // or a person, only fill blanks and attach the shop fields.
      const names = [roaster.name, ...(roaster.aliases ?? [])]
      const { data: existing } = await admin.from('coffees').select('id, slug, source, roaster, origin, process, roast_level, roast_label, tasting_notes, image_path').in('roaster', names)
      const key = (slug: string) => slug.split('|')[1] ?? slug
      const bySlug = new Map((existing ?? []).map((e: any) => [key(e.slug), e]))
      const inserts: any[] = [], updates: any[] = []
      for (const r of rows) {
        const e = bySlug.get(key(r.slug))
        if (!e) inserts.push(r)
        else if (e.source === 'catalog' || e.source === 'seeded') updates.push({ id: e.id, ...r })
        else {
          const patch: any = { id: e.id, image_url: r.image_url, product_url: r.product_url, price: r.price, currency: r.currency, available: r.available, catalog_id: r.catalog_id, catalog_synced_at: r.catalog_synced_at }
          for (const f of ['origin', 'process', 'roast_level', 'roast_label', 'tasting_notes']) if (!e[f] && r[f]) patch[f] = r[f]
          updates.push(patch)
        }
      }
      if (inserts.length) { const { error: ie } = await admin.from('coffees').insert(inserts); if (ie) error = ie.message }
      for (const u of updates) { const { id, ...rest } = u; await admin.from('coffees').update(rest).eq('id', id) }
      // Shop rows that vanished from the feed are no longer on the menu.
      const live = new Set(rows.map(r => key(r.slug)))
      const gone = (existing ?? []).filter((e: any) => (e.source === 'catalog' || e.source === 'seeded') && !live.has(key(e.slug))).map((e: any) => e.id)
      if (gone.length) await admin.from('coffees').update({ available: false }).in('id', gone)
      const logo = roaster.logo_url || await fetchLogo(feed.host)
      await admin.from('roasters').update({ catalog_platform: 'shopify', catalog_synced_at: new Date().toISOString(), catalog_count: rows.filter(r => r.available).length, catalog_error: null, logo_url: logo }).eq('id', roaster.id)
      synced = true
    }
    if (error && !synced) await admin.from('roasters').update({ catalog_synced_at: new Date().toISOString(), catalog_error: error, logo_url: roaster.logo_url || await fetchLogo(`https://${site}`) }).eq('id', roaster.id)
  }

  const { data: r2 } = await admin.from('roasters').select('id, name, city, country, website, tier, house_style, logo_url, catalog_platform, catalog_count, catalog_synced_at').eq('id', roaster.id).single()
  const { data: coffees } = await admin.from('coffees').select('id, roaster, name, origin, process, roast_level, tasting_notes, blend, decaf, image_url, image_path, product_url, price, currency, available, source').in('roaster', [roaster.name, ...(roaster.aliases ?? [])]).eq('available', true).order('name')
  return json({ roaster: r2, coffees: coffees ?? [], synced, error })
})
