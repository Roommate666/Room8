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
| `supabase/migrations/20260428000014_notification_routing.sql` | notification_settings Tabelle + should_notify() + notify_user_push() + 5 City-Trigger |
| `supabase/migrations/20260428000015_push_safeguards.sql` | Quiet Hours + Rate-Limit + Dedup + In-App-Sync fuer City-Triggers |
| `supabase/migrations/20260428000016_admin_alerts.sql` | send_admin_alert() + 6 Trigger fuer Reports/Registrations/Verif/Partner/EventReq/Contact |

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

### 2b. notify_user_push() ist der EINZIGE Push-Send-Weg aus Triggern (PFLICHT)

**Niemals** direkt `pg_net.http_post` zu `send-push` aus einem neuen Trigger schicken. Stattdessen IMMER:

```sql
PERFORM public.notify_user_push(
    p_user_id   := <recipient>,
    p_channel   := '<chat_message|saved_search_match|new_listing_city|new_job_city|new_coupon_city|new_event_city|...>',
    p_title     := 'Push-Titel',
    p_body      := 'Push-Body',
    p_data      := jsonb_build_object('url', '<deeplink>', ...)
);
```

`notify_user_push` ruft intern `should_notify(user_id, channel)` auf — wenn der User den Toggle deaktiviert hat, wird KEIN Push gesendet. So bleibt das User-Opt-Out wirksam.

**should_notify() default ist TRUE** wenn der User keinen `notification_settings`-Eintrag hat. Erst nach aktivem Deaktivieren wird FALSE. Das ist DSGVO-OK weil User explizit Push-Permission im OS gibt.

### 2c. Push-Safeguards (Quiet Hours / Rate-Limit / Dedup)

**should_notify()** prueft (in dieser Reihenfolge):

1. **Toggle** in `notification_settings` (z.B. `new_event_city = true`)
2. **Quiet Hours** — wenn aktiviert und aktuelle Zeit im Window: kein Push
   - default 22:00–08:00 in `Europe/Berlin`
   - Wrap-around-Logik (start > end → ueber Mitternacht)
   - **Ausnahme: `chat_message`** — 1:1 Konversation, immer durchgelassen
3. **Rate-Limit** — max 5 Push pro `(user, channel)` pro Stunde
   - liest `notification_logs.metadata.channel_key`
   - **Ausnahme: `chat_message`** — keine Drosselung
4. **Dedup** (in `notify_user_push`, nicht should_notify) — gleiche `ref_id` in 60 Min: skip
   - verhindert dass `saved_search_match` + `new_listing_city` beide pushen fuer dasselbe Listing

**ref_id-Konvention:** `<table>:<uuid>` z.B. `event:abc-123`, `listing:xyz-789`.

**channel_key-Pflicht:** Jeder `notify_user_push`-Call schreibt automatisch `channel_key` ins data-Payload — Edge Function `send-push` extrahiert es und schreibt `notification_logs.metadata.channel_key` + `notification_logs.ref_id`. Sonst funktionieren Rate-Limit + Dedup nicht.

### 2d. Admin-Email-Alerts

`send_admin_alert(subject, body_html, cta_url?, subject_type?)` schickt Email an alle `profiles.is_admin = true`. Subject bekommt `[Room8 Admin] ` Prefix.

**Rate-Limit:** max 10 Mails pro `subject_type` pro Stunde — verhindert Mass-Spam wenn Bot 1000 Reports schickt.

**Trigger-Map:**
| Tabelle | subject_type | Inhalt |
|---|---|---|
| `reports` | `report` | Reporter-Name, Reason, Reported-Type/-ID |
| `profiles` (INSERT) | `registration` | Username, Name, Email, Stadt, User-ID |
| `verifications` | `verification` | User + Hinweis (Trigger nur wenn Tabelle existiert) |
| `partner_submissions` | `partner_submission` | Generischer Hinweis |
| `event_creator_requests` | `event_request` | User + Organisation |
| `contact_messages` | `contact_message` | Name, Email, Kategorie, Nachricht |

**send-email Edge Function:** Liest optional `data.admin_alert_type` aus Request-Body und schreibt es in `notification_logs.metadata.admin_alert_type` — sonst greift Rate-Limit nicht.

**Empfaenger-Aufloesung (PFLICHT-CTE-Pattern):** `send_admin_alert` sammelt Recipients aus 2 Quellen: `auth.users.email` aller `is_admin` Profile + `notification_settings.extra_email_recipients` text[] der gleichen Profile. CTE-Variable `admin_ids` enthaelt **nur** `id` (NICHT `user_id`). Beim JOIN gegen `notification_settings` deshalb `a.id = ns.user_id` benutzen — `a.user_id` existiert nicht und wirft "column a.user_id does not exist" zur Runtime, was Trigger-Catches schlucken. Migration `20260428000028` ist die korrekte Version.

