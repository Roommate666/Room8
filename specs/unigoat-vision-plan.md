# UniGoat — Großer Umbau: Vision, ehrliche Einordnung & Phasenplan

> Status: **PLAN + erster Bau-Slice (07.08.2026).** Design festgezurrt, Goat-Blast-Prototyp läuft.

## ✅ STAND 07.08. (Bau begonnen — Branch `unigoat-vision`)
- **Design-System FESTGEZURRT** (`www/styles/tokens.css`): dezentes Schwarz-Weiß (weiches `#15181C`, nicht hart-schwarz) + **EIN Akzent = Mintgrün `#21D0A1`** (Hover `#12B489`, Tint `#E4FBF3`). Gold `#F4B740` nur für Coins/Käse. Kein Lila. Light + Dark Mode. Alle neuen Screens nutzen diese CSS-Variablen.
- **Goat Blast Prototyp LÄUFT** (`www/game/index.html` + `goat-blast.js`, Phaser 3 via CDN, isoliert — Haupt-App unberührt):
  - 8×8 Feld, 3 Käse-Blöcke im Tray, antippen → aufs Feld. Volle Reihe/Spalte löst auf → Punkte + Combo-Multiplikator.
  - **Goat-Maskottchen** (aus `hut-icon-1.png` freigestellt → `www/game/assets/goat.png`) sitzt unten rechts neben dem Feld und **springt bei jedem Line-Clear hoch** (+ Sprechblase). Genau wie besprochen.
  - Verifiziert via headless Chrome: Platzierung, Line-Clear, Score/Combo, Goat-Sprung, Game-Over — 0 JS-Fehler.
  - Modi-Umschalter (Endlos aktiv / Daily Challenge "bald"), Coin+Streak-Pills als Platzhalter für Retention-Kern.
- **OFFEN am Prototyp:** Goat noch als Kopf-Icon (leichter Kanten-Halo) — sauberes game-ready Maskottchen (Seitenprofil/Sprung-Pose, transparent) via Higgsfield-CLI generieren. Daily-Seed + Server-Score (Phase 2). Sound. Coin-Gutschrift an echtes wallet (Phase 1).
- **NOCH ZU ENTSCHEIDEN (Yusuf):** Coin-Name endgültig · Bottom-Nav neu (Hub/Coupons/Game/Leaderboard/Profil?) · Jobs&Events behalten oder raus.

---

> Ursprünglicher Plan (07.08.2026):

## 0. Brutale Einordnung zuerst (Berater, kein Ja-Sager)

Die Vision ist stark und in sich stimmig: Ein Retention-Loop (Spiel + Währung + Streak + Leaderboard) ist **genau die richtige Wachstums-Maschine** für eine Studenten-Coupon-App — er treibt tägliche Öffnungen + Weiterempfehlungen, und **das** löst dein echtes Problem (Nutzer + Coupon-Nachfrage).

ABER: Die App hat **~0 aktive Nutzer und 5 Coupons**, und der **App-Release mit dem bereits gebauten Kram steht noch aus.** Alles gleichzeitig zu bauen (Game + Avatare + KI-Party-Planer + Leaderboard + Redesign) = Villa ohne Fundament. Reihenfolge ist hier der ganze Hebel.

**Zwei Dinge sind kein Feature, sondern ein eigenes Unternehmen — hart aufschieben:**
- **KI-Party-Planer mit In-App-Bezahlung + Aufteilung an Restaurants + Lieferung** = Marktplatz + Payment-Lizenz + Logistik + Restaurant-Verträge. Das ist eine eigene Firma, kein UniGoat-Feature.
- **Voll-Bitmoji-Avatare**: Snapchat hat dafür ein 20-Personen-Team. Ein *einfacher personalisierbarer Goat* ist machbar, ein echtes Bitmoji nicht.

**Rechtliche Warnungen (PFLICHT beachten, bevor gebaut):**
- **Preisgeld übers Leaderboard** → in DE ist das je nach Ausgestaltung ein **Gewinnspiel/Glücksspiel** mit klaren Regeln (Skill vs. Zufall, Teilnahmebedingungen, evtl. Erlaubnis). Vor dem Bau juristisch klären.
- **Echtes Geld + Spiel** → sofortiges Betrugsziel. **Server-seitige Score-Validierung ist Pflicht**, sonst wird das Leaderboard in Woche 1 gehackt.
- **Coupon-Streak-Belohnung + Währung** → Steuer-/AGB-Fragen bei geldwerten Vorteilen.

**Was du selbst schon verworfen hast (gut so):** Coupons erst durchs Spielen freischalten. Coupons müssen direkt nutzbar bleiben — sonst sinkt der Kernnutzen.

## 1. Engineering-Fundament (dein Wunsch: sauber, sicher, wartbar)

Ehrliche Wahrheit: Die App ist aktuell **Vanilla HTML/CSS/JS ohne Framework, ohne echte Test-Suite** (nur Smoke-Tests). Für ein Projekt dieser Größe (Spiel, Währung, echtes Preisgeld) wird das ohne Struktur wehtun.

