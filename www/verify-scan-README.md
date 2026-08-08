# KI-Immatrikulations-Scan (verify-enrollment)

Studierende laden ein Foto ihrer Immatrikulationsbescheinigung hoch. Claude Vision liest
Hochschule, Name, Semester und Gueltigkeit (Enddatum) aus. Liegt das Enddatum in der Zukunft,
wird das eigene Profil auf `is_student_verified = true` gesetzt und `university` gespeichert.

## Neue Dateien

| Datei | Zweck |
|---|---|
| `supabase/functions/verify-enrollment/index.ts` | Edge Function: JWT-Check, Claude Vision, Service-Role-Update des eigenen Profils |
| `www/verify-scan.html` | Self-contained Upload-UI (Kamera/Datei, Vorschau, DSGVO-Einwilligung) |
| `supabase/migrations/20260612000006_enrollment_scan.sql` | Additive Spalten `enrollment_verified_at`, `enrollment_valid_until` |
| `www/verify-scan-README.md` | Diese Datei |

## Deploy-Schritte

### 1. Secret setzen (einmalig)
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase automatisch bereit.

### 2. Migration anwenden
```bash
npx supabase db push
```
Additiv (`add column if not exists`), droppt nichts.

### 3. Edge Function deployen — MIT JWT-Pruefung
```bash
npx supabase functions deploy verify-enrollment
```
WICHTIG: NICHT `--no-verify-jwt`. Nur eingeloggte Nutzer duerfen aufrufen; der User
wird aus dem Bearer-JWT ermittelt und das Profil-Update ist hart auf `auth.uid()`
beschraenkt (per Service Role, `.eq('id', userId)`).

### 4. Web deployen
```bash
cd www && npx vercel --prod --yes
```
Seite danach unter `https://www.room8.club/verify-scan.html` erreichbar.

## DSGVO-Hinweise (wichtig)

- **Das Foto wird NICHT gespeichert.** Es wird nur fluechtig im RAM der Function verarbeitet
  und zur reinen Text-Extraktion an die Anthropic-API geschickt. Kein DB-Insert, kein Storage,
  kein Log des Bildes. Nach dem Request ist es weg.
- **Datensparsamkeit:** Der Klartext-Name wird bewusst NICHT persistiert (nur zur Anzeige
  zurueckgegeben). Gespeichert werden ausschliesslich `university`, `enrollment_verified_at`,
  `enrollment_valid_until` sowie die Flags `is_student_verified` / `is_student`.
- **Einwilligung:** Die UI erzwingt eine aktive Checkbox vor dem Upload. Ohne Zustimmung
  ist der Prüfen-Button deaktiviert. Clientseitig wird das Bild nach der Antwort ebenfalls
  aus dem Speicher geworfen.
- **Auftragsverarbeitung:** Anthropic ist Sub-Auftragsverarbeiter fuer die Text-Erkennung.
  Vor Livegang in Datenschutzerklaerung / AVV aufnehmen.

## Verhalten / Rueckgabe

Rueckgabe-Objekt: `{ ok, verified, university, valid_until, name?, reason }`

- `verified = true` nur wenn: Dokument erkannt UND Hochschule erkannt UND Gueltigkeitsdatum
  erkannt UND Enddatum in der Zukunft.
- Bei jedem Fehlschlag liefert `reason` einen menschenlesbaren Grund (abgelaufen, nicht
  erkannt, kein Bild, zu gross, ...).

## Test (manuell)

1. Eingeloggt `verify-scan.html` oeffnen (ohne Login erscheint der Hinweis zum Einloggen).
2. Foto einer gueltigen Bescheinigung waehlen -> Vorschau erscheint.
3. Einwilligung setzen -> Button aktiv -> "Bescheinigung prüfen".
4. Erwartung gueltig: gruener Erfolg + Hochschule + "Gültig bis". Profil-Flag gesetzt:
   ```sql
   select is_student_verified, university, enrollment_valid_until
   from profiles where id = auth.uid();
   ```
5. Abgelaufene/fremde Dokumente -> roter Hinweis, kein Flag gesetzt.

## Hinweise fuer den Haupt-Entwickler (Integration)

- Verlinkung z.B. aus dem Profil/Verifizierungs-Flow (`specs/auth-and-verify.md`).
- `sentry-init.js` ist bereits als erste `<head>`-Zeile eingebunden (CLAUDE.md-Regel).
- Modell in der Function: `claude-3-5-sonnet-20241022` (Vision-faehig). Bei Modellwechsel
  Konstante `ANTHROPIC_MODEL` anpassen.
- Optional spaeter: Rate-Limit pro User (z.B. max. N Versuche/Tag) ergaenzen.
