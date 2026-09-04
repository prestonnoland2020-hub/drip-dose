# POR

A single-file pour-over coffee app: recipe calculator, step-by-step brew timer, and a live caffeine extraction curve — all on one screen, built mobile-first.

**Live:** https://prestonnoland2020-hub.github.io/drip-dose/

Add POR to your phone's home screen (iPhone: Share → Add to Home Screen. Android: ⋮ → Install app) and it runs full-screen, works offline, and updates itself whenever this repo changes.

## What it does

- **Recipe** — enter the coffee dose in grams; water targets for bloom, each pour and drawdown recalculate instantly. Quick-pick doses, a ratio slider, Arabica/Robusta, roast level, and six brew methods (V60, Chemex, Kalita Wave, AeroPress, French Press, Clever).
- **Water temperature** — recommended kettle temp in °C and °F from the roast level (light 96 °C, medium 93 °C, dark 88 °C), which also feeds the extraction model.
- **Brew timer** — highlights the active stage, turns copper with a chime and vibration when it's time to pour, and shows the live cumulative scale target so you can pace each pour. A sticky bottom bar keeps the clock and cue in reach while you scroll.
- **Caffeine extraction** — `C(t) = C_dry · E_max · (1 − e^(−kt))`, drawn live with pour bands and a hover tooltip. Arabica ≈ 12 mg/g, Robusta ≈ 22 mg/g; k and E_max vary by method and roast.
- **Result card** — caffeine in the cup, extraction %, espresso and daily-guideline equivalents, a predicted flavor profile, and a taste-feedback loop (sour, bitter, weak, strong) that tunes temperature, time and ratio for your next brew.

Keyboard: `Space` starts/pauses, `Esc` closes the result card.

## Files

`index.html` is the whole app — no build step, no dependencies. `sw.js` is the service worker (offline + auto-update), `manifest.webmanifest` and the icons make it installable.

Built with plain HTML, CSS and JavaScript. Fonts come from Google Fonts and fall back to system fonts offline.
