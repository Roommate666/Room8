# Room8 App - Studenten-Plattform

## STABILITAETS-REGEL (PFLICHT, NIEMALS BRECHEN)

**VOR JEDER Aenderung an einem dieser Bereiche:** zugehoerige Spec-Datei lesen.

| Bereich | Spec |
|---|---|
| Permission-System (`can_create_events`, `trusted_organizer`) | `specs/permissions-system.md` |
| Events-Tabellen, -Trigger, -RPCs | `specs/events-system.md` |
| Push-Notifications + Email-Pipeline | `specs/push-and-email.md` |
| Image-Compression + Transform + SW-Cache | `specs/image-pipeline.md` |
| Auth + Verifizierungs-Flow | `specs/auth-and-verify.md` |

Uebersicht: `specs/00-INDEX.md` — IMMER zuerst lesen wenn Aenderungen geplant sind.

**AI-LOCK Comments im Code:** Stellen mit `// AI-LOCK:` oder `-- AI-LOCK:` duerfen NUR mit explizitem User-OK geaendert werden. Bei Aenderung an gelockter Stelle: Spec lesen, User fragen, dann erst editieren.

**Smoke-Tests:** Nach Deploy: `bash tests/smoke.sh` — bricht bei Regression sofort ab.

**CI-Watchdogs (GitHub Actions):**
- `.github/workflows/smoke.yml` — laeuft alle 6h gegen Live, bei push auf main
- `.github/workflows/health-check.yml` — taeglich 06:00 UTC, prueft notification_logs Success-Rate (>= 90%, mit MIN_SAMPLE=5 gegen Fehlalarm)
- `.github/workflows/email-watchdog.yml` — taeglich 06:30 UTC, aktiver Test: feuert daily_health_check RPC, prueft 30s spaeter ob success-Log existiert. Bei Fail: Pipeline tot → GitHub mailt direkt
- Setup: `SUPABASE_SERVICE_ROLE_KEY` als Repo-Secret hinterlegen

**Git-Hooks:** Lokal aktivieren mit `bash tools/install-hooks.sh` (pre-commit blockt Umlaute in Code + Sync-Drift root↔www).

**Sentry Error Monitoring (Project: room8-web @ yumita.sentry.io):**
- `sentry-init.js` im Repo-Root (+ www/) wird in alle HTML-Pages via `<script src="sentry-init.js">` direkt nach `<head>` geladen
- Beim Hinzufuegen neuer HTML-Pages: `<script src="sentry-init.js"></script>` als ALLERERSTE Zeile im `<head>` — sonst werden frueh-Errors nicht captured
- Konfig in sentry-init.js: `tracesSampleRate: 0`, `replaysSessionSampleRate: 0` (Free-Tier 5k Errors/Monat schonen, kein Tracing)
- PII-Filter via `beforeSend`: Email/access_token/refresh_token werden gestrippt
- Manuelles Reporting aus App-Code: `window.Room8Sentry.captureException(err)` oder `captureMessage(msg)`
- DSN ist im Loader-Script eingebettet — bei Rotation sentry-init.js Loader-URL anpassen

## Sprache & Arbeitsweise
- Auf Deutsch antworten, Code-Kommentare Deutsch (ae/oe/ue statt Umlaute)
- Kein Framework - reines HTML/CSS/JS mit Capacitor
- Dateien in Root UND www/ muessen synchron gehalten werden
- Nach Aenderungen: `cd www && npx vercel --prod --yes` fuer Web-Deploy
- Yusuf arbeitet auf Windows UND Mac parallel (USB-Stick Sync)

## Tech-Stack
- Capacitor 7.x (Android + iOS + Web)
- Supabase Backend (tvnvmogaqmduzcycmvby.supabase.co)
- Firebase Cloud Messaging (FCM v1, Projekt room8-d1867)
- Vercel (www.room8.club)
- Bilingual DE/EN (translations.js + Room8i18n.t())

## App-Info
- Package: club.room8.app
- Android: v1.6.1 (versionCode 34)
- Signing Key: C:\Dev\keys\room8-release.jks

## Wichtige Dateien
- config.js - Supabase URL + Keys + Navigation Config
- translations.js - Alle DE/EN Uebersetzungen (2666 Zeilen)
- navigation.js - Bottom Tab Bar
- push-logic.js - Push Notification Service (FCM Token)
- room8-ui.js + room8-utils.js - Shared UI + Utilities
- supabaseClient.js - Supabase Client Init

## Android
- android/app/src/main/java/club/room8/app/MainActivity.java - Push URL Handler
- android/app/src/main/java/club/room8/app/Room8MessagingService.java - FCM Service
- android/app/src/main/java/club/room8/app/BadgePlugin.java - App Badge

## Supabase Edge Functions
- send-push/ - FCM Push Notifications senden (deployed mit --no-verify-jwt)
- send-notification/ - In-App Notifications
- get-signed-url/ - Storage URLs generieren
- send-email/ - Resend Email-Wrapper (deployed mit --no-verify-jwt)

## Aktuelle Migrations-Zaehler (Stand 10.05.2026)
Letzte Migration: `20260510000001_favorite_push_trigger.sql`. Naechste als `20260511000001_*.sql` benennen.

## App-Versionen (Stand 10.05.2026)
- Android: v2.1.8 (versionCode 44)
- Service Worker: room8-v37 (haeufige Bumps wegen i18n-Cache-Bust)
- iOS: Cap-Sync done (10.05.), Xcode-Build/App Store Upload offen

## Build-Befehle
```bash
# Web deploy
cd www && npx vercel --prod --yes

# Android Debug
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
cd android && ./gradlew assembleDebug

# Android Release
cd android && ./gradlew bundleRelease

# APK installieren
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Supabase Migration
npx supabase db push

# Edge Function Deploy — IMMER --no-verify-jwt!
# send-push, send-email, get-signed-url werden von DB-Triggern via pg_net.http_post
# aufgerufen. pg_net schickt nur x-internal-secret Header, KEIN Authorization Bearer.
# Ohne --no-verify-jwt blockt die Supabase Gateway den Call mit 401
# UNAUTHORIZED_NO_AUTH_HEADER und die ganze Push/Mail-Pipeline ist tot.
npx supabase functions deploy send-push --no-verify-jwt
npx supabase functions deploy send-email --no-verify-jwt
npx supabase functions deploy get-signed-url --no-verify-jwt
```

## Features (Seiten)
- Wohnungen (wohnungen.html, wohnung.html, upload.html)
- Marktplatz (gegenstaende.html, gegenstand.html)
- Jobs (jobs.html, job-create.html, job-detail.html)
- Coupons (coupons.html, coupon-create.html, coupon-detail.html)
- Chat (nachrichten.html, chat.html) - getrennt pro Inserat via listing_id
- Profil, Verifizierung, Admin, Partner-Bereich
- Push Notifications (FCM v1 API)

## Bekannte Eigenheiten
- Push-Token: PushService.saveTokenToSupabase() im registration Handler
- Email-Duplikat: user.identities leer = bereits registriert
- Chat-Trennung: loadMessages/subscribeToMessages filtern nach listing_id
- Android Background Push: Firebase 'url' Key als Fallback
- iOS fcmToken: Custom Event nur 1x beim App-Start
- RLS: anon key kann profiles nicht abfragen
