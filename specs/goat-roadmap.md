# UniGoat Spiele-Plattform — Roadmap & Anforderungen (Stand 08.08.2026)

## STATUS-SNAPSHOT (was steht, was fehlt)
FERTIG + verifiziert (alles auf Branch `unigoat-vision`, Supabase-Teile DEPLOYED auf Prod):
- [x] Spiel Goat Blast: organische Ziege (Canvas-Warp), 3D-Specials, 6x6, Quests, Streak
- [x] Deterministischer Core (core.js) + Server-Replay -> Anti-Cheat (E2E + Cheat-Ablehnung LIVE bewiesen)
- [x] Online-Board (Global/Uni/Daily), Bestwert je Nutzer (Dedupe), lokaler Fallback
- [x] Event-System (game_events) redeploy-frei: Spiel/Preis/Zeitraum/Scope als Daten
- [x] Admin: Spiele-Tab (Events umschalten) + Push-Broadcast (Event/Sieger/Reminder-Vorlagen)
- [x] Rechts-Check (gruen als Gratis-Skill-Gewinnspiel) + Teilnahmebedingungen-Entwurf
- [x] Rebrand Room8->UniGoat (sichtbare Texte + Kontaktmail info@unigoat.de)
- [x] Mail-Infra geklaert: Resend + Domain unigoat.de + noreply@unigoat.de (kein Zoho noetig)

OFFEN (Prioritaet):
- [x] Daily-Reminder-Push automatisiert: pg_cron 17:00 UTC -> send_daily_game_reminders() (nur User die schon spielten aber heute nicht; Safeguards+Dedup). Deployed.
- [ ] Preisgeld scharf: nach Anwalts-Freigabe (Bargeld+Sachpreis gewaehlt) + Wochen-Reset/Gewinner-Job
- [ ] Deploy auf unigoat.de (aktuell nur Branch) + App-Build
- [ ] Coupon-Redeem Klick-Test mit echtem Partner-Scan (Flow im Code verifiziert)
- [~] Multi-Game: Jump'n'Run + Doodle gebaut+deployed (standalone spielbar, deterministisch getestet). OFFEN: Event-Routing + Score-Submit + pro-Spiel Server-Replay.
- [~] KI-Immatrikulations-Scan: Function+UI deployed (JWT-sicher, Bild nicht gespeichert). OFFEN: Test mit echter Bescheinigung.
- [ ] Bitmoji-Avatar: FERTIG+deployed.
