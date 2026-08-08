/* ============================================================================
 * UniGoat Jump'n'Run — deterministischer Core (Single Source of Truth)
 * ----------------------------------------------------------------------------
 * DOM-frei, laeuft identisch im Browser (Spiel) und in Node/Deno (Server-Replay).
 * Seitwaerts-Platformer: die Ziege laeuft automatisch nach rechts, springt per
 * Input, weicht Hindernissen aus, sammelt Kaese/Muenzen. Score = Distanz + Sammeln.
 * Game-Over bei Kollision. Zunehmende Schwierigkeit ueber die Distanz.
 *
 * ANTI-CHEAT: fester Zeitschritt (60 Hz). ALLE Zufallswerte kommen NUR aus
 * mulberry32(seed). Keine Systemzeit, kein Math.random im Core. Eingaben werden
 * als Frame-Input-Log gefuehrt; der Server rechnet die Runde per replay() nach.
 *
 * WICHTIG: Reihenfolge der rng()-Aufrufe MUSS 1:1 der Live-Logik entsprechen,
 * sonst driften Client und Server. Regel-Aenderungen immer HIER machen und den
 * Renderer diesen Core nutzen lassen (kein Parallel-Code).
 *
 * Alle internen Zahlen sind Ganzzahlen (fixed-point, Faktor SCALE=1000), damit
 * Live und Replay bit-identisch rechnen (keine Float-Drift ueber IEEE-Rundung).
 * ========================================================================== */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod; // Node/Deno CommonJS
  root.JumpRunCore = mod;                                                    // Browser + Deno global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- fixed-point Konstanten (alle Positionen/Geschwindigkeiten * SCALE) ----
  const SCALE = 1000;
  const FPS = 60;

  // Logische Weltgroesse (Renderer skaliert darauf). Einheiten = "Weltpixel" * SCALE.
  const WORLD_W = 800 * SCALE;
  const WORLD_H = 450 * SCALE;
  const GROUND_Y = 380 * SCALE;   // Oberkante Boden (Fuesse der Ziege stehen hier)

  // Ziegen-Hitbox
  const GOAT_X = 140 * SCALE;     // feste horizontale Bildschirmposition
  const GOAT_W = 44 * SCALE;
  const GOAT_H = 46 * SCALE;

  // Physik (pro Frame)
  const GRAVITY = 2200;           // v-Zunahme pro Frame (fixed-point)
  const JUMP_V = -37000;          // Absprung-Geschwindigkeit (nach oben = negativ)
  const MAX_FALL = 45000;         // Terminal-Fallgeschwindigkeit
  const MAX_DOUBLE_JUMPS = 1;     // 1 = Doppelsprung erlaubt (0 = nur einfach)

  // Scroll-/Weltgeschwindigkeit (Distanzzuwachs pro Frame), steigt mit der Zeit
  const SPEED_START = 5000;       // ~5 px/Frame
  const SPEED_MAX = 12000;
  const SPEED_RAMP_FRAMES = 60 * 90; // nach 90 s Maximalgeschwindigkeit erreicht

  // Score
  const DIST_PER_POINT = 24 * SCALE; // je 24 Weltpixel Distanz = 1 Punkt
  const CHEESE_POINTS = 25;
  const COIN_POINTS = 10;

  // Objekt-Groessen
  const OBST_MIN_W = 26 * SCALE, OBST_MAX_W = 54 * SCALE;
  const OBST_MIN_H = 30 * SCALE, OBST_MAX_H = 78 * SCALE;
  const COLLECT_SIZE = 28 * SCALE;

  // Spawn-Abstaende (in Weltpixel*SCALE, entlang der Distanz gemessen)
  const GAP_MIN_START = 300 * SCALE;
  const GAP_MAX_START = 460 * SCALE;
  const GAP_MIN_HARD = 190 * SCALE;
  const GAP_MAX_HARD = 300 * SCALE;
  const GAP_HARD_AT = 60 * SCALE * 1000; // Distanz ab der die Luecken minimal sind (60k px)

  // Objekt-Typen
  const T_OBSTACLE_GROUND = 0; // steht auf dem Boden
  const T_OBSTACLE_AIR = 1;    // schwebt (drueberspringen NICHT noetig, drunter durch)
  const T_CHEESE = 2;
  const T_COIN = 3;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Ganzzahliger Zufall im Bereich [lo, hi] (inklusive), aus rng().
  function randInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  // aktuelle Weltgeschwindigkeit als Funktion des Frames (deterministisch, ohne rng)
  function speedAt(frame) {
    if (frame >= SPEED_RAMP_FRAMES) return SPEED_MAX;
    const span = SPEED_MAX - SPEED_START;
    // lineare Rampe, Ganzzahl-Arithmetik
    return SPEED_START + Math.floor((span * frame) / SPEED_RAMP_FRAMES);
  }

  // Achsen-Rechteck-Ueberlappung (alle Werte fixed-point)
  function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function create(seed) {
    const st = {
      seed: seed | 0,
      frame: 0,
      over: false,
      // Ziege
      goatY: GROUND_Y - GOAT_H, // obere Kante
      velY: 0,
      onGround: true,
      jumpsUsed: 0,
      // Welt
      dist: 0,                  // zurueckgelegte Distanz (fixed-point)
      nextSpawnDist: GAP_MAX_START, // Distanz, bei der das naechste Objekt gespawnt wird
      objects: [],              // {type, x, y, w, h, collected}
      // Score
      score: 0,
      cheese: 0,
      coins: 0,
      _rng: mulberry32(seed | 0),
    };
    return st;
  }

  // Luecken-Grenzen abhaengig von der Distanz (Schwierigkeitskurve, ohne rng).
  function gapBounds(dist) {
    if (dist >= GAP_HARD_AT) return { min: GAP_MIN_HARD, max: GAP_MAX_HARD };
    // linear zwischen Start und Hard interpolieren
    const gmin = GAP_MIN_START - Math.floor(((GAP_MIN_START - GAP_MIN_HARD) * dist) / GAP_HARD_AT);
    const gmax = GAP_MAX_START - Math.floor(((GAP_MAX_START - GAP_MAX_HARD) * dist) / GAP_HARD_AT);
    return { min: gmin, max: gmax };
  }

  // Ein neues Objekt am rechten Rand erzeugen. Reihenfolge der rng()-Aufrufe ist
  // fix und MUSS in Live und Replay identisch sein.
  function spawnObject(st) {
    const rng = st._rng;
    const roll = rng(); // Typ-Entscheidung
    const spawnX = WORLD_W; // erscheint am rechten Rand

    let obj;
    if (roll < 0.62) {
      // Hindernis. Ab groesserer Distanz auch Luft-Hindernisse.
      const airAllowed = st.dist > 25 * SCALE * 1000;
      const airRoll = rng();
      const isAir = airAllowed && airRoll < 0.30;
      if (isAir) {
        const w = randInt(rng, OBST_MIN_W, OBST_MAX_W);
        const h = randInt(rng, 26 * SCALE, 44 * SCALE);
        // schwebendes Hindernis in Kopfhoehe -> Spieler muss unten bleiben (nicht springen)
        const y = GROUND_Y - GOAT_H - h - (14 * SCALE);
        obj = { type: T_OBSTACLE_AIR, x: spawnX, y: y, w: w, h: h, collected: false };
      } else {
        const w = randInt(rng, OBST_MIN_W, OBST_MAX_W);
        const h = randInt(rng, OBST_MIN_H, OBST_MAX_H);
        const y = GROUND_Y - h;
        obj = { type: T_OBSTACLE_GROUND, x: spawnX, y: y, w: w, h: h, collected: false };
      }
    } else {
      // Sammelobjekt: Kaese haeufiger als Muenze.
      const kind = rng();
      const type = kind < 0.55 ? T_CHEESE : T_COIN;
      // Hoehe variiert: manchmal am Boden, manchmal in Sprunghoehe.
      const highRoll = rng();
      let y;
      if (highRoll < 0.5) {
        y = GROUND_Y - COLLECT_SIZE - (10 * SCALE);        // knapp ueber Boden
      } else {
        y = GROUND_Y - COLLECT_SIZE - randInt(rng, 90 * SCALE, 150 * SCALE); // in der Luft
      }
      obj = { type: type, x: spawnX, y: y, w: COLLECT_SIZE, h: COLLECT_SIZE, collected: false };
    }
    st.objects.push(obj);

    // naechsten Spawn-Abstand ziehen (immer, damit rng-Reihenfolge stabil bleibt)
    const gb = gapBounds(st.dist);
    const gap = randInt(rng, gb.min, gb.max);
    st.nextSpawnDist = st.dist + gap;
  }

  /* Ein Frame simulieren.
     frameInput: Array der in diesem Frame gedrueckten Aktionen, z.B. ['jump'].
     Nur 'jump' ist relevant; unbekannte Eintraege werden ignoriert.
     Gibt ein Ergebnis-Objekt fuer den Renderer zurueck (Events dieses Frames). */
  function step(st, frameInput) {
    const res = { jumped: false, collected: [], hit: false, over: st.over };
    if (st.over) return res;

    st.frame++;

    // ---- Input: Sprung ----
    const wantsJump = Array.isArray(frameInput) && frameInput.indexOf('jump') !== -1;
    if (wantsJump) {
      if (st.onGround) {
        st.velY = JUMP_V;
        st.onGround = false;
        st.jumpsUsed = 1;
        res.jumped = true;
      } else if (st.jumpsUsed <= MAX_DOUBLE_JUMPS) {
        // Doppelsprung (nur solange Kontingent uebrig)
        st.velY = JUMP_V;
        st.jumpsUsed++;
        res.jumped = true;
      }
    }

    // ---- Physik: Schwerkraft + Position ----
    st.velY += GRAVITY;
    if (st.velY > MAX_FALL) st.velY = MAX_FALL;
    st.goatY += st.velY;

    const floorTop = GROUND_Y - GOAT_H;
    if (st.goatY >= floorTop) {
      st.goatY = floorTop;
      st.velY = 0;
      st.onGround = true;
      st.jumpsUsed = 0;
    }

    // ---- Welt scrollen ----
    const spd = speedAt(st.frame);
    st.dist += spd;
    for (const o of st.objects) o.x -= spd;

    // ---- Distanz-Score ----
    // Ganzzahlige Umrechnung: score = floor(dist / DIST_PER_POINT)
    const distPoints = Math.floor(st.dist / DIST_PER_POINT);
    if (distPoints > st.score - st.cheese * CHEESE_POINTS - st.coins * COIN_POINTS) {
      // Distanz-Anteil neu setzen (Sammel-Anteil bleibt erhalten)
      st.score = distPoints + st.cheese * CHEESE_POINTS + st.coins * COIN_POINTS;
    }

    // ---- Spawns ----
    // Solange die Distanz die naechste Spawn-Marke ueberschritten hat, nachspawnen.
    // (bei hoher Geschwindigkeit kann pro Frame theoretisch mehr als 1 faellig sein)
    let guard = 0;
    while (st.dist >= st.nextSpawnDist && guard < 8) {
      spawnObject(st);
      guard++;
    }

    // ---- Kollision / Einsammeln ----
    const gx = GOAT_X, gy = st.goatY, gw = GOAT_W, gh = GOAT_H;
    for (const o of st.objects) {
      if (o.collected) continue;
      if (!overlaps(gx, gy, gw, gh, o.x, o.y, o.w, o.h)) continue;
      if (o.type === T_OBSTACLE_GROUND || o.type === T_OBSTACLE_AIR) {
        st.over = true;
        res.hit = true;
        res.over = true;
        break;
      } else if (o.type === T_CHEESE) {
        o.collected = true;
        st.cheese++;
        st.score += CHEESE_POINTS;
        res.collected.push({ type: 'cheese', points: CHEESE_POINTS });
      } else if (o.type === T_COIN) {
        o.collected = true;
        st.coins++;
        st.score += COIN_POINTS;
        res.collected.push({ type: 'coin', points: COIN_POINTS });
      }
    }

    // ---- aufraeumen: Objekte die links raus sind ODER eingesammelt wurden entfernen ----
    // Deterministisch (kein rng), identisch in Live/Replay -> beeinflusst Score nicht.
    if (st.objects.length && (st.frame % 30 === 0)) {
      st.objects = st.objects.filter(o => !o.collected && o.x + o.w > -(50 * SCALE));
    }

    res.over = st.over;
    return res;
  }

  /* Server-Replay: Runde aus seed + Frame-Input-Log nachrechnen.
     inputLog = Array pro Frame; jeder Eintrag ist ein Array von Aktionen
     (leeres Array = kein Input in dem Frame).
     Gibt {score, over, frames, valid} zurueck.
     valid=false wenn das Log inkonsistent ist (z.B. Frames nach Game-Over). */
  function replay(seed, inputLog) {
    const st = create(seed);
    const log = Array.isArray(inputLog) ? inputLog : [];
    let applied = 0;
    for (let i = 0; i < log.length; i++) {
      if (st.over) {
        // Input nach Game-Over ist ungueltig.
        return { score: st.score, over: st.over, frames: applied, valid: false, reason: 'input-after-over' };
      }
      const fi = Array.isArray(log[i]) ? log[i] : [];
      // Nur bekannte Aktionen zulassen.
      for (const a of fi) {
        if (a !== 'jump') return { score: st.score, over: st.over, frames: applied, valid: false, reason: 'unknown-action' };
      }
      step(st, fi);
      applied++;
    }
    return { score: st.score, over: st.over, frames: applied, valid: true };
  }

  return {
    SCALE, FPS, WORLD_W, WORLD_H, GROUND_Y,
    GOAT_X, GOAT_W, GOAT_H,
    T_OBSTACLE_GROUND, T_OBSTACLE_AIR, T_CHEESE, T_COIN,
    CHEESE_POINTS, COIN_POINTS,
    mulberry32, create, step, replay,
    // fuer Renderer/Tests:
    speedAt, gapBounds,
  };
});
