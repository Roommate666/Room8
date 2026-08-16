#!/usr/bin/env bash
# Sicheres UniGoat-Deploy — verhindert die Klassiker (SW vergessen, nur 1 Host,
# blind kaputt live). Canary: erst Cloudflare (pages.dev) + Regressions-Check,
# NUR bei gruen dann Vercel (unigoat.de = Produktion).
# Nutzung:  bash tools/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SW=www/sw.js
CUR=$(grep -oE "room8-v[0-9]+" "$SW" | head -1)
NUM=$(echo "$CUR" | grep -oE "[0-9]+")
NEXT="room8-v$((NUM+1))"
echo "==> SW-Cache $CUR -> $NEXT"
sed -i '' "s/$CUR/$NEXT/" "$SW"

echo "==> cap sync (iOS + Android Bundles aktualisieren)"
npx cap sync ios  >/dev/null 2>&1 || echo "   (cap sync ios uebersprungen)"
npx cap sync android >/dev/null 2>&1 || echo "   (cap sync android uebersprungen)"

echo "==> Cloudflare (Canary: unigoat.pages.dev)"
npx wrangler pages deploy www --project-name=unigoat --branch=main 2>&1 | grep -iE "success|complete" | tail -1

echo "==> Regressions-Check gegen Canary..."
if node tools/regression-check.mjs https://unigoat.pages.dev; then
  echo "==> Canary gruen -> Deploy Produktion (Vercel / unigoat.de)"
  ( cd www && npx vercel --prod --yes 2>&1 | grep -iE "ready\." | tail -1 )
  LIVE=$(curl -sL "https://unigoat.de/sw.js" | grep -oE "room8-v[0-9]+" | head -1)
  echo "==> LIVE unigoat.de SW = $LIVE (erwartet $NEXT)"
  [ "$LIVE" = "$NEXT" ] && echo "OK: Deploy komplett + verifiziert." || echo "WARNUNG: SW auf unigoat.de weicht ab — Vercel-Cache abwarten/pruefen."
else
  echo "ROT: REGRESSION fehlgeschlagen — Produktion (unigoat.de) NICHT angefasst."
  echo "   Fix den Fehler, dann erneut. Canary zeigt den kaputten Stand (unigoat.pages.dev)."
  exit 1
fi
