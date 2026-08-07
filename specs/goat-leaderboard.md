# Goat Blast — Online-Rangliste & Preisgeld (Architektur, 08.08.2026)

## Entscheidungen (Yusuf, 08.08.)
- **Identitaet:** nur eingeloggte Room8-Nutzer (Score an Account gebunden -> Gewinner erreichbar, Anti-Cheat, App-Wachstum).
- **Umfang:** globales Board UND Board pro Uni (`profiles.university` existiert bereits).

## Kern-Prinzip: Client-Scores sind wertlos
`window.__gb` kann den Score im Browser beliebig setzen. Darum:
- **Kein direkter Client-Insert.** RLS sperrt Writes auf `goat_scores` fuer anon/authenticated.
- **Einzige Schreibstelle = Edge Function `submit-goat-score`** (Service Role), an das Bearer-JWT gebunden.

## Zwei Stufen der Score-Gueltigkeit
| Flag | Bedeutung | Wofuer |
|---|---|---|
| `verified` | Basis-Plausipruefung bestanden (Dauer, Punkte/Linie) | Anzeige im Board |
| `replay_validated` | Server hat Runde per Seed+Zuege nachgerechnet | **Preisgeld-Berechtigung** |

**Preisgeld wird NUR gegen `replay_validated = true` ausgezahlt.** Bis Phase 2 fertig ist: Board = sozial/Spass, KEIN echtes Geld.

## Phase 1 — Online-Board (jetzt gebaut, noch nicht deployed)
- Migration `supabase/migrations/20260612000002_goat_scores.sql`: Tabelle + RLS + View `goat_leaderboard` (join public_profiles fuer username/university).
- Edge Function `supabase/functions/submit-goat-score/index.ts`: JWT-User, Plausi -> verified, Insert via Service Role, gibt Rang zurueck.
- OFFEN Client-Wiring: Spiel laedt supabase-Client, submitted bei Game Over, Board liest `goat_leaderboard` (Tabs Global / Meine Uni / Daily). Faellt ohne Login/offline auf lokales Board zurueck.

### Deploy (durch Yusuf oder mit OK):
```
cd ~/Dev/roommate_full_updated
npx supabase db push
npx supabase functions deploy submit-goat-score   # MIT jwt-Pruefung, NICHT --no-verify-jwt
```
Danach End-to-End testen (eingeloggt Score submitten -> Board zeigt Eintrag).

## Phase 2 — Anti-Cheat per Replay (Pflicht vor echtem Preisgeld)
1. **Deterministischer Core** (`www/game/core.js`, Phaser-/DOM-frei): Grid, Piece-Gen aus Seed
   (mulberry32), Placement, Clears, Scoring — reine Funktionen, gleiches Ergebnis in Browser + Deno.
2. **High-Mode Seed festschreiben:** aktuell zufaellig (`Math.random`), muss aus einem gespeicherten
   Seed kommen, damit die Runde reproduzierbar ist.
3. **Input-Log:** Spiel zeichnet jede Aktion auf (Stein-Index + Zielzelle + Reihenfolge).
4. **Submit** schickt {seed, inputs}. Edge Function importiert core.js, simuliert die Zug-Sequenz,
   berechnet den Score selbst. Nur wenn Server-Score == Client-Score -> `replay_validated=true`.
5. Zusaetzlich: Rate-Limit pro User/Tag, Max-Score-Sanity, Ausreisser-Report.

## Phase 3 — Preisgeld-Zyklus
- Woechentlicher Reset (Cron/Edge): Top-Scorer je Uni + global der Woche ermitteln (nur replay_validated).
- Gewinn = Campus-Coupon / Sachpreis (kein Bargeld-Einsatz -> Skill-Wettbewerb, kein Gluecksspiel).
- **Recht:** klare Teilnahmebedingungen (kein Einsatz, Skill-basiert, seeded Daily fuer Fairness).
  Preisgeld-Aktion vorab juristisch gegenchecken (Gewinnspiel-/UWG-Regeln DE).

## Status
- [x] Migration geschrieben + **DEPLOYED** (goat_scores + View live, RLS greift)
- [x] Edge Function geschrieben + **DEPLOYED** (submit-goat-score, 401 ohne Login verifiziert)
- [x] **Phase 2 Fundament: core.js (deterministisch) + replay() + Test 84/84 OK**
- [x] **Spiel (index.html) auf core.js umgestellt** (Single Source of Truth). Verifiziert: Live-Spiel
      spielt fehlerfrei, recorded moveLog replayt exakt zum Live-Score (344==344), Optik ok, 0 Fehler.
- [ ] Client-Wiring: Submit (seed+Zuege+Zeit) bei Game Over an submit-goat-score + Online-Board-Tabs (Global/Uni/Daily)
- [ ] Edge Function: core.js importieren + replay -> replay_validated=true bei Score-Match
- [ ] End-to-End-Test (eingeloggt Score submitten -> Board)
- [ ] Phase 3 Preisgeld-Zyklus + Recht

### Deployed am 08.08. (durch Claude, mit Yusuf-OK)
`npx supabase db push` (Migration 20260612000002) + `npx supabase functions deploy submit-goat-score`.
Verifiziert: Function 401 ohne/mit-anon-JWT ohne User; `goat_leaderboard`-View liefert 200 + [].
