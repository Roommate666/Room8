/* ============================================================================
 * Goat Blast — deterministischer Core (Single Source of Truth)
 * ----------------------------------------------------------------------------
 * DOM-frei, laeuft identisch im Browser (Spiel) und in Deno (Server-Replay).
 * Gleicher (seed, mode, Zug-Liste mit Zeitstempeln) -> exakt gleicher Score.
 * Anti-Cheat: der Server rechnet die Runde hiermit nach (specs/goat-leaderboard.md).
 *
 * WICHTIG: Reihenfolge der rng()-Aufrufe MUSS 1:1 der Live-Logik entsprechen,
 * sonst driften Client und Server. Aenderungen an Regeln immer HIER machen und
 * das Spiel diesen Core nutzen lassen (kein Parallel-Code).
 * ========================================================================== */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod; // Node/Deno CommonJS
  root.GoatCore = mod;                                                       // Browser + Deno global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIZE = 8;
  const LINES_PER_LEVEL = 6, MAX_LEVEL = 15;
  const GOATMODE_AT = 4;
  const HEAT_MS = 15000, HEAT_MS_GOAT = 15000;   // laengeres Kombo-Fenster (keine Timeline im UI)
  const GOLD_CHANCE = 0, CHILI_CHANCE = 0;        // Specials raus (kein Gold/Chili)
  const COLOR_COUNT = 6; // Anzahl Kaese-Farben (Wert egal fuers Scoring, aber rng-Zug zaehlt)

  const SHAPES = [
    { c: [[0,0]], t:1 },
    { c: [[0,0],[0,1]], t:1 }, { c: [[0,0],[1,0]], t:1 },
    { c: [[0,0],[0,1],[0,2]], t:1 }, { c: [[0,0],[1,0],[2,0]], t:1 },
    { c: [[0,0],[0,1],[1,0],[1,1]], t:1 },
    { c: [[0,0],[1,0],[1,1]], t:1 }, { c: [[0,1],[1,0],[1,1]], t:1 },
    { c: [[0,0],[0,1],[1,1]], t:1 }, { c: [[0,0],[0,1],[1,0]], t:1 },
    { c: [[0,0],[0,1],[0,2],[0,3]], t:2 }, { c: [[0,0],[1,0],[2,0],[3,0]], t:2 },
    { c: [[0,0],[1,0],[2,0],[2,1]], t:2 }, { c: [[0,1],[1,1],[2,1],[2,0]], t:2 },
    { c: [[0,0],[0,1],[1,1],[1,2]], t:2 }, { c: [[0,1],[0,2],[1,0],[1,1]], t:2 },
    { c: [[0,0],[0,1],[0,2],[1,1]], t:2 },
    { c: [[0,0],[0,1],[0,2],[0,3],[0,4]], t:3 }, { c: [[0,0],[1,0],[2,0],[3,0],[4,0]], t:3 },
    { c: [[0,0],[0,1],[0,2],[1,0],[2,0]], t:3 }, { c: [[0,0],[0,1],[0,2],[1,2],[2,2]], t:3 },
    { c: [[0,1],[1,0],[1,1],[1,2],[2,1]], t:3 },
    { c: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], t:4 },
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- reine Helfer (arbeiten auf grid = SIZE x SIZE Array, null oder {t,...}) ----
  function emptyGrid() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(null)); }
  function canPlaceAt(grid, cells, R, C) {
    for (const [r, c] of cells) {
      const rr = R + r, cc = C + c;
      if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE || grid[rr][cc]) return false;
    }
    return true;
  }
  function anyPlacement(grid, cells) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlaceAt(grid, cells, r, c)) return true;
    return false;
  }
  function findFullLines(grid) {
    const rows = [], cols = [];
    for (let r = 0; r < SIZE; r++) if (grid[r].every(v => v)) rows.push(r);
    for (let c = 0; c < SIZE; c++) { let f = true; for (let r = 0; r < SIZE; r++) if (!grid[r][c]) { f = false; break; } if (f) cols.push(c); }
    return { rows, cols };
  }
  // Gewichtung nach Groesse: selten 1-/2-Zeller, viele 3-5er + regelmaessig das 3x3.
  // -> schnelleres Fuellen, mehr Linien, mehr Spass (wie im Genre ueblich).
  function piecePool(level) {
    const pool = [];
    for (const s of SHAPES) {
      const n = s.c.length;
      let w;
      if (n === 1) w = 2;                 // Einzelblock: flexibelster Stein -> etwas haeufiger (leichter)
      else if (n === 2) w = 4;            // Domino: sehr flexibel
      else if (n === 3) w = 6;            // Tromino: haeufigster Stein
      else if (n === 4) w = 5;            // 4er: haeufig
      else if (n === 5) w = 3;            // 5er: seltener (schwer zu platzieren)
      else w = level < 3 ? 1 : 2;         // 3x3 (9 Zellen): selten (killt oft das Feld)
      for (let i = 0; i < w; i++) pool.push(s);
    }
    return pool;
  }
  function newPiece(rng, level) {
    const pool = piecePool(level);
    const s = pool[Math.floor(rng() * pool.length)];
    const p = { cells: s.c, color: Math.floor(rng() * COLOR_COUNT), special: null };
    const roll = rng();
    if (roll < CHILI_CHANCE) p.special = { i: Math.floor(rng() * s.c.length), t: 'x' };
    else if (roll < CHILI_CHANCE + GOLD_CHANCE) p.special = { i: Math.floor(rng() * s.c.length), t: 'g' };
    return p;
  }
  // Quests geben Bonus-Punkte -> muessen im Core sein (sonst nicht replaybar).
  // ev(e) mit e={lines,gold,chili,streakNow}. Reihenfolge = Anzeige-Reihenfolge im Spiel.
  const QUESTS = [
    { goal: 1, ev: e => (e.lines >= 2 ? 1 : 0) },
    { goal: 4, ev: e => e.lines },
    { goal: 1, ev: e => (e.streakNow >= 3 ? 1 : 0) },
    { goal: 1, ev: e => (e.lines >= 3 ? 1 : 0) },
    { goal: 6, ev: e => e.lines },
    { goal: 1, ev: e => (e.streakNow >= 5 ? 1 : 0) },
  ];
  function moldCadence(level) { return 0; }   // kein Schimmel mehr
  function bombCadence(level) { return 0; }    // keine Bombe mehr
  function heatDur(streak) { return streak >= GOATMODE_AT ? HEAT_MS_GOAT : HEAT_MS; }
  function mult(streak) { return Math.min(1 + streak * 0.5, 5); }

  // Startfeld freundlich vorbefuellen: WENIG (~26-36%) und in ZUSAMMENHAENGENDEN Clustern
  // in EINER Haelfte (mal oben, mal unten, seeded) -> die andere Haelfte bleibt frei,
  // damit man die ersten Zuege locker platzieren kann. Deterministisch via seed.
  function prefillGrid(st) {
    const total = SIZE * SIZE;
    const target = Math.floor(total * (0.16 + st._rng() * 0.10)); // 16-26 % (leichter: mehr Startplatz)
    const h = (SIZE / 2) | 0;
    const topHalf = st._rng() < 0.5;             // mal obere, mal untere Haelfte befuellen (variiert)
    const rMin = topHalf ? 0 : h, rMax = topHalf ? h : SIZE; // andere Haelfte bleibt frei
    let filled = 0, guard = 0;
    while (filled < target && guard < 3000) {
      guard++;
      const r0 = rMin + Math.floor(st._rng() * (rMax - rMin));
      const c0 = Math.floor(st._rng() * SIZE);
      const len = 2 + Math.floor(st._rng() * 4);   // Cluster-Laenge 2-5
      const horiz = st._rng() < 0.5;
      for (let k = 0; k < len && filled < target; k++) {
        const rr = r0 + (horiz ? 0 : k), cc = c0 + (horiz ? k : 0);
        if (rr >= rMin && cc >= 0 && rr < rMax && cc < SIZE && !st.grid[rr][cc]) { // in gewaehlter Haelfte bleiben
          st.grid[rr][cc] = { c: Math.floor(st._rng() * COLOR_COUNT), t: 'n' };
          filled++;
        }
      }
    }
    // keine komplette Zeile/Spalte am Start (sonst Auto-Clear)
    for (let r = 0; r < SIZE; r++) if (st.grid[r].every(v => v)) st.grid[r][Math.floor(st._rng() * SIZE)] = null;
    for (let c = 0; c < SIZE; c++) { let full = true; for (let r = 0; r < SIZE; r++) if (!st.grid[r][c]) { full = false; break; } if (full) st.grid[Math.floor(st._rng() * SIZE)][c] = null; }
  }

  function create(seed, mode) {
    const st = {
      seed: seed | 0, mode: mode || 'high',
      grid: emptyGrid(),
      score: 0, level: 1, linesTotal: 0, streak: 0, placements: 0,
      questIdx: 0, questProg: 0,
      heat: 0, heatLast: 0, tMs: 0,
      tray: null, nextTray: [], over: false,
      _rng: mulberry32(seed | 0),
    };
    prefillGrid(st);
    refillTray(st);
    return st;
  }
  // ---- Loesbarkeits-Garantie ----------------------------------------------
  // Ziehe den Tray so, dass ALLE 3 Steine (in irgendeiner Reihenfolge, mit Zeilen-Clear
  // zwischendurch) aufs aktuelle Feld passen. -> Wer richtig kombiniert, kommt IMMER weiter;
  // man verliert nur durch eigene Fehlplatzierung, nie durch Pech. Deterministisch (st._rng+st.grid),
  // daher server-replay-sicher. budget = Knoten-Limit gegen Lag (fail-open bei sehr teuren Boards).
  function cloneApply(grid, cells, R, C) {
    const g = grid.map(row => row.slice());
    for (const [r, c] of cells) g[R + r][C + c] = { t: 'n', c: 0 };
    const fl = findFullLines(g);
    for (const r of fl.rows) for (let c = 0; c < SIZE; c++) g[r][c] = null;
    for (const c of fl.cols) for (let r = 0; r < SIZE; r++) g[r][c] = null;
    return g;
  }
  function solveTray(grid, pieces, budget) {
    if (pieces.length === 0) return true;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const rest = pieces.slice(0, i).concat(pieces.slice(i + 1));
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        if (budget.n <= 0) return true;            // Zeit-Limit -> fail-open (Responsivitaet)
        budget.n--;
        if (canPlaceAt(grid, p.cells, r, c) && solveTray(cloneApply(grid, p.cells, r, c), rest, budget)) return true;
      }
    }
    return false;
  }
  function trayPlaceable(grid, pieces) { return solveTray(grid, pieces, { n: 9000 }); }
  function dealSolvable(st) {
    let trio, guard = 0;
    do {
      trio = [newPiece(st._rng, st.level), newPiece(st._rng, st.level), newPiece(st._rng, st.level)];
      guard++;
    } while (!trayPlaceable(st.grid, trio) && guard < 20);
    return trio;
  }
  function refillTray(st) {
    // Vorschau (nextTray) uebernehmen, ABER gegen das AKTUELLE Feld auf Loesbarkeit pruefen;
    // wenn sie nicht (mehr) passt, frisch loesbar ziehen.
    let t = (st.nextTray && st.nextTray.length === 3) ? st.nextTray : null;
    if (!t || !trayPlaceable(st.grid, t)) t = dealSolvable(st);
    st.tray = t;
    st.nextTray = dealSolvable(st);
  }
  function updateLevel(st) {
    const nl = Math.min(MAX_LEVEL, Math.floor(st.linesTotal / LINES_PER_LEVEL) + 1);
    const up = nl > st.level;
    st.level = nl;
    return up;
  }
  // Zeit bis tMs vorspulen: Heat linear abbauen; bei <=0 Streak loeschen (wie Echtzeit-heatTick)
  function advanceTime(st, tMs) {
    if (tMs == null) return;
    if (st.heat > 0) {
      st.heat -= (tMs - st.heatLast) / heatDur(st.streak);
      if (st.heat <= 0) { st.heat = 0; st.streak = 0; }
    }
    st.heatLast = tMs;
    st.tMs = tMs;
  }
  function igniteHeat(st) { st.heat = 1; st.heatLast = st.tMs; }

  // tickBombs: alle Bomben -1; Explosion (timer<=0) => Game Over
  function tickBombs(st) {
    let boom = false;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = st.grid[r][c];
      if (v && v.t === 'b') { v.timer--; if (v.timer <= 0) boom = true; }
    }
    return boom;
  }
  function maybeSpawnMold(st) {
    const cad = moldCadence(st.level);
    if (!cad || st.placements % cad !== 0) return null;
    const empty = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!st.grid[r][c]) empty.push([r, c]);
    if (empty.length <= 6) return null;
    const [r, c] = empty[Math.floor(st._rng() * empty.length)];
    st.grid[r][c] = { t: 'm' };
    return [r, c];
  }
  function maybeSpawnBomb(st) {
    const cad = bombCadence(st.level);
    if (!cad || st.placements % cad !== 0) return null;
    const empty = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!st.grid[r][c]) empty.push([r, c]);
    if (empty.length <= 8) return null;
    const [r, c] = empty[Math.floor(st._rng() * empty.length)];
    st.grid[r][c] = { t: 'b', timer: 12 };
    return [r, c];
  }

  /* Zug ausfuehren. tMs = Zeitstempel (ms seit Rundenstart) fuer Heat-Abbau.
     Gibt ein Ergebnis-Objekt zurueck, aus dem der Renderer Animationen ableitet. */
  function place(st, idx, R, C, tMs) {
    if (st.over) return { ok: false, reason: 'over' };
    const p = st.tray && st.tray[idx];
    if (!p) return { ok: false, reason: 'empty-slot' };
    if (!canPlaceAt(st.grid, p.cells, R, C)) return { ok: false, reason: 'blocked' };

    advanceTime(st, tMs);

    // Stein setzen (Specials in die markierte Zelle)
    p.cells.forEach(([r, c], i) => {
      let cellVal = { c: p.color, t: 'n' };
      if (p.special && p.special.i === i) cellVal = p.special.t === 'g' ? { t: 'g' } : { t: 'x' };
      st.grid[R + r][C + c] = cellVal;
    });
    st.tray[idx] = null;
    st.placements++;

    const res = { ok: true, basePts: 0, clearSet: [], boomSet: [], rows: [], cols: [], nLines: 0,
      gold: 0, chili: 0, clearPts: 0, perfect: false, levelUp: false,
      spawnedMold: null, spawnedBomb: null, bombExploded: false, trayRefilled: false };

    // Basis-Punkte (mit Streak VOR Erhoehung)
    res.basePts = Math.round(p.cells.length * mult(st.streak));
    st.score += res.basePts;

    const { rows, cols } = findFullLines(st.grid);
    res.rows = rows; res.cols = cols;
    const nLines = rows.length + cols.length;
    res.nLines = nLines;

    if (nLines > 0) {
      st.streak++;
      igniteHeat(st);
      st.linesTotal += nLines;

      const clearSet = new Set();
      rows.forEach(r => { for (let c = 0; c < SIZE; c++) clearSet.add(r * SIZE + c); });
      cols.forEach(c => { for (let r = 0; r < SIZE; r++) clearSet.add(r * SIZE + c); });

      let chili = 0, gold = 0; const boomSet = new Set();
      clearSet.forEach(i => {
        const r = (i / SIZE) | 0, c = i % SIZE, v = st.grid[r][c];
        if (v && v.t === 'x') {
          chili++;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE && st.grid[rr][cc]) boomSet.add(rr * SIZE + cc);
          }
        }
        if (v && v.t === 'g') gold++;
      });
      boomSet.forEach(i => clearSet.add(i));

      const m = mult(st.streak);
      let pts = Math.round(nLines * 10 * nLines * m);
      if (gold) pts += Math.round(gold * 50 * m);
      if (chili) pts += Math.round(boomSet.size * 4 * m);

      // Zellen entfernen
      clearSet.forEach(i => { st.grid[(i / SIZE) | 0][i % SIZE] = null; });

      // Perfect Clear
      if (st.grid.every(row => row.every(c => !c))) {
        pts += Math.round(300 * mult(st.streak));
        res.perfect = true;
      }
      st.score += pts;

      res.clearSet = Array.from(clearSet);
      res.boomSet = Array.from(boomSet);
      res.gold = gold; res.chili = chili; res.clearPts = pts;
      res.levelUp = updateLevel(st);

      // Quests (Bonus-Punkte, deterministisch -> sofortige Weiterschaltung statt 1400ms-Timer)
      const qe = { lines: nLines, gold, chili, streakNow: st.streak };
      const q = QUESTS[st.questIdx % QUESTS.length];
      const add = q.ev(qe) || 0;
      if (add) {
        st.questProg = Math.min(q.goal, st.questProg + add);
        if (st.questProg >= q.goal) {
          const bonus = Math.round(150 * mult(st.streak));
          st.score += bonus;
          res.questDone = true; res.questBonus = bonus;
          st.questIdx++; st.questProg = 0;
        }
      }
    }

    // afterMove-Reihenfolge EXAKT wie Live: tickBombs -> mold -> bomb -> refill -> gameover
    if (tickBombs(st)) { st.over = true; res.bombExploded = true; res.over = true; return res; }
    res.spawnedMold = maybeSpawnMold(st);
    res.spawnedBomb = maybeSpawnBomb(st);
    if (st.tray.every(x => !x)) { refillTray(st); res.trayRefilled = true; }
    if (!st.tray.some(x => x && anyPlacement(st.grid, x.cells))) { st.over = true; }
    res.over = st.over;
    return res;
  }

  /* Server-Replay: Runde aus seed + Zug-Liste nachrechnen. moves = [{idx,r,c,t}].
     Gibt {score, over, moves, valid} zurueck. valid=false wenn ein Zug illegal war. */
  function replay(seed, mode, moves) {
    const st = create(seed, mode);
    let applied = 0;
    for (const mv of (moves || [])) {
      const r = place(st, mv.idx, mv.r, mv.c, mv.t);
      if (!r.ok) return { score: st.score, over: st.over, moves: applied, valid: false, reason: r.reason };
      applied++;
      if (st.over) break;
    }
    return { score: st.score, over: st.over, moves: applied, valid: true };
  }

  return { SIZE, MAX_LEVEL, SHAPES, mulberry32, create, place, replay,
    advanceTime, igniteHeat,
    // fuer Tests/Renderer exportiert:
    canPlaceAt, anyPlacement, findFullLines, piecePool, mult, _internal: { newPiece, moldCadence, bombCadence } };
});