**Empfehlung — Mittelweg statt Total-Rewrite:**
- **KEIN Framework-Rewrite** (React o.ä.) — das wäre selbst ein Monats-Risiko und wirft alles Funktionierende weg.
- Stattdessen: **klare Modul-Struktur** (je Feature ein Ordner + eigene JS-Datei), **echte Test-Suite** (nicht nur Smoke), und die **Zero-Tolerance-DB-Prozedur** (Dry-Run → Fingerprint-Diff → atomarer Commit), die wir schon nutzen, für ALLE Migrationen.
- **Bei JEDER Änderung fest im Ablauf:** `Semgrep` (Security) + `/code-review` (5 parallele Reviewer) + `code-reviewer`-Agent. Das ist genau dein Wunsch "sauber & sicher".
- **Game-Engine:** Phaser (isoliert in `www/game/`, ändert die bestehende App nicht).

## 2. Multi-Agent-Bauweise (parallel)

Für die Bau-Phase: **3–5 parallele Claude-Agents in Git-Worktrees**, je ein Feature-Strang (z.B. Währung-Backend / Game / Redesign-Designsystem / Referral). Jeder eigener Branch, keine Kollisionen, am Ende gemerged + review-gated. Ich orchestriere das. Mehr als 5 = Koordinations-Chaos.

## 3. Phasenplan (nach Hebel sortiert)

### Phase 0 — Fundament first (JETZT, Tage)
- **App-Release** des bereits gebauten Stands (Self-Redeem, Filter, Live-Hours) → echte Nutzer reinbringen. **Nichts anderes zählt, bis Leute drin sind.**
- **Design-System-Entscheidung** treffen (Schwarz-Weiß, funktional) — BEVOR neue Features gebaut werden, damit sie gleich im neuen Look entstehen statt später umgestylt.

### Phase 1 — Retention-Kern (die eigentliche Wachstums-Maschine) [~2–3 Wochen]
Das ist der höchste Hebel, weil er tägliche Öffnungen + Mundpropaganda erzeugt = löst das Nutzer-Problem.
- **Währung** ("Goat-Coins" — ein Name, nicht Käse+UniGold+Lose parallel; Branding-Entscheidung nötig). Verdienen durch:
  - Coupon einlösen (+X)
  - Freund per Referral-Link → meldet sich an (beide +Y)
  - täglicher Login / Streak
- **Referral-System**: eigener Link pro User + Attribution beim Signup.
- **Streak**: Tages-Zähler + Meilensteine (z.B. 30 Tage → Bonus-Coupon).
- Tabellen: `wallets`, `coin_transactions`, `referrals`, `streaks` (alles server-autoritativ, kein Client-Vertrauen).

### Phase 2 — Spiel + Leaderboard [~3–4 Wochen]
- **Phaser-Tetris/Blockbuster** in `www/game/`. Score → Coins.
- **Leaderboard** (wöchentlich, Reset). **Score-Einreichung server-validiert** (Anti-Cheat) — Pflicht wegen Preisgeld.
- **Preisgeld Top 3** — ERST nach juristischer Klärung (Gewinnspiel-Regeln).

### Phase 3 — Identität & Progression [~4 Wochen]
- **Tier-System Bronze → Silber → Gold** an Aktivität gekoppelt, schaltet Features/Events frei.
- **Personalisierbarer Goat** (einfache Layer: Farben/Accessoires kaufbar mit Coins) — NICHT Voll-Bitmoji.

### Phase 4 — Redesign-Rollout [parallel/laufend]
- Bestehende Screens auf das in Phase 0 definierte Schwarz-Weiß-Funktional-System migrieren. Schrittweise, nicht Big-Bang.

### Phase 5 — Zukunfts-Wetten (separat bewerten, NICHT jetzt)
- **Jährliche Re-Verifizierung** (moderat).
- **KI-Bescheinigung-Scan** statt manueller Verifizierung (OCR + Validierung; mittel).
- **Re-Engagement-Push** ("dein Goat vermisst dich", neue Coupons) — teilweise trivial, teilweise an Streak/Tier gekoppelt.
- **KI-Party-Planer + In-App-Ordering + Payment-Split + Lieferung** → eigenes Produkt/Firma. Frühestens wenn UniGoat läuft.

## 4. Offene Entscheidungen für Yusuf (bevor Phase 1 startet)
1. **Reihenfolge OK?** Fundament (Release + Designsystem) vor Features?
2. **Währungs-Branding:** ein Name — "Goat-Coins"? "Käse"? etwas anderes?
3. **Preisgeld:** willst du echtes Geld ausschütten (→ Rechts-Check nötig) oder erstmal Sach-/Coupon-Preise (kein Glücksspiel-Risiko)?
4. **Redesign:** wirklich komplett Schwarz-Weiß, oder Schwarz-Weiß + 1 Akzentfarbe (meist besser für CTAs/Conversion)?
5. **Multi-Agent-Bau:** soll ich 3–5 parallele Agents aufsetzen, sobald wir bei Phase 1 sind?

