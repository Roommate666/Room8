# Auth + Verifizierung

**Stand:** 2026-04-28
**Status:** PRODUCTION-LIVE

## Was es tut

Supabase Auth mit Email/Password + Google OAuth + Apple Sign-In. Plus optionaler Studenten-Verifizierung über Uni-Mail oder Immatrikulationsbescheinigung.

## Verifizierungs-Wege

| Methode | Spalte | UI |
|---|---|---|
| Uni-Mail (Magic-Link) | `is_verified=true` | verify-uni-email.html |
| Doku-Upload (Imma-Bescheinigung) | `is_student_verified=true` (nach Admin-Approval) | upload.html |

User gilt als "verifiziert" wenn `is_verified = true OR is_student_verified = true`.

## Files in scope

| File | Zweck |
|---|---|
| `www/login.html`, `register.html`, `forgot-password.html`, `update-password.html` | Auth-Flows |
| `www/verify-options.html`, `verify-uni-email.html`, `verification-status.html`, `upload.html` | Verifizierung |
| `www/admin.html` Tab "Verifizierungen" | Admin reviewed Doku-Uploads |

## OAuth-Provider

- **Google:** Client-ID `607481196941-qgklk9ndu4bt8nsodduobv61534l6vh9.apps.googleusercontent.com`
- **Apple:** Service-ID `club.room8.app.web`, Key-ID `W4Y9462SFP`, JWT läuft September 2026 ab

## Pflicht-Patterns

### 1. RLS auf `profiles`

User darf eigenes Profil lesen + die meisten Felder editieren. **Geschützt** durch BEFORE-Trigger:
- `is_admin` — nur Admin
- `trusted_organizer` — nur Admin (trg_profiles_protect_trusted)
- `can_create_events` — System-Bypass oder Admin (trg_profiles_protect_can_create)
- `is_verified`, `is_student_verified` — nur Admin/System

### 2. verify-options.html als Redirect-Target

In allen anderen Pages (Marktplatz, Wohnungen, Events, Chat, etc.) führt ein nicht-verifizierter User-Klick auf einen geschützten Bereich → verify-overlay → `<a href="verify-options.html">`.

**Convention für Verify-Buttons:**
- Standard: blau (#3B82F6 → #2563EB)
- Chat (nachrichten.html, chat.html): rot (#EF4444 → #DC2626) — Yusufs Wunsch

### 3. checkVerification() Pattern

Jede geschützte Page hat eine async `checkVerification()` die:
1. `sb.auth.getUser()` holt
2. profiles.is_verified + is_student_verified prüft
3. Wenn nicht verified → Overlay aktiv
4. Wenn verified → ggf. FAB/Plus-Button anzeigen (war initial display:none)

## Tests die NIEMALS brechen dürfen

```sql
-- Test 1: Unverified User kann KEINE Listings/Events erstellen
-- (RLS-Policy events_creator_insert prüft can_create_events
--  und protect_events_admin_fields prüft is_official)

-- Test 2: User kann eigenes is_verified NICHT auf true setzen
SET LOCAL request.jwt.claim.sub = '<user-id>';
UPDATE profiles SET is_verified = true WHERE id = '<user-id>';
-- Erwartung: trigger blockt ODER RLS blockt
```

## Apple JWT Renewal

**WARNUNG:** Apple OAuth JWT läuft alle 180 Tage ab.
- Letzte Erneuerung: 15.03.2026
- Nächste Erneuerung: **vor 11.09.2026 PFLICHT**
- Sonst: Apple Sign-In bricht für alle iOS-User

Anleitung: Apple Developer → Keys → AuthKey_W4Y9462SFP.p8 → JWT signieren mit jsonwebtoken (Team ID LZ4LV4JQ24, Service ID club.room8.app.web).

## Was nicht angefasst werden darf

| Element | Warum |
|---|---|
| Apple JWT Secret in Supabase Auth | Bricht iOS-Login |
| `is_verified` / `is_student_verified` als Auth-Source-of-Truth | App-Pattern |
| protect_trusted_organizer Trigger (Migration 6) | Self-Privilege-Escalation-Schutz |
