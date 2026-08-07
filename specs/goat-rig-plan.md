# Ziege organisch bewegen — Rig-Plan (08.08.2026)

## Problem
Bild-Swapping zwischen KI-gerenderten Posen (front/left/right/jump/shades) ploppt, weil jede
Pose ein anderes Rendering ist = nicht dieselbe Ziege. Wirkt billig. Mehr Frames = mehr Flackern.
Yusuf-Feedback 08.08.: "Es ist ja nicht der gleiche Goat der sich organisch bewegt."

## Aktueller Stand (Zwischenloesung, LIVE)
- EINE Ziege (`goat-full.png`), bewegt nur per CSS/WAAPI-Transform:
  - Idle: atmen + leichtes Wiegen, Fuesse am Boden (Boden-Schatten)
  - Blick: leichte Neigung + Mini-Nicken zur Platzierung (gleiche Ziege, kein Swap)
  - Sprung: Squash&Stretch bei Line-Clear (gleiche Ziege)
- Kein Ploppen mehr. Aber: Kopf kann sich nicht wirklich unabhaengig drehen (2D-Standbild).

## Echte organische Bewegung — Optionen
### A) Rive (EMPFEHLUNG, Industrie-Standard fuer Web-Game-Charaktere)
- EIN Charakter wird EINMAL gerigt (Knochen/Mesh) + State-Machine (idle/look/jump/celebrate).
- Winzige Runtime (~100 KB), web + Capacitor kompatibel, blend-bare States = organisch, kein Ploppen.
- Game-Code treibt Inputs: `stateMachine.input('lookX').value = dir; input('celebrate').fire()`.
- BLOCKER: Rig muss im Rive-Editor (Design-Tool) gebaut werden. Kann NICHT rein per Code erzeugt werden.
  - Wege: (1) Yusuf riggt selbst (~1-2h, anfaengerfreundlich), (2) Rive-Artist Fiverr ~50-150 EUR,
    (3) fertiges gerigtes Tier lizenzieren + umfaerben.
- Integration (Code-Seite) mache ICH: Runtime einbinden, Canvas platzieren, Inputs an Spielzustand haengen.

### B) Code-Puppet-Rig (kein neues Tool, mache ich komplett selbst)
- Ziege in Ebenen schneiden (Kopf, Ohren, Koerper, Beine, Schwanz) via Segmentierung.
- Jede Ebene per JS mit Feder-Physik animieren (Kopf neigt/nickt, Ohren wackeln, Koerper atmet).
- Organisch, EINE Ziege, kein Ploppen, kein Designer noetig.
- RISIKO: sauberes Segmentieren aus einem 3D-Render ist fehleranfaellig; Kopf-DREHUNG (Profil)
  geht mit 2D-Ebenen nur als Neigung/Glance, nicht als echte Drehung.

### C) Transparentes Loop-Video (Higgsfield Seedance image-to-video) — NICHT empfohlen
- Kann NICHT auf Spielzustand reagieren (kein Blick-nach-links bei Platzierung links).
- Fell/Metall-Morphing sieht oft schlecht aus. Nur fuer nicht-interaktives Deko-Loop.

## ENTSCHEIDUNG 08.08. (nach Recherche): Canvas-Warp, code-only, gratis
Yusuf will es OHNE Artist/Editor/Lizenz zusammen im Code loesen. Recherche-Ergebnis:
- Rive = binaeres Editor-Format, NICHT per Code erzeugbar.
- Spine (auch AI-Auto-Rigger Keyframe.it/God Mode) = Runtime braucht Spine-Lizenz ab ~69 EUR.
- Live2D = braucht Cubism-Editor. Meta Animated-Drawings = offline, nicht reaktiv.
- => EINZIGE 100% code-only/gratis/kein-Editor Loesung: eigenes Warp-Rig im Canvas.

### UMGESETZT (LIVE): `GoatRig` = Canvas-Slice-Warp
- Zeichnet `goat-full.png` in 30 horizontalen Slices; obere Slices (Kopf/Ohren) bewegen sich
  staerker (Gewicht (1-v)^1.5), Fuesse bleiben am Boden.
- look(dir): Kopf lehnt zur Platzierung. Idle: Wiegen + feines Fell-Wackeln + Atmen.
  jump(): globaler Squash-Sprung um Fuss-Pivot. mode(on): Amplitude hoch + Gluehen. Blinzeln.
- EINE durchgehende Ziege, kein Bild-Swap, kein Ploppen. Fallback: PNG bleibt wenn Bild fehlt.
- API identisch (look/jump/mode) -> Spielcode unveraendert.
- OFFEN/Feintuning: Amplituden nach Yusuf-Feedback; ggf. Kopf als eigener Layer fuer echte
  Drehung (dann Higgsfield-Teile generieren). Rive/Spine bleibt Option falls spaeter Budget.

## Assets vorhanden (fuer Rigger als Referenz)
`www/game/assets/`: goat-full.png (front), goat-left/right/jump/shades.webp

## STATUS 08.08.: Code-Integration FERTIG (Rive-Plumbing live, wartet nur auf .riv)
Die Web-Integration ist gebaut und getestet (Fallback auf PNG solange keine .riv da ist, 0 Fehler):
- CDN-Runtime `@rive-app/canvas@2.10.3` in `www/game/index.html`
- `<canvas id="goatCanvas">` in der goat-wrap (versteckt bis Rig laedt)
- Treiber `GoatRig` laedt `assets/goat.riv`, blendet Canvas ein + PNG aus bei Erfolg
- Bewegungs-API `goatLook/goatJumpFX/updateGoat` treibt Rive wenn ready, sonst PNG-Transform

### VERTRAG fuer den Rigger (MUSS exakt so heissen, sonst greift der Code nicht):
- Datei ablegen als: `www/game/assets/goat.riv`
- **State-Machine-Name: `Goat`**
- **Inputs:**
  - `lookX` — Number, Bereich -100..+100. Kopf/Blick nach links (negativ) / rechts (positiv).
    Code setzt hier die Richtung der letzten Platzierung.
  - `celebrate` — Trigger. Wird bei Line-Clear/Combo gefeuert (Sprung/Jubel).
  - `goatMode` — Boolean. true ab Streak>=4 (Sonnenbrille/Ausflippen-Loop), sonst false.
- **Empfohlene States:** Idle (atmen/blinzeln/Ohren), Look (per lookX geblendet),
  Celebrate (Sprung, one-shot ueber celebrate), GoatMode (Dauer-Loop solange goatMode=true).
- Artboard so exportieren, dass die Ziege auf dem Boden steht (Fuesse unten), Format ~200x270.

### Fuer Produktion (Capacitor offline) spaeter:
Runtime lokal bundlen statt CDN (`@rive-app/canvas` npm -> www/vendor/), sonst laedt der Rig
offline nicht (dann greift automatisch der PNG-Fallback).
