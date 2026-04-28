# Push + Email Notification Pipeline

**Stand:** 2026-04-28
**Status:** PRODUCTION-LIVE

## Was es tut

3-Channel-Notification-System: In-App-Bell, FCM-Push (Native), Email (Resend). Alle drei parallel von DB-Triggern und RPCs aus.

## Files in scope

| File | Zweck |
|---|---|
| `supabase/functions/send-push/index.ts` | FCM v1 API Wrapper (deployed mit `--no-verify-jwt`) |
| `supabase/functions/send-email/index.ts` | Resend Wrapper (deployed mit `--no-verify-jwt`) |
| `supabase/migrations/20260219031000_chat_push_trigger.sql` | Pattern-Vorlage für Chat-Push |
| `supabase/migrations/20260428000003_event_push_notifications.sql` | Event-Push Trigger |
| `supabase/migrations/20260428000012_email_notifications.sql` | Email-Helper + Override Functions |
| `supabase/migrations/20260428000013_notification_logs.sql` | Health-Logging-Tabelle + Health-RPCs + Cleanup-Cron |

## Required Secrets in Supabase

```
RESEND_API_KEY            (vorhanden)
FIREBASE_SERVICE_ACCOUNT  (vorhanden)
FIREBASE_PROJECT_ID       (vorhanden)
SUPABASE_SERVICE_ROLE_KEY (vorhanden)
```

## Pflicht-Patterns

### 1. Edge Function Deploy-Mode

**`send-push` und `send-email` MÜSSEN mit `--no-verify-jwt` deployed sein:**

```bash
npx supabase functions deploy send-push --no-verify-jwt
npx supabase functions deploy send-email --no-verify-jwt
```

DB-Trigger rufen die Functions via `pg_net.http_post` auf — der Authorization-Header dort ist NICHT der service_role_key (sondern current_setting Fallback der oft NULL ist). Mit JWT-Verify würde **jeder Trigger-Call mit 401 fehlschlagen**.

### 2. Helper-Function `send_user_email`

```sql
PERFORM public.send_user_email(target_user_id, subject, html);
```

Nutzt `email_template(headline, body_html, cta_text?, cta_url?)` für einheitliches Branding. Holt `auth.users.email`. Bei NULL-Email: silent skip.

### 3. pg_net.http_post Pattern

```sql
PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('to', email, 'subject', s, 'html', h)
);
```

Im EXCEPTION-Block fangen, nicht propagieren — sonst bricht der ganze DB-Trigger ab und User-Action fühlt sich kaputt an.

### 4. Logging in `notification_logs` (PFLICHT)

Beide Edge Functions (`send-push`, `send-email`) MÜSSEN nach jedem Versuch eine Zeile in `public.notification_logs` schreiben — auch im Fehlerfall.

```ts
await logNotification(supabase, {
  user_id, status, error_code, error_msg, provider_id, title, metadata
})
```

**Status-Werte (CHECK Constraint):**
- `success` — Send erfolgreich
- `no_token` — User hat keinen FCM-Token (push-only)
- `invalid_email` — Recipient failed Regex (email-only)
- `fcm_error` — FCM API gab non-2xx zurück
- `resend_failed` — Resend API gab non-2xx zurück
- `exception` — Try-Catch Fallback

**Best-effort:** Insert-Fehler werden geschluckt (`try/catch` in `logNotification`). Logging darf den Send-Pfad nie blockieren.

**Health-RPCs für Admin:**
- `get_notification_health(hours int)` → channel × success-rate
- `get_notification_failures(hours int)` → top fail-reasons
- Beide `security definer`, prüfen `profiles.is_admin = true`

**Cleanup:** pg_cron `cleanup-notification-logs` läuft nightly um 3 Uhr UTC, löscht Logs > 30 Tage.

**Admin-UI:** `admin.html` → Tab "📡 Push Health" zeigt 24h/7d/30d-Stats + Top-Fehler + letzte 50 Sends.

### 4b. Sentry Capture in Edge Functions (PFLICHT)

Bei `fcm_error`, `resend_failed`, `exception` ZUSAETZLICH zur DB-Log-Zeile auch nach Sentry capturen via:

