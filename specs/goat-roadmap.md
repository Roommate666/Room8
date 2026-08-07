# Goat / Room8 Spiele-Plattform — Roadmap & Anforderungen (Stand 08.08.2026)

Erfasst aus Yusuf-Briefing 08.08. Ziel: Room8 wird eine **wechselnde Spiele-Event-Plattform**
mit Preisen. Leitprinzip (Yusuf, HOCH PRIO): **alles ohne Neu-Deploy aenderbar** (Remote-Config).

## Leitprinzip: Remote-Config, kein Redeploy
Spiel, Preis, Zeitraum, Quests, Benachrichtigungstexte = **Daten in Supabase**, die App liest sie
zur Laufzeit. Runde-fuer-Runde wechselbar:
- Runde 1: Block Blast (Goat Blast) · Runde 2: Jump'n'Run · Runde 3: Doodle-Jump-Style …
- Preise pro Event frei setzbar (Bargeld + Sachpreise, z.B. Moebelstueck).
- Daily Quests variieren.

## Prioritaeten-Sequenz (Impact x Abhaengigkeit)
### JETZT (dieser Block, rechtlich neutral, genehmigt)
1. **Event-Config-System** (`game_events`-Tabelle): aktives Event = welches Spiel + Preis + Zeitraum + scope + config(jsonb). App liest es live. Admin schaltet um -> kein Redeploy. [BAUE ICH JETZT]
2. **Score an Event binden** (`goat_scores.event_id`) + Submit sendet event_id. [JETZT]
3. **Wochensieger read-only** (Top je Event/scope, nur replay_validated) + Anzeige "Aktuelles Event / Preis / Sieger letzte Runde". KEINE Auszahlung. [JETZT]

### NACH Rechtsfreigabe (Gutschein/Bargeld + Veranstalter + Anwalt, siehe goat-prize-legal.md)
4. Preis-Auszahlung/Terms-Zustimmung scharf. Bargeld gewuenscht (Yusuf) -> Steuer/Abwicklung mit Steuerberater klaeren (Bargeld = mehr Aufwand als Gutschein).

### GROSSE EIGENE BAUSTEINE (je eigener Block, Reihenfolge = mein Vorschlag)
5. **Multi-Game-Engine:** jedes Spiel als austauschbares Modul mit einheitlicher Schnittstelle
   (start(seed,config) -> Score, moveLog, deterministischer Core fuer Replay). game_key im Event
   waehlt das Modul. Goat Blast ist das erste. Jump'n'Run/Doodle folgen als eigene Module.
   HINWEIS: Server-Replay-Validierung braucht pro Spiel einen deterministischen Core (wie bei Goat Blast).
6. **KI-Immatrikulations-Scan:** Foto/PDF der Bescheinigung -> OCR + KI liest Name/Hochschule/Semester,
   prueft Gueltigkeit (Semester-Enddatum) -> setzt/erneuert verified-Status automatisch.
   DSGVO-sensibel (besondere Sorgfalt: Zweckbindung, Loeschung des Uploads nach Pruefung, Einwilligung).
7. **Bitmoji-artiger Avatar (Ziege):** Nutzer personalisiert seine Ziege (Fell/Farbe, Hut, Brille,
   Accessoires) im selben Look wie die Spiel-Ziege. Wird im Highscore/Board neben dem Namen gezeigt.
   Umsetzung: parametrisierter Avatar (Ebenen/Config als jsonb im Profil) -> im Board gerendert.
8. **Admin-Dashboard-Upgrade:** Burger-Menue, uebersichtlich; verwaltet Events (Spiel/Preis/Zeitraum/Quests),
   Benachrichtigungen, Gewinner, Verifizierungen (inkl. KI-Scan-Review), Nutzer. Mobile-tauglich.
9. **Benachrichtigungs-Strategie (Push + Mail):** siehe unten. Retention-Nudges + Event-/Sieger-Infos.
10. **Automatisiertes Testen:** headless Smoke + Replay-Determinismus je Spiel-Modul, damit "nix mehr manuell".

## Benachrichtigungs-Strategie (Empfehlung, nicht spammen)
Zu viele Notifications = Deinstallation. Bewaehrte Kadenz (Richtwerte, opt-in, pro Nutzer steuerbar):
- **Daily-Challenge-Reminder:** max 1x/Tag, abends (z.B. 18-20 Uhr), nur wenn heute noch nicht gespielt.
- **Streak-Rettung:** 1 Nudge, wenn Tages-Streak zu brechen droht.
- **Event-Start:** 1 Push/Mail bei neuem Event ("Neue Runde: <Spiel>, Preis: <Preis>").
- **Wochensieger:** 1 Push/Mail bei Rundenende (Sieger + naechste Runde).
- **Hard-Cap:** ~3-4 sinnvolle/Woche. Alles pro Nutzer abschaltbar (Einstellungen). Mail seltener als Push.
- Room8 hat bereits FCM-Push + send-email Edge Function -> darauf aufbauen.

## Offene Yusuf-Entscheidungen (blockieren jeweils den zugehoerigen Bau)
- Preis: **Bargeld + Sachpreise** (gewaehlt) -> Steuer/Abwicklung klaeren (Block 4).
- Avatar: Look wie Spiel-Ziege (gewaehlt) -> Umfang der Anpassung (welche Slots?) noch offen (Block 7).
- Reihenfolge der grossen Bausteine 5-10 (mein Vorschlag oben; Yusuf priorisiert).

## Determinismus-Hinweis fuer variable Quests
Quests fliessen in den Score (Bonus) und damit ins Server-Replay. Variieren-ohne-Drift geht nur, wenn
der Quest-Satz Teil des Events ist und Client + Server denselben Satz je event_id nutzen. -> Quest-Config
kommt aus dem Event (config.quests), Submit sendet event_id, Server laedt dieselben Quests fuer den Replay.
(Wird mit Block 5/Quest-Config umgesetzt; bis dahin bleiben die fixen Quests aus core.js.)
