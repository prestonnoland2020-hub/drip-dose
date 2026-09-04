# Drip Dose

A single-file pour-over coffee app: recipe calculator, step-by-step brew timer, and a live caffeine extraction curve — all on one screen.

**Live:** open `index.html` in any browser (no build, no dependencies). Also deployed via GitHub Pages once enabled.

## What it does
- **Recipe** — enter the coffee dose in grams; water targets for bloom, each pour and drawdown recalculate instantly. Ratio slider, Arabica/Robusta toggle, and six brew methods (V60, Chemex, Kalita Wave, AeroPress, French Press, Clever).
- **Brew timer** — Start brew runs the countdown, highlights the active stage, turns copper (with a chime and vibration) when it's time to pour, and shows the live cumulative scale target so you can pace each pour.
- **Caffeine extraction** — `C(t) = C_dry · E_max · (1 − e^(−kt))`, rendered live as a curve with pour bands and a hover tooltip. Arabica ≈ 12 mg/g, Robusta ≈ 22 mg/g; k and E_max vary by method (percolation vs immersion).
- **Result card** — caffeine in the cup, extraction %, water, brew time, espresso/daily-guideline equivalents, and *Brew again*. Recent brews are kept in the browser.

Keyboard: `Space` starts/pauses, `Esc` closes the result card. Keeps the screen awake while brewing on browsers that support the Wake Lock API.

Built with plain HTML, CSS and JavaScript in one file. Fonts from Google Fonts (falls back to system fonts offline).
