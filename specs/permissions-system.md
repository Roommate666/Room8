# Permission-System (Whitelist für Event-Erstellung)

**Stand:** 2026-04-28
**Status:** PRODUCTION-LIVE

## Was es tut

Standardmäßig kann **NIEMAND** Events erstellen — auch nicht verifizierte Studenten. Erst wenn der Admin `profiles.can_create_events = true` setzt, ist der User berechtigt.

Drei Wege zur Erlaubnis:
1. Admin im Admin-Panel direktes Toggle (Tab "Nutzer" → Button "Event-Erlaubnis geben")
2. User stellt Antrag (`event_creator_requests` Tabelle), Admin approved im Tab "Anträge"
3. Admin setzt `trusted_organizer = true` → auto-grant via Trigger

## Files in scope

| File | Zweck |
|---|---|
| `supabase/migrations/20260428000008_event_creator_permissions.sql` | Initial-Setup: Spalte, Tabelle, RLS, Trigger |
| `supabase/migrations/20260428000010_permission_security_fixes.sql` | Privilege-Escalation-Fix in auto_grant + UNIQUE-Race-Fix |
| `supabase/migrations/20260428000011_admin_set_event_creator.sql` | RPC für Direct-Grant |
| `supabase/migrations/20260428000012_email_notifications.sql` | Email-Notifications + Override admin_set_event_creator + admin_review_event_creator_request |
| `www/event-create.html` | Antrag-Form falls keine Permission |
| `www/events.html` | Plus-Icon im Header NUR wenn can_create_events=true |
| `www/admin.html` | "Anträge"-Tab + User-Tab mit Toggle-Buttons |

## Pflicht-Patterns (NICHT BRECHEN)

### 1. Trigger-Reihenfolge auf `profiles`

Reihenfolge ist alphabetisch nach Trigger-Name. Aktuelle Reihenfolge:

```
trg_auto_grant_event_creator     (a)
trg_profiles_protect_can_create  (p_can)
trg_profiles_protect_trusted     (p_trust)
```

**WARUM KRITISCH:** `auto_grant_event_creator` läuft als ERSTES. Er prüft Legitimität (System-Bypass-Flag ODER auth.uid() ist Admin). Wenn nicht legitim → frühe RETURN. Sonst würde User via UPDATE `trusted_organizer=true` sich selbst auf `can_create_events=true` hochstufen, weil `protect_trusted_organizer` erst NACH auto_grant das trusted-Feld zurückrollt — der can_create_events-Wert würde aber bestehen bleiben.

**REGEL:** Bei jeder Änderung an einem dieser drei Trigger: **alle drei zusammen testen**. E2E-Test in der Migration: User ohne Admin/System-Flag versucht UPDATE `trusted_organizer=true` → sowohl trusted als auch can_create müssen `false` bleiben.

### 2. System-Bypass-Flag

```sql
PERFORM set_config('app.system_update', 'on', true);
UPDATE profiles SET ... WHERE ...;
PERFORM set_config('app.system_update', 'off', true);
```

Dieses Pattern wird in **allen Admin-RPCs** genutzt um die protect-Trigger zu umgehen. NIE einen UPDATE auf profiles aus einer Admin-RPC machen ohne diesen Wrapper.

### 3. RLS-Policy `events_creator_insert`

```sql
CREATE POLICY "events_creator_insert" ON public.events
    FOR INSERT WITH CHECK (
        auth.uid() = organizer_id
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND COALESCE(can_create_events, false) = true
        )
    );
```

**NIE durch eine offenere Policy ersetzen.** Wenn die wegfällt, kann jeder Verifizierte wieder Events erstellen.

### 4. Frontend: events.html Plus-Icon

Header zeigt Plus-Icon (id=`headerCreateBtn`) nur wenn `setupPermissionUI()` `canCreate=true` ermittelt. Default `display:none`. Niemals den FAB rechts unten wieder einbauen — Yusuf will den nicht.

### 5. event-create.html Antrag-Form

Wenn `can_create_events=false` aber verifiziert: Antrag-Overlay zeigt sich. Wenn pending Request existiert: Form weg, "Wird geprüft" zeigen. UNIQUE-Constraint auf `(user_id, status='pending')` verhindert Doppel-Antrag.

## Tests die NIEMALS brechen dürfen

```sql
-- Test 1: Untrusted User versucht is_official=true bei INSERT
-- Erwartung: is_official wird auf false zurückgesetzt
-- Trigger: protect_events_admin_fields

-- Test 2: User versucht UPDATE profiles SET trusted_organizer=true (Self-Privilege-Escalation)
-- Erwartung: trusted_organizer=false UND can_create_events=false (beides geblockt)
-- Trigger: auto_grant_event_creator + protect_trusted_organizer

-- Test 3: Admin setzt admin_set_event_creator(target, true)
-- Erwartung: Profile updated + Notification eingefügt + Mail rausgegangen

-- Test 4: User stellt 2x Antrag schnell hintereinander
-- Erwartung: Zweiter blockt mit error='already_pending', kein PostgresError
```

## Was nicht angefasst werden darf

| Datei:Stelle | Warum |
|---|---|
| `auto_grant_event_creator` Function (Migration 10) | Privilege-Escalation-Fix |
| RLS-Policy `events_creator_insert` (Migration 8) | Whitelist-Garantie |
| `app.system_update` Setting-Pattern in allen Admin-RPCs | Trigger-Bypass |
| `events.html` `headerCreateBtn` Default-`display:none` | UX-Anforderung Yusuf |

## Erlaubt zu ändern

- Email-Templates / Notification-Texte
- Banner-Texte falls neu eingebaut
- Neue org_types in CHECK-Constraint
- Admin-UI-Erweiterungen (mehr Filter, mehr Spalten)
