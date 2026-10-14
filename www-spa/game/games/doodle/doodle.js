/* ============================================================================
 * UniGoat Doodle — deterministischer Core (Single Source of Truth)
 * ----------------------------------------------------------------------------
 * Endloser vertikaler Springer ("Doodle-Jump-Style"): die Ziege springt
 * automatisch nach oben, Steuerung nur links/rechts. Score = erreichte Hoehe.
 * Game Over bei Fall unter den Bildschirm-Rand.
 *
 * DOM-frei, laeuft identisch im Browser (Spiel) und in Node/Deno (Server-Replay).
 * Gleicher (seed, Frame-Input-Log) -> exakt gleicher Score.
 * Anti-Cheat: der Server rechnet die Runde per replay(seed, inputLog) nach.
 *
 * HARTE REGELN:
 *  - Fixed-Step 60 Hz. Ein step() = ein Frame. inputLog[frame] = -1|0|1
 *    (-1 = links, 0 = kein Input, 1 = rechts).
 *  - ALLE Zufallswerte NUR aus mulberry32(seed). Kein Math.random, keine
 *    Systemzeit im Core. rng-Aufruf-Reihenfolge Live == Replay.
 *  - Ganzzahl-basierte Physik (fixed-point, 1 Einheit = 1/1000 px), damit
 *    Live und Replay bit-identisch rechnen (keine Float-Drift ueber Plattformen).
 * ========================================================================== */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod; // Node/Deno CommonJS
  root.DoodleCore = mod;                                                     // Browser + Deno global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- Spielfeld (logische Einheiten, fixed-point: 1 px = 1000 units) ----
  const U = 1000;                 // Sub-px-Aufloesung
  const VIEW_W = 360 * U;         // logische Breite
  const VIEW_H = 640 * U;         // logische Hoehe (Kamera-Fenster)
  const GOAT_W = 44 * U;          // Ziegen-Breite
  const GOAT_H = 44 * U;          // Ziegen-Hoehe

  // ---- Physik (pro Frame @ 60 Hz, alles ganzzahlig) ----
  // Apex-Hoehe eines Sprungs = JUMP_V^2 / (2*GRAVITY). Bei -3400/60 => ~96px,
  // klar ueber GAP_MAX (96px), damit ein normaler Sprung die naechste Plattform
  // sicher erreicht. Spring-Feder erreicht ~245px (mehrere Plattformen).
  const GRAVITY = 60;             // units/frame^2 (nach unten = +)
  const JUMP_V = -3450;           // Absprung-Geschwindigkeit (nach oben)
  const SPRING_V = -5450;         // Sprungfeder = deutlich hoeher
  const MOVE_V = 340;             // horizontale Geschwindigkeit pro Frame
  const MAX_FALL = 3200;          // maximale Fallgeschwindigkeit (cap)

  // ---- Plattformen ----
  const PLAT_W = 66 * U;
  const PLAT_H = 14 * U;
  const GAP_MIN = 62 * U;         // vertikaler Mindestabstand
  const GAP_MAX = 96 * U;         // vertikaler Maximalabstand
  const MOVER_SPEED = 120;        // horizontale Geschwindigkeit beweglicher Plattformen

  // Plattform-Typen
  const P_NORMAL = 0;             // steht fest
  const P_MOVING = 1;             // bewegt sich horizontal
  const P_BREAK = 2;              // zerbricht nach einmaligem Auftreffen
  const P_SPRING = 3;            // hat Sprungfeder -> hoher Boost

  // Feind
  const ENEMY_W = 40 * U;
  const ENEMY_H = 34 * U;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Ganzzahliger Zufall in [lo, hi] (inklusive) aus rng()
  function randInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  /* Schwierigkeit steigt mit der Hoehe (climb = wie weit hochgeklettert, in units).
     Rueckgabe: Wahrscheinlichkeits-Schwellen (0..1000) fuer Plattform-Typ. */
  function difficulty(climb) {
    const h = climb / U; // in px
    // moving/break/spring in Promille; Rest = normal
    const moving = Math.min(280, 40 + Math.floor(h / 40));   // bis 28%
    const brk    = Math.min(240, 20 + Math.floor(h / 55));   // bis 24%
    const spring = 90;                                        // konstant ~9%
    // Feind-Chance pro neuer Plattform (Promille)
    const enemy  = h < 800 ? 0 : Math.min(120, Math.floor((h - 800) / 60));
    return { moving, brk, spring, enemy };
  }

  // Neue Plattform oberhalb von yTop erzeugen (deterministisch aus rng)
  function spawnPlatform(st) {
    const gap = randInt(st._rng, GAP_MIN, GAP_MAX);
    const y = st._lastPlatY - gap;
    const x = randInt(st._rng, 0, VIEW_W - PLAT_W);

    const d = difficulty(st.climb);
    const roll = randInt(st._rng, 0, 999);
    let type = P_NORMAL;
    if (roll < d.spring) type = P_SPRING;
    else if (roll < d.spring + d.moving) type = P_MOVING;
    else if (roll < d.spring + d.moving + d.brk) type = P_BREAK;

    // Bewegungsrichtung fuer Mover deterministisch
    const dir = randInt(st._rng, 0, 1) === 0 ? -1 : 1;

    const plat = { x, y, type, dir, broken: false, id: st._nextId++ };
    st.platforms.push(plat);
    st._lastPlatY = y;

    // Feind evtl. leicht ueber der Plattform (nur bei normalen Plattformen)
    const eroll = randInt(st._rng, 0, 999);
    if (type === P_NORMAL && eroll < d.enemy) {
      const ex = randInt(st._rng, 0, VIEW_W - ENEMY_W);
      st.enemies.push({ x: ex, y: y - 46 * U, id: st._nextId++ });
    }
  }

  // Sicherstellen, dass genug Plattformen oberhalb der Kamera existieren
  function ensurePlatforms(st) {
    // spawne bis mindestens 1.5 Bildschirme oberhalb der aktuellen Kamera-Oberkante
    const target = st.camY - VIEW_H;
    while (st._lastPlatY > target) spawnPlatform(st);
  }

  function create(seed) {
    const st = {
      seed: seed | 0,
      frame: 0,
      over: false,
      score: 0,
      climb: 0,                 // wie weit nach oben geklettert (units, >=0)
      // Ziege: Position = Mitte-unten-Referenz per (x,y) Ecke oben-links
      goatX: (VIEW_W - GOAT_W) / 2 | 0,
      goatY: VIEW_H - 120 * U,
      velY: JUMP_V,             // startet mit Sprung nach oben
      facing: 1,                // Blickrichtung (fuer Renderer)
      camY: 0,                  // Kamera-Oberkante in Welt-Koordinaten (nimmt ab beim Steigen)
      platforms: [],
      enemies: [],
      _rng: mulberry32(seed | 0),
      _lastPlatY: 0,
      _nextId: 1,
    };
    // Kamera so, dass Ziege sichtbar: camY = 0 heisst Welt-y 0..VIEW_H sichtbar.
    st.camY = 0;
    // Start-Plattform so platziert, dass der Apex des ersten Sprungs (~99px ueber
    // der Plattform) knapp die Kamera-Halte-Linie (48%) erreicht -> jeder
    // Fortschritt nach oben scrollt zuverlaessig mit.
    const startPlat = {
      x: (VIEW_W - PLAT_W) / 2 | 0,
      y: VIEW_H - 190 * U,
      type: P_NORMAL, dir: 1, broken: false, id: st._nextId++,
    };
    st.platforms.push(startPlat);
    st._lastPlatY = startPlat.y;
    // Ziege startet auf der Start-Plattform, springt sofort los
    st.goatX = (VIEW_W - GOAT_W) / 2 | 0;
    st.goatY = startPlat.y - GOAT_H;
    // erste Plattformen nach oben generieren
    ensurePlatforms(st);
    return st;
  }

  // AABB-Ueberlappung Ziege (Fuesse) mit Plattform-Oberkante
  function landsOn(st, plat) {
    // nur wenn Ziege faellt
    if (st.velY <= 0) return false;
    if (plat.broken) return false;
    const gx1 = st.goatX, gx2 = st.goatX + GOAT_W;
    const px1 = plat.x, px2 = plat.x + PLAT_W;
    if (gx2 <= px1 || gx1 >= px2) return false;
    // Fuss-Unterkante der Ziege
    const feet = st.goatY + GOAT_H;
    const prevFeet = feet - st.velY; // Position vorm Bewegungsschritt
    // Fuss ueberquert Plattform-Oberkante in diesem Frame
    return prevFeet <= plat.y && feet >= plat.y;
  }

  function hitsEnemy(st, e) {
    const gx1 = st.goatX, gx2 = st.goatX + GOAT_W;
    const gy1 = st.goatY, gy2 = st.goatY + GOAT_H;
    const ex1 = e.x, ex2 = e.x + ENEMY_W;
    const ey1 = e.y, ey2 = e.y + ENEMY_H;
    return !(gx2 <= ex1 || gx1 >= ex2 || gy2 <= ey1 || gy1 >= ey2);
  }

  /* Ein Frame. inp = -1|0|1 (links/keiner/rechts). Mutiert st, gibt Event-Objekt
     fuer den Renderer zurueck (bounce/spring/break/enemy/over). */
  function step(st, inp) {
    if (st.over) return { over: true };
    st.frame++;
    const res = { bounce: false, spring: false, broke: null, over: false };

    // ---- horizontale Bewegung (Wrap-Around links/rechts wie Doodle Jump) ----
    if (inp === -1) { st.goatX -= MOVE_V; st.facing = -1; }
    else if (inp === 1) { st.goatX += MOVE_V; st.facing = 1; }
    if (st.goatX < -GOAT_W) st.goatX = VIEW_W;
    else if (st.goatX > VIEW_W) st.goatX = -GOAT_W;

    // ---- bewegliche Plattformen updaten ----
    for (const p of st.platforms) {
      if (p.type === P_MOVING && !p.broken) {
        p.x += MOVER_SPEED * p.dir;
        if (p.x <= 0) { p.x = 0; p.dir = 1; }
        else if (p.x >= VIEW_W - PLAT_W) { p.x = VIEW_W - PLAT_W; p.dir = -1; }
      }
    }

    // ---- Schwerkraft + vertikale Bewegung ----
    st.velY += GRAVITY;
    if (st.velY > MAX_FALL) st.velY = MAX_FALL;
    st.goatY += st.velY;

    // ---- Landung pruefen (nur beim Fallen) ----
    for (const p of st.platforms) {
      if (landsOn(st, p)) {
        // Fuesse auf Plattform-Oberkante setzen
        st.goatY = p.y - GOAT_H;
        if (p.type === P_SPRING) { st.velY = SPRING_V; res.spring = true; }
        else { st.velY = JUMP_V; res.bounce = true; }
        if (p.type === P_BREAK) { p.broken = true; res.broke = p.id; }
        break;
      }
    }

    // ---- Kamera folgt nach oben: wenn Ziege oberhalb der Halte-Linie ----
    // Linie bei ~52% der Hoehe. Ein normaler Sprung (Apex ~99px ueber der
    // Plattform) hebt die Ziege ueber diese Linie -> Kamera scrollt mit.
    const threshold = st.camY + Math.floor(VIEW_H * 52 / 100);
    if (st.goatY < threshold) {
      const shift = threshold - st.goatY; // >0
      st.camY -= shift;
      st.climb += shift;
      // Score = zurueckgelegte Hoehe in px (ganzzahlig)
      const newScore = Math.floor(st.climb / U);
      if (newScore > st.score) st.score = newScore;
    }

    // ---- neue Plattformen oben generieren + alte unten entfernen ----
    ensurePlatforms(st);
    const cull = st.camY + VIEW_H + 40 * U; // knapp unterhalb sichtbar
    if (st.platforms.length > 40) {
      st.platforms = st.platforms.filter(p => p.y < cull);
    }
    if (st.enemies.length) {
      st.enemies = st.enemies.filter(e => e.y < cull);
    }

    // ---- Feind-Kollision -> Game Over ----
    for (const e of st.enemies) {
      if (hitsEnemy(st, e)) { st.over = true; res.over = true; res.enemy = e.id; break; }
    }

    // ---- Fall-Tod: Ziege faellt unter den unteren Kamera-Rand ----
    if (!st.over && st.goatY > st.camY + VIEW_H) {
      st.over = true; res.over = true; res.fell = true;
    }

    return res;
  }

  /* Server-Replay: Runde aus seed + Frame-Input-Log nachrechnen.
     inputLog = Array von -1|0|1 (ein Wert pro Frame). Fehlende/leere Werte = 0.
     Gibt { score, valid, frames } zurueck. valid=false bei illegalem Input. */
  function replay(seed, inputLog) {
    const st = create(seed);
    const log = inputLog || [];
    let frames = 0;
    for (let i = 0; i < log.length; i++) {
      let inp = log[i];
      // Luecken (leerer Frame = kein Input) explizit als 0 behandeln
      if (inp === undefined || inp === null || inp === '') inp = 0;
      // strikt: nur die exakten Werte -1|0|1 (Zahl) sind erlaubt
      if (inp !== -1 && inp !== 0 && inp !== 1) {
        return { score: st.score, valid: false, frames, reason: 'bad-input' };
      }
      step(st, inp);
      frames++;
      if (st.over) break;
    }
    return { score: st.score, valid: true, frames, over: st.over };
  }

  return {
    // Konstanten fuer Renderer
    U, VIEW_W, VIEW_H, GOAT_W, GOAT_H, PLAT_W, PLAT_H, ENEMY_W, ENEMY_H,
    P_NORMAL, P_MOVING, P_BREAK, P_SPRING,
    // API
    mulberry32, create, step, replay,
    // fuer Tests
    _internal: { difficulty, randInt, GRAVITY, JUMP_V, SPRING_V, MOVE_V },
  };
});
