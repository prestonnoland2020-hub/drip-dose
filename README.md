# POR

Scan a bag of coffee → POR understands it → recommends how to brew it → guides the brew → you rate the cup → the community and the recommendation engine learn from it.

Live: https://prestonnoland2020-hub.github.io/drip-dose/

## Layout

```
index.html            app shell, five tabs
styles.css            design system (linen / oak / sand / forest / dark grey)
src/app.js            hash router
src/methods.js        every brewing method: ratios, grind, guided steps   ← add a brewer here
src/feedback.js       "how was it?" → the ONE change for next time
src/calc.js           ratio, scaling, TDS → extraction
src/timer.js          wall-clock brew timer engine
src/api/*.js          Supabase reads/writes (coffees, brews, social, library, profile)
src/views/*.js        one file per screen
supabase/functions/   scan-bag (label → coffee), recommend (coffee + you + community → recipe), barista
```

No build step. Plain ES modules served by GitHub Pages. `./build.sh` only stamps the
service-worker cache id and regenerates the server copies of `methods.js` / `feedback.js`.

Every brew is a structured row (dose, water, ratio, temp, grind, time, rating,
five taste dimensions, feedback chips, what the engine recommended, what you changed)
— never just a post. That is the data the recommendations get better on.

## Local

```
python3 -m http.server 8765
open http://localhost:8765/?mock=1      # fixtures, no backend
```
