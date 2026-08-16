# Kritische Pfade — NIE brechen (vor jeder Aenderung lesen)

**Stand:** 2026-08-16 · Bekannter funktionierender Stand = Git-Tag `v2.4.0-launch`.
Zurueck zum sicheren Stand jederzeit: `git checkout v2.4.0-launch`.

## Pflicht-Ablauf bei JEDER Aenderung
1. Diese Datei + die betroffene `specs/*.md` lesen.
2. Aendern.
3. **Deploy NUR ueber `bash tools/deploy.sh`** — bumpt SW, synct Native, deployt Cloudflare (Canary), faehrt Regressions-Check, und geht NUR bei gruen auf unigoat.de (Produktion).
4. Nie direkt auf beide Hosts pushen ohne den Check.

## AI-LOCK — diese Stellen NUR mit explizitem User-OK aendern
- **`www/game/core.js` MUSS byte-identisch zu `supabase/functions/_shared/goat-core.js` sein.** Bei Aenderung: beide Dateien gleich + `submit-goat-score` neu deployen (sonst Anti-Cheat/Score-Validierung kaputt).
- **`notify_user_push()`** (Migration 14) — einziger sanktionierter Push-Weg aus Triggern. Nicht umbauen.
- **`should_notify()`** — AI-LOCK (Channel-Werte muessen zu notification_settings-Spalten passen). Neue Push-Kanaele inline im Sender gaten, nicht hier.
- **`self_redeem()`** (Geo-Enforce) + **coupon_redemptions** — Einloese-Logik, GPS-Radius. Nicht lockern.
- **Verify-RPCs** `request_uni_code` / `verify_uni_code` / `reset_my_verification` — Verifizierungs-Flow.
- **`reward_pending_referral()`** — Referral +100 Coins + Push bei Verifizierung.
- **appId `club.room8.app`** — NIEMALS aendern (= neue App, Reviews/User weg).

## Muss-funktionieren-Flows (der Regressions-Check prueft genau die)
Login · Coupons-Liste · Coupon-Detail/Einloesen · Game startet · Rangliste · Profil · Einstellungen · Benachrichtigungen · Verifizierung · Support.
Test: `node tools/regression-check.mjs https://unigoat.pages.dev` (Demo-Login redbull-demo@unigoat.de).

## profiles-Regeln (DSGVO/RLS — hart)
- NIE `select('*')` oder `RETURNING *` auf `profiles` (table-SELECT gesperrt -> "permission denied").
- Fremd-Reads: `public_profiles` · Eigen: `my_profile` · Admin: `admin_profiles`.
- `email`-Spalte ist column-level gesperrt fuer authenticated -> Admin liest email nur ueber `admin_profiles`.

## DB-Migrationen — nur additiv
- Nur `add column if not exists`, `create ... if not exists`, `create or replace function`. **KEIN DROP/TRUNCATE/destruktives ALTER ohne explizites User-OK.**
- Vor groesseren DB-Aenderungen: Schema-Restore-Punkt `npx supabase db dump --schema public -f backup-YYYYMMDD.sql`.
- Anwenden: `npx supabase db push` (CLI ist linked). Danach `migration list` pruefen.

## Deploy-Fakten
- Web: `tools/deploy.sh` (Cloudflare unigoat.pages.dev + Vercel unigoat.de). SW-Bump ist im Skript.
- Android-AAB: `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ROOM8_KEYSTORE=/Users/yusufcash/Dev/keys/room8-release.jks ./gradlew bundleRelease` (versionCode vorher hochzaehlen).
- iOS: Xcode Archive (CURRENT_PROJECT_VERSION hochzaehlen, min iOS 15).
