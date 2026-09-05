#!/usr/bin/env bash
# Stamp a build id into the service worker and regenerate the server copies of shared modules.
set -euo pipefail
cd "$(dirname "$0")"
BUILD=$(date +%Y%m%d%H%M%S)
FILES=$(printf "'./%s'," index.html styles.css manifest.webmanifest logo.svg icon-192.png $(find src -name '*.js' ! -name 'mock.js' | sort))
sed -e "s/__BUILD__/$BUILD/" -e "s|__SHELL__|${FILES%,}|" sw.src.js > sw.js
# server copies (Deno wants .ts and explicit types on the exported functions)
for fn in recommend; do
  sed 's/^\/\/ POR — brewing method registry/\/\/ POR — brewing method registry (server copy; generated from src\/methods.js — edit that, then run build.sh)/; s/^export const METHODS = \[/export const METHODS: any[] = [/; s/^export const ICON = {/export const ICON: Record<string,string> = {/; s/^export const byId = id =>/export const byId = (id: string) =>/; s/^const round5 = g =>/const round5 = (g: number) =>/' src/methods.js > supabase/functions/$fn/methods.ts
  sed 's/^export function nextTime(feedback, last = {})/export function nextTime(feedback: string[], last: any = {})/; s/^const RULES = {/const RULES: Record<string, any> = {/' src/feedback.js > supabase/functions/$fn/feedback.ts
done
cp supabase/functions/scan-bag/recipe.ts supabase/functions/recommend/recipe.ts 2>/dev/null || true
echo "built $BUILD"
