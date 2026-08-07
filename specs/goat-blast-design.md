# Goat Blast — Game-Design & Research (07.08.2026)

Quelle: 3 Research-Agenten (Sucht-Mechaniken, strategische Tiefe, Juice+Architektur). Basis = Yusufs v2 (`www/game/index.html`).

## Kern-Diagnose "zu einfach"
Es fühlt sich einfach an, weil (fast) **jeder Zug gleich viel wert ist** und man **nicht vorausplanen** kann. Tiefe entsteht NICHT durch komplexe Regeln, sondern durch Scoring, das gezieltes Aufbauen massiv belohnt + Look-Ahead.

## ✅ Bereits umgesetzt (07.08., verifiziert headless)
- **Vorschau nächste 3 Steine** (`#preview`) — Look-Ahead = größter Skill-Ceiling-Hebel.
- **Gestaffelter Multiplikator** `mult()=min(1+streak*0.5,5)` — simples Wegräumen << aufgebaute Combos. Badge zeigt aktuellen ×-Wert.
- **Perfect-Clear-Bonus** (+300×mult, Feld leer) — belohnt Board-Management.

## Roadmap (nach Impact, noch offen)
### Tier 1 — Tiefe (macht trivial → strategisch)
- **Hold-Slot** (1 Stein parken) — strategische Ressource.
- **Weighted Difficulty-Ramp** verschärfen (große/sperrige Steine ab höherem Score häufiger).
- Anti-Dead-End-Softener nur in ersten ~10 Zügen, danach echte Sackgassen.

### Tier 2 — Hindernisse (Level-Modus, Content-Tiefe)
- **Bomben** mit Zug-Countdown (Prioritäts-Zwang, Zeitdruck ohne Timer).
- **Stein/Locked Cells** (Dauer-Blockade, Einfädeln nötig).
- **Ausbreitender Schimmel** (bestraft passives Ecken-Bauen). [v2 hat Schimmel-Basis]
- **Board-Objectives pro Level** + Zug-Limit (Effizienz messbar).

### Tier 3 — Feel & Wachstum
- **Juice-Upgrade:** Hit-Stop (50-120ms Freeze bei Combo), Squash&Stretch, Partikel-Pooling, Pitch-Ramping Sound (rate steigt pro Combo-Stufe). [v2 hat schon viel: Shake, Partikel, Beeps, Sky-Flash]
- **Uni-Leaderboard** (pro Hochschule, wöchentl. Reset) = Retention + Akquise-Hebel.
- **Wordle-artiges Daily-Seed-Sharing** ("Seed of the day" + Score teilen) = organischer Wachstumshebel.

## Retention-Kern (Alleinstellung ggü. reinen Puzzlern)
- **Streak + Streak-Freeze** (Verlustaversion; 7+-Tage-Streak = 2,3× Retention lt. Duolingo).
- **Coupon-Kopplung** = Geld-Ersatz: Streaks/Highscores/Milestones schalten ECHTE Campus-Coupons frei. Wöchentl. Ziehung Top-Scorer = Variable-Reward auf echten Wert.
- **Daily Challenge** als Rückkehr-Anker (Push abends "deine Ziege wartet 🐐").
- **Referral:** "3 Kommilitonen einladen = Käse-Vorrat" → Spiel wird Nutzer-Akquise-Maschine.

## Architektur-Prinzip (für stabil/wartbar/server-validierbar)
- **Logik strikt von Rendering trennen** (`/core` Phaser-frei) → headless testbar + gleicher Code server-seitig zur Score-Validierung.
- **Deterministisches Seeding** (mulberry32 + xmur3) für Daily — JETZT einbauen (v2 nutzt mulberry32 bereits), nachträglich teuer.
- **Anti-Cheat via Replay** (Input-Sequenz + Seed einreichen, Server rechnet nach) — NUR wenn Leaderboard mit Preisgeld kommt.
- Server-Score-Validierung ist Pflicht bei echtem Preisgeld (sonst Woche-1-gehackt).

## Recht (vor Preisgeld klären)
- Skill-basiertes Daily (alle gleiches seeded Feld, kein Einsatz/Zufall) = KEIN Glücksspiel → nur saubere Teilnahmebedingungen. Preisgeld-Leaderboard trotzdem juristisch gegenchecken.
