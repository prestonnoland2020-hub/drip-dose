// Public configuration only. The publishable key is safe in a browser; every
// privileged operation happens behind RLS or inside an edge function.
export const SB_URL = 'https://mtkmopywwyyvglbuybph.supabase.co'
export const SB_KEY = 'sb_publishable_F8J9a6lau2UmYfkybnQfgQ_1EyY71Ym'
export const FN = name => `${SB_URL}/functions/v1/${name}`
export const MOCK = new URLSearchParams(location.search).has('mock')
