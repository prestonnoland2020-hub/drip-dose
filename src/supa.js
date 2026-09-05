// Supabase client + auth + edge-function calls. One place; nothing else imports the SDK.
import { SB_URL, SB_KEY, FN, MOCK } from './config.js'

let client = null
export async function supa() {
  if (client) return client
  if (MOCK) { const m = await import('./mock.js'); client = m.mockClient(); return client }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
  client = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

export let session = null
const listeners = new Set()
export function onAuth(fn) { listeners.add(fn); fn(session); return () => listeners.delete(fn) }

export async function initAuth() {
  const c = await supa()
  const { data } = await c.auth.getSession()
  session = data?.session ?? null
  c.auth.onAuthStateChange((_e, s) => { session = s; listeners.forEach(f => f(s)) })
  listeners.forEach(f => f(session))
  return session
}
export const uid = () => session?.user?.id ?? null

export async function signInGoogle() {
  const c = await supa()
  return c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
}
export async function signInEmail(email) {
  const c = await supa()
  return c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })
}
export async function signOut() { const c = await supa(); await c.auth.signOut() }

// Call an edge function with the user's token (or anonymously with the publishable key).
export async function fn(name, body) {
  if (MOCK) { const m = await import('./mock.js'); return m.mockFn(name, body) }
  const r = await fetch(FN(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY,
      Authorization: `Bearer ${session?.access_token ?? SB_KEY}` },
    body: JSON.stringify(body ?? {}),
  })
  const out = await r.json().catch(() => ({ error: 'bad_json' }))
  if (!r.ok) throw Object.assign(new Error(out.error || r.status), { code: out.error, detail: out, status: r.status })
  return out
}
