# UniGoat Avatar ("Bitmoji-Ziege") — Konzept (08.08.2026)

## Idee
Jeder Nutzer personalisiert seine EIGENE Ziege im selben Look wie die Spiel-Ziege. Die Ziege
erscheint im Highscore-Board, Profil, ggf. neben Nachrichten/Events. Identitaets- + Retention-Hebel.

## Heutiger Stand
- `profiles.avatar_url` = hochgeladenes Bild (img). Kein Charakter-System.

## Empfohlener Ansatz: parametrisierter Layer-Avatar (kein KI-Bild pro Nutzer)
- Neue Spalte `profiles.avatar_config jsonb` (z.B. `{fur:"#e8e8e8", hat:"beanie", glasses:"sun", accessory:"scarf", bg:"mint"}`).
- Gerendert clientseitig aus **Ebenen-Sprites** (transparente PNG/SVG): Basis-Ziege + auswaehlbare Slots.
  Gleiche Render-Qualitaet wie die Spiel-Ziege (wir haben schon goat-full/shades/... als Stil-Referenz).
- Vorteile: winzig (nur JSON), keine KI-Kosten pro Nutzer, sofort im Board renderbar, konsistenter Look.
- Board/Profil rendert die Ziege aus avatar_config (kleiner Canvas/SVG-Compositor).

## Slots (Vorschlag v1 — Yusuf waehlt Umfang)
- **Fellfarbe** (5-6 Toene) · **Kopfbedeckung** (keine/Beanie/Cap/Doktorhut/Party) ·
  **Brille** (keine/Sonnenbrille/Nerd) · **Accessoire** (keine/Schal/Kette/Blume) · **Hintergrund** (Farbe/Muster).
- Freischaltbar ueber Erfolge/Streak/Event-Siege -> zusaetzlicher Anreiz (kosmetische Belohnung, kein Pay-to-win).

## Bau-Schritte (eigener Block)
1. Ebenen-Assets generieren (Higgsfield, im Ziegen-Stil) + freistellen (rembg) -> www/game/assets/avatar/*.
2. `avatar_config`-Migration + RLS (eigenes Profil schreibbar).
3. Avatar-Compositor (JS): rendert Ebenen in Canvas/SVG aus config.
4. Editor-UI (Profil): Slots durchklicken, Live-Vorschau, speichern.
5. Board/Highscore: Mini-Avatar neben Namen (aus public_profiles.avatar_config -> View erweitern).
6. Freischalt-Logik an Erfolge koppeln (optional, spaeter).

## Offene Entscheidungen (Yusuf)
- Umfang der Slots (v1 klein halten?).
- Freischalten ueber Erfolge ja/nein.
- Ersetzt der Avatar das Upload-Bild komplett, oder Wahl zwischen Foto und Ziege?