**Defensive Trigger-Logging (PFLICHT):** Alle `alert_admin_*` Trigger-Functions MUESSEN ihren `exception when others then` Handler an `public.log_trigger_exception(trigger_name, sqlerrm)` koppeln. Sonst gehen Bugs in `send_admin_alert` (oder den Triggern selbst) komplett unter — Insert laeuft durch, kein Mail, kein Log, blind. Mit dem Helper landen Bugs als `status='exception'` Eintrag im Push Health Tab + Health-Check Workflow.

**RLS auf `contact_messages`:** Anon-Submits via Form gehen NICHT direkt per `.insert()` — PostgREST setzt `Prefer: return=representation` was einen SELECT-after-INSERT triggert. SELECT ist Admin-only → 42501. Stattdessen `submit_contact_message(name, email, category, message)` RPC nutzen (security definer, anon-callable). Migration `20260428000025`.

### 2e. City-Match-Trigger (LISTINGS / JOBS / COUPONS / EVENTS)

Bei jedem INSERT in `listings`, `jobs`, `coupons`, `events` feuert ein Trigger der Push an alle User in derselben Stadt sendet (sofern Toggle an).

**City-Quellen:**
| Tabelle | Spalte | Owner-Spalte |
|---|---|---|
| listings | `city` | `owner_id` |
| jobs | `location` | `owner_id` |
| coupons | `city` | `user_id` |
| events | `city` | `organizer_id` |

**Match-Logik:** `lower(profiles.city) = lower(NEW.city)` — case-insensitive Exact-Match. Kein partial-match (sonst wuerde "Berlin" auf "Berlin-Mitte" matchen).

**Owner-Exclusion:** Owner kriegt keinen Push fuer eigenes Inserat.

**Status-Filter:** Events nur wenn `status = 'active'` (drafts triggern keinen Push).

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
| Admin-Mail kommt nicht an + KEIN Log | Trigger-Function wirft Exception, swallowed sie still (`raise warning; return NEW`) | `log_trigger_exception()` im Catch nutzen — Migration 20260428000030 |
| Cross-Domain Spam-Filter (Resend → Zoho/iCloud) | FROM-Domain != Recipient-Domain → Provider-Spam-Score hoch trotz DKIM | Recipient-Mailbox auf gleicher Domain wie FROM bevorzugen, oder `noreply@<recipient-domain>` Setup |
| anon Form-Insert wirft 42501 trotz Policy | PostgREST `Prefer: return=representation` triggert SELECT-after-INSERT | RPC mit security definer (z.B. `submit_contact_message`) statt direktem `.insert()` |

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
| `notify_user_push()` als einziger Push-Send-Weg | Sonst werden Toggle-Praeferenzen umgangen → DSGVO + Vertrauensbruch |
| `should_notify()` default TRUE | Neue User kriegen Push, Opt-Out ist explizit |
| Owner-Exclusion in City-Triggern | Owner kriegt nicht "Neuer Job in X" wenn er den Job selbst gepostet hat |
| Case-insensitive EXACT city-match (`=` nicht `LIKE %`) | "Ulm" soll nicht "Ulmbach" matchen |
| Quiet Hours bypass NUR fuer `chat_message` | 1:1-Chat ist Echtzeit-Erwartung, alles andere kann warten |
| Rate-Limit 5/h pro `(user, channel)` | Verhindert Spam bei Mass-Insert (50 Coupons → max 5 Pushes) |
| ref_id Format `<table>:<uuid>` | Eindeutiger Dedup-Key, listing-Match gegen saved-search-Match |
| send-push extrahiert `channel_key` + `ref_id` aus data | Sonst greifen Rate-Limit + Dedup nicht (Top-Level-Felder in notification_logs) |
| `send_admin_alert()` als einziger Weg fuer Admin-Mails | Sonst kein Rate-Limit, einzelne Trigger koennen Inbox fluten |
| send-email extrahiert `data.admin_alert_type` | Sonst greift `send_admin_alert` Rate-Limit nicht |
| Admin-Trigger im EXCEPTION-Block | Wenn Mail-Send abkackt, soll User-Action (Report etc.) trotzdem durchgehen |
| `log_trigger_exception()` Aufruf im Catch jedes alert_admin_* Triggers | Sonst sind Bugs in send_admin_alert komplett unsichtbar (siehe 30.04.2026 Postmortem) |
| `send_admin_alert` JOIN `a.id = ns.user_id` (NICHT `a.user_id`) | admin_ids CTE hat nur `id`-Spalte → Runtime-Crash, swallowed |
| CHECK-Constraint `notification_logs.status IN (...)` | Frontend-Badges + Filter erwarten exakt diese Werte |
| `get_notification_health` als `security definer` + Admin-Check | RPC ist `to authenticated` granted, ohne Check könnte jeder User Stats lesen |
