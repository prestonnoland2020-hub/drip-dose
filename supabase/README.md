# POR backend

Supabase project: `mtkmopywwyyvglbuybph`

## Tables
| Table | What it holds |
|---|---|
| `profiles` | One row per user. `plan`, `scans_used`, `scan_limit` gate scanning; `stripe_customer_id` is reserved for later billing. |
| `coffees` | Shared cache of scanned coffees, keyed on `slug` (`roaster|name` from the label). Never key on an image hash — every photo differs. |
| `scans` | Per-user scan history. |
| `roaster_calibration` | How much a roaster's stated roast differs from reality. `shift: +1` = one step darker than the bag claims. Starbucks and Peet's are seeded at +1. |

Row-level security is on for all four. `coffees` and `roaster_calibration` are
readable by any signed-in user; writes happen only through the edge function,
which uses the service role.

## Edge function: `scan-bag`
Reads a photo of a bag and returns a recipe. Order of operations is deliberate:
identity and quota are checked first (free), the model is called last (costs money).

### Secrets
| Name | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | one of these | Preferred if both are set. |
| `ANTHROPIC_API_KEY` | one of these | |
| `SCAN_MODEL` | no | Defaults to `gpt-4o-mini` (OpenAI) or `claude-sonnet-4-5` (Anthropic). |

Without a key the function returns `503 not_configured` and the app says
"scanning is not switched on yet" rather than failing oddly.

### Why labels, not beans
Origin and varietal cannot be identified from a photo of loose beans. Published
models that claim high accuracy use standardised lab prep and controlled lighting,
and colour-based ones tend to learn the roast rather than the bean. The prompt
explicitly forbids guessing these — a confident wrong answer is worse than a null,
because someone brews to it.

## Deploying
The function is deployed via the Supabase MCP/dashboard. This file is the source
of truth for the code; keep them in step.

## Recipe logic tests

The recipe derivation (`functions/scan-bag/recipe.ts`) is pure and has unit tests:

```sh
cd supabase/functions/scan-bag
npx esbuild recipe.ts --format=esm --outfile=test/recipe.mjs
node --test test/recipe.test.mjs
```

Vision model choice is measured, not guessed: on a real bag with a Light↔Dark roast
scale, `gpt-4.1` read it correctly 12/12 times; `gpt-4o` 9/12. The function defaults
to `gpt-4.1` and falls back through `gpt-4o` and `gpt-4.1-mini`.
