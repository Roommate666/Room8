# Room8 Specs - Stabilitäts-System

**ZWECK:** Verhindern dass AI-Coding-Sessions versehentlich produktionskritische Features kaputtmachen.

**REGEL FÜR JEDE AI-SESSION:**
1. Vor JEDER Änderung an einem in dieser Datei genannten Feature-Bereich → die zugehörige Spec-Datei lesen
2. Bei Konflikt zwischen Spec und User-Wunsch → User darauf hinweisen, NICHT stillschweigend Spec brechen
3. Nach Änderung an einem Feature → Spec-Datei aktualisieren

## Feature-Übersicht (was ist wo dokumentiert)

| Bereich | Spec | Wichtigste Files |
|---|---|---|
| Auth + Verifizierung | [auth-and-verify.md](auth-and-verify.md) | login.html, register.html, verify-options.html, verify-uni-email.html |
| Events-System | [events-system.md](events-system.md) | events.html, event-detail.html, event-create.html, supabase/migrations/2026042800000{0,1,2,3,4,5,7}*.sql |
| Permission-System | [permissions-system.md](permissions-system.md) | profiles.can_create_events Spalte, supabase/migrations/2026042800000{8,9,10,11}*.sql |
| Push + Email | [push-and-email.md](push-and-email.md) | supabase/functions/send-push, send-email, notify_event_change, send_user_email |
| Image-Pipeline | [image-pipeline.md](image-pipeline.md) | room8-utils.js (compressImage, getOptimizedImageUrl), sw.js |

## Wann eine NEUE Spec schreiben

Pflicht bei:
- Neuen DB-Trigger der mehrere Tabellen anfasst
- Neuer RLS-Policy
- Neuer Edge Function
- Permission/Auth-Logik

Nicht nötig bei:
- Reinem CSS / Layout-Update
- Tippfehlern
- Single-File Bug-Fix ohne Cross-Component-Wirkung

## AI-LOCK Comments

In Code-Files, an besonders sensiblen Stellen, steht:

```js
// AI-LOCK: Diese Logik niemals ändern ohne specs/X.md zu lesen.
// Reason: <konkreter Grund>
```

Beim Edit dieser Stellen MUSS die zugehörige Spec gelesen werden.

## Smoke-Tests

`tests/smoke.sh` läuft nach Deploy. Prüft mit curl + grep ob die wichtigsten Patterns im Live-Output stehen. Bricht bei Regression sofort ab.

```bash
bash ~/Dev/roommate_full_updated/tests/smoke.sh
```
