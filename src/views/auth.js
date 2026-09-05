import { mount, top, esc, $, toast, LOGO } from '../ui.js'
import { signInGoogle, signInEmail, session } from '../supa.js'
export async function render() {
  if (session) { location.hash = '#/home'; return }
  mount(`${top('', { back: '#/home' })}
    <div style="text-align:center;margin:20px 0 26px"><span style="display:inline-block;width:56px;height:56px;color:var(--accent)">${LOGO}</span><h1>Sign in to POR</h1><p class="muted">Your coffees, brews and recipes, on every device. Free.</p></div>
    <div class="stack" style="gap:10px"><button class="btn big" id="g"><svg viewBox="0 0 24 24" style="stroke:none;fill:currentColor"><path d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"/></svg> Continue with Google</button>
    <div class="row" style="margin:8px 0"><hr class="rule" style="flex:1;margin:0"><span class="small muted">or</span><hr class="rule" style="flex:1;margin:0"></div>
    <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></div>
    <button class="btn primary big" id="e">Email me a sign-in link</button><div class="small muted" id="msg" hidden></div></div>`)
  $('g').onclick = async () => { const { error } = await signInGoogle(); if (error) toast('Google sign-in is not available — use the email link') }
  $('e').onclick = async () => { const email = $('email').value.trim(); if (!email) return $('email').focus(); $('e').disabled = true; const { error } = await signInEmail(email); const m = $('msg'); m.hidden = false; m.textContent = error ? error.message : `Link sent to ${email}. Open it on this device.`; $('e').disabled = false }
}