## 5. Mein klarer Vorschlag (wenn du mich fragst)
1. **Diese Woche:** App-Release + Design-System festzurren. (Fundament)
2. **Dann NUR Phase 1** (Währung + Referral + Streak) — der echte Wachstumshebel — und schauen, ob Nutzer kleben, BEVOR wir Monate ins Spiel stecken.
3. Spiel/Leaderboard/Avatare erst, wenn Phase 1 zeigt: Leute kommen täglich wieder.
4. Party-Planer/Payment: geparkt, eigenes Kapitel.

Lieber in 6 Wochen eine App die klebt, als in 6 Monaten eine Villa die keiner betritt.

---

## 6. FESTGEZURRT (07.08.2026)

- **Spiel: "Goat Blast"** — Block-Puzzle (Block-Blast/Tetris-Hybrid), Käse/Goat-Theme, Phaser, in `www/game/`.
- **Zwei Spielmodi:**
  - **Daily Challenge (seeded):** alle bekommen am selben Tag dasselbe Feld/dieselbe Blockfolge → reiner Skill-Vergleich → Leaderboard → **echtes Preisgeld Top 3**. Server-validiert (Anti-Cheat via Replay).
  - **Endlos-Modus:** frei spielen, Score → Coins.
- **Preisgeld = reiner Skill, kein Einsatz, kein Zufall** → kein Glücksspiel. Nur saubere Teilnahmebedingungen nötig.
- **Zwei Challenge-Ebenen:**
  - **Daily Challenge** = das seeded Spiel.
  - **Quests** = allgemeine Aufgaben ("3 Freunde einladen", "5 Coupons einlösen", "7-Tage-Streak") → Coins/Punkte.
- **Treiber: Red Bull** will das Endprodukt sehen → wir bauen einen polierten vorzeigbaren Slice.
- **Modell:** Umsetzung hier mit Opus 4.8; Design-Brainstorm ggf. in der Claude-App.

## 7. FEATURE-MATRIX (Vorschlag — was / wo / wie)

| Feature | Was es tut | Wo (Screen) | Daten/Waehrung | Look-Idee |
|---|---|---|---|---|
| **Home/Hub** (neu) | Landing: Streak, Coin-Stand, Tier, "Daily Challenge spielen"-CTA, offene Quests | neuer Start-Tab | liest wallet/streak/tier | grosser Coin-Zaehler + Goat oben, klare Kacheln |
| **Goat Blast — Daily** | Seeded Tages-Challenge, 1 Versuch (oder begrenzt), Score zaehlt fuers Leaderboard | Game-Tab | daily_scores (server-validiert) | Vollbild-Canvas, Käse-Bloecke, Goat-Maskottchen |
| **Goat Blast — Endlos** | Freies Spielen, Score → Coins | Game-Tab | coin_transactions | wie Daily, "Frei"-Badge |
| **Leaderboard** | Tages-/Wochen-Rang, Top 3 Preisgeld | Leaderboard-Tab | daily_scores, prizes | Podium Top 3, eigener Rang gepinnt |
| **Coins / Wallet** | Waehrung verdienen/ausgeben | Profil + Hub | wallets, coin_transactions | Coin-Icon, Verlauf |
| **Quests** | Aufgaben abhaken → Coins | Hub / eigener Screen | quests, quest_progress | Checklisten-Kacheln mit Fortschritt |
| **Streak** | Taeglicher Login-Zaehler + Meilensteine (30T → Bonus) | Hub-Badge | streaks | Flammen-/Goat-Streak-Zaehler |
| **Referral** | Eigener Link → Freund meldet sich an → beide Coins | Profil + Quests | referrals | "Teilen"-Button + Zaehler |
| **Tiers** | Bronze → Silber → Gold nach Aktivitaet, schaltet Features/Events frei | Profil | tiers/level | Ziegel-Badge das sich veredelt |
| **Goat-Avatar** | Personalisierbarer Goat (Farben/Accessoires mit Coins kaufbar) | Profil | avatar_config, shop | Layer-System, KEIN Voll-Bitmoji |
| **Coupons** (bestehend) | bleibt Kernnutzen, direkt einloesbar | Coupons-Tab | coupons/redemptions | im neuen Design |
| **Re-Engagement-Push** | "dein Goat vermisst dich", neue Coupons, Streak-Gefahr | Backend | push infra | — |

**Offene IA-Frage:** Aktuelle Tabs sind Coupons/Jobs/Events. Neu kommen Hub/Game/Leaderboard dazu. Passen nicht alle in eine Bottom-Bar (max ~5). Vorschlag: **Hub · Coupons · Game · Leaderboard · Profil** — und **Jobs/Events** entweder raus oder in den Hub verschoben. (Entscheidung noetig.)

## 8. Naechste offene Entscheidungen
1. **Coin-Name** endgueltig: "Goat-Coins"? "Käse"? "Goldies"? (ein Name, konsistent)
2. **Jobs & Events:** bleiben sie, oder Fokus voll auf Coupons+Game+Social?
3. **Bottom-Nav neu:** Vorschlag Hub/Coupons/Game/Leaderboard/Profil — ok?
4. **Design-Sprache:** komplett Schwarz-Weiss, oder S/W + 1 Akzentfarbe (z.B. Goat-Gold) fuer CTAs? (1 Akzent konvertiert meist besser)