```ts
import { captureException } from "../_shared/sentry.ts"

captureException(err, {
  function: 'send-push',          // Tag
  user_id: userId,                 // Sentry user.id (DSGVO: keine email)
  tags: { channel: 'push', status: 'fcm_error', error_code: '...' },
  extra: { http_status, fcm_response },
}).catch(() => {})
```

**Best-effort:** `.catch(() => {})` damit Sentry-Outage den Send-Pfad nie blockt.

**Setup:**
- Supabase Secret `SENTRY_DSN` muss gesetzt sein (`npx supabase secrets set SENTRY_DSN=...`)
- Optional `SENTRY_ENV` (default `production`)
- Helper liegt unter `supabase/functions/_shared/sentry.ts`
- KEIN npm-Dependency — direkter POST an Sentry-Envelope-Endpoint
- PII-Filter via `scrubPII()` strippt Email/Bearer/access_token/refresh_token aus Strings

**Sentry-Project:** `room8-web` @ `yumita.sentry.io` (DE-Region)

### 5. notifications-Tabelle für In-App

```sql
INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
VALUES (...);
```

`type`-Konvention: `event_cancelled`, `event_time_changed`, `event_location_changed`, `event_creator_approved`, `event_creator_rejected`, `event_creator_granted`, `event_creator_revoked`, `event_reminder_24h`, `event_reminder_1h`, `chat_message`.

## FROM-Adresse

```
Room8 <noreply@room8.club>
```

`room8.club` ist bei Resend als verifizierte Domain hinterlegt (DKIM/SPF). Nicht ändern ohne Resend-Dashboard-Update.

## Tests die NIEMALS brechen dürfen

```sql
-- Test 1: send-email Function gibt 200 zurück
SELECT public.send_user_email('<admin-uuid>', 'Test', public.email_template('Test', '<p>Hi</p>', NULL, NULL));
-- Verify: SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 1;
-- Erwartung: 200 + {"success":true,"id":"<resend-id>"}

-- Test 2: Event-Cancel triggert in-app + push + email parallel
UPDATE events SET status='cancelled' WHERE id=<test-id>;
-- Verify: notifications hat neue Row, net._http_response hat 2 neue Calls (push + email)
```

## Häufige Fehlerbilder

| Symptom | Ursache | Fix |
|---|---|---|
| 401 UNAUTHORIZED_NO_AUTH_HEADER | Edge Function ohne `--no-verify-jwt` deployed | Re-deploy mit Flag |
| Mail kommt nicht an | Domain nicht in Resend verifiziert | Resend-Dashboard → Domains → DKIM-Records setzen |
| Push kommt nicht an | profiles.fcm_token NULL | User hat App nicht geöffnet → kein Token registriert |
| Mail im Spam | DKIM/SPF fehlen | DNS-Records prüfen |
| Mehrfach-Push | Trigger feuert pro UPDATE-Statement | Single-UPDATE im Frontend nutzen |

## Was nicht angefasst werden darf

| Element | Warum |
|---|---|
| `--no-verify-jwt` Flag bei Function-Deploy | Sonst 401 |
| `EXCEPTION WHEN OTHERS` um pg_net.http_post | Sonst bricht ganzer Trigger |
| `NEW.organizer_id IS NULL OR user_id != NEW.organizer_id` Filter | Organizer soll keine Push für eigenes Event |
| `LEFT(title, 40) + '...'` Title-Truncate | FCM iOS bricht bei ~50 Zeichen ab |
| `Europe/Berlin` Timezone in `to_char` | Deutsche User wollen lokale Zeit |
| `logNotification()` try/catch in Edge Functions | Logging darf Send nicht blockieren |
| `captureException(...).catch(() => {})` Pattern | Sentry-Outage darf Send nicht blockieren |
| `_shared/sentry.ts` PII-Scrubber `scrubPII()` | DSGVO — Email/Tokens niemals an Sentry leaken |
| CHECK-Constraint `notification_logs.status IN (...)` | Frontend-Badges + Filter erwarten exakt diese Werte |
| `get_notification_health` als `security definer` + Admin-Check | RPC ist `to authenticated` granted, ohne Check könnte jeder User Stats lesen |
