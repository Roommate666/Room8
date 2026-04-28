# Events-System

**Stand:** 2026-04-28
**Status:** PRODUCTION-LIVE

## Was es tut

Events-Feature für Studenten + AStAs + Universitäten. User können sich auf Events anmelden ("going"), bekommen Push/Mail bei Änderungen, melden problematische Events.

## Files in scope

| File | Zweck |
|---|---|
| `supabase/migrations/20260428000000_events_feature.sql` | Tabellen events, event_interests, RLS, Storage Bucket, Trigger |
| `supabase/migrations/20260428000001_event_reports.sql` | Report-System mit Auto-Hide bei 3 Reports |
| `supabase/migrations/20260428000002_event_reports_fixes.sql` | Bypass-Flag + NULL-Filter + FOR UPDATE Lock |
| `supabase/migrations/20260428000003_event_push_notifications.sql` | Push-Trigger bei Cancel/Change |
| `supabase/migrations/20260428000004_event_push_fixes.sql` | Title-Truncate + Past-Skip |
| `supabase/migrations/20260428000005_event_reminders.sql` | Reminder-Function + pg_cron Schedules |
| `supabase/migrations/20260428000007_push_text_umlaut_fix.sql` | "geaendert" → "geändert" Fix |
| `supabase/migrations/20260428000012_email_notifications.sql` | Email-Versand bei Events |
| `www/events.html` | Liste mit Filter |
| `www/event-detail.html` | Detail + Going-Button + Report-Modal |
| `www/event-create.html` | Form mit Permission-Check + Antrag-Fallback |

## Datenmodell (Pflicht-Felder)

### `events`
- `id`, `title`, `description`, `category`, `start_at`, `end_at`, `location`, `address`, `city`
- `organizer_id` (REFERENCES auth.users)
- `organizer_name`, `organizer_type` (student/asta/university/partner/admin)
- `cover_image_path` (Storage)
- `status` (active/cancelled/past/draft) — `draft` = Auto-Hidden via Reports
- `is_official` (admin-only, geschützt durch protect_events_admin_fields)
- `view_count`, `interest_count` (system-only, geschützt)

### `event_interests`
- `event_id`, `user_id`, `status` (going/interested/not_going)
- UNIQUE(event_id, user_id)

### `event_reports`
- `event_id`, `reporter_id`, `reason` (spam/illegal/hate/fake/duplicate/other), `details`
- UNIQUE(event_id, reporter_id) — verhindert Doppel-Reports

### `event_reminders_sent`
- `event_id`, `user_id`, `reminder_type` (24h/1h)
- UNIQUE(event_id, user_id, reminder_type) — Idempotenz für Cron

## Pflicht-Patterns

### 1. Trigger-Pipeline auf `events`

Bei UPDATE auf events feuern (in dieser Reihenfolge):

```
trg_events_admin_protect (BEFORE)   → schützt is_official, view_count, organizer_type
trg_events_updated_at (BEFORE)      → setzt updated_at
trg_event_change_notify (AFTER)     → Push + Mail an "going"-User
```

**KRITISCH:** Der `app.system_update`-Bypass-Flag muss auf `'on'` gesetzt werden bevor System-Updates am events-Status laufen (z.B. Auto-Hide nach 3 Reports). Sonst blockiert protect_events_admin_fields den Update.

### 2. Trigger-Pipeline auf `event_reports`

```
trg_event_reports_auto_hide (AFTER INSERT)
  → COUNT WHERE reporter_id IS NOT NULL  ← KRITISCH (NULL-Filter gegen Manipulation)
  → IF >= 3 AND status='active' → SET status='draft' (mit System-Bypass)
```

### 3. Cron-Schedules (pg_cron)

```sql
SELECT cron.schedule('event-reminders', '*/5 * * * *', 'SELECT public.send_event_reminders()');
SELECT cron.schedule('mark-past-events', '0 * * * *', 'SELECT public.mark_past_events()');
```

`send_event_reminders` checkt 24h±5min und 1h±5min Fenster und nutzt `event_reminders_sent` für Idempotenz.

### 4. RPC `increment_event_view`

`SECURITY DEFINER` weil normaler User per RLS keinen UPDATE auf events.view_count machen darf. Der Frontend-Call muss diese RPC nutzen, NIE direkten UPDATE.

### 5. Past-Event-Skip in notify_event_change

```sql
IF COALESCE(NEW.end_at, NEW.start_at + interval '4 hours') < now() THEN
    RETURN NEW;
END IF;
```

Verhindert sinnlosen Push für "Event vor 5 Tagen wurde abgesagt".

## Frontend-Pflicht

### events.html
- `data-i18n="events_title"` (Underscore, NICHT `events.title` mit Punkt)
- Plus-Icon NUR wenn `can_create_events=true` (siehe permissions-system.md)
- KEIN FAB rechts unten

### event-detail.html
- Report-Modal mit 6 Reasons via RPC `report_event` (nicht direkter Insert in event_reports — RPC validiert + verhindert Self-Report)
- View-Counter via `sb.rpc('increment_event_view')`, nicht direkter UPDATE
- `external_url` MUSS durch `Room8.sanitizeUrl` + Regex `^https?://` (kein javascript:/data: XSS)

### event-create.html
- File-Upload: nur `jpg/jpeg/png/webp/gif` whitelisted (KEIN SVG → XSS-Risiko)
- Datei wird durch `Room8.compressImage` vor Upload komprimiert (1600px max)
- End-Datum-Check: `endAt > startAt` Pflicht
- Storage-Path: `userId + '/' + Date.now() + '.jpg'` (Userid als Prefix für RLS-Owner-Check)

## Tests die NIEMALS brechen dürfen

E2E-Tests gegen Production-DB (siehe Test-Bot Reports vom 28.04.2026):
1. Time-Change Trigger feuert mit Berlin-Timezone-Format
2. Location-Change Trigger feuert
3. Cancel-Trigger feuert + Title wird auf 40 Zeichen gekürzt
4. Past-Event-Skip funktioniert (kein Push für vergangene Events)
5. 3 Reports ohne NULL-User → Auto-Hide auf draft
6. NULL-User-Reports zählen NICHT zur 3er-Schwelle

## Was nicht angefasst werden darf

| Element | Warum |
|---|---|
| `protect_events_admin_fields` Trigger | Schützt is_official + Counter |
| `auto_hide_reported_events` mit FOR UPDATE Lock | Race-Condition-Schutz |
| `notify_event_change` Past-Event-Skip-Logik | Spam-Prevention |
| `events_organizer_read_own` Policy | Organizer sieht draft-Events nach Auto-Hide |
| `view_count`/`interest_count` Schutz im protect-Trigger | System-only Felder |
