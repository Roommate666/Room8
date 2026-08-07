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

## Empfehlung
Rive (A). Ich baue die Integration; Rig via Fiverr-Artist oder Yusuf. Bis dahin bleibt die
Zwischenloesung (eine smoothe Ziege) drin. Ungenutzte Posen-Assets (left/right/jump/shades)
bleiben liegen — als Referenz fuer den Rigger.

## Assets vorhanden (fuer Rigger als Referenz)
`www/game/assets/`: goat-full.png (front), goat-left/right/jump/shades.webp
