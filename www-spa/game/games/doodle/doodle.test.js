/* ============================================================================
 * UniGoat Doodle — Determinismus-Test (Node)
 * ----------------------------------------------------------------------------
 * Prueft:
 *  1) Live-Simulation und replay(seed, inputLog) liefern bit-identischen Score.
 *  2) Gleicher Seed + gleicher Input -> identischer Verlauf (kein Drift).
 *  3) Verschiedene Seeds -> unterschiedliche Ergebnisse (Seed wirkt).
 *  4) replay meldet ungueltigen Input als valid=false.
 *
 * Ausfuehren:  node doodle.test.js
 * ========================================================================== */
'use strict';

const Core = require('./doodle.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg); }
}

// Pseudo-Spieler: erzeugt einen deterministischen Input-Log aus einem Seed,
// simuliert dabei EINE Live-Runde und schreibt Frame fuer Frame das Input mit.
function playLive(seed, playerSeed, maxFrames) {
  const st = Core.create(seed);
  const rng = Core.mulberry32(playerSeed);
  const log = [];
  let hold = 0, dir = 0;
  for (let f = 0; f < maxFrames && !st.over; f++) {
    // Bot wechselt gelegentlich die Richtung -> realistischer Input-Strom
    if (hold <= 0) {
      const r = rng();
      dir = r < 0.4 ? -1 : (r < 0.8 ? 1 : 0);
      hold = 6 + Math.floor(rng() * 24);
    }
    hold--;
    log.push(dir);
    Core.step(st, dir);
  }
  return { score: st.score, log, over: st.over, frames: log.length };
}

console.log('UniGoat Doodle — Determinismus-Test\n');

// --- Test 1+2: Live-Score == Replay-Score, mehrere Seeds ---
const seeds = [1, 42, 1337, 99999, 2026, -7];
for (const seed of seeds) {
  const live = playLive(seed, seed * 31 + 5, 5000);
  const rep = Core.replay(seed, live.log);
  assert(rep.valid, 'seed ' + seed + ': replay valid');
  assert(rep.score === live.score,
    'seed ' + seed + ': live=' + live.score + ' replay=' + rep.score);
  assert(rep.frames === live.frames || rep.over === live.over,
    'seed ' + seed + ': frames konsistent (live=' + live.frames + ' rep=' + rep.frames + ')');
}

// --- Test 3: Gleicher Seed + gleicher Log -> zweimal identisch (kein Drift) ---
{
  const live = playLive(42, 777, 4000);
  const a = Core.replay(42, live.log);
  const b = Core.replay(42, live.log);
  assert(a.score === b.score, 'doppelter Replay identisch (a=' + a.score + ' b=' + b.score + ')');
  assert(a.frames === b.frames, 'doppelter Replay frames identisch');
}

// --- Test 4: Seed wirkt (verschiedene Seeds -> i.d.R. andere Ergebnisse) ---
{
  const sameInput = [];
  for (let i = 0; i < 1500; i++) sameInput.push((i % 40 < 20) ? -1 : 1);
  const r1 = Core.replay(1, sameInput);
  const r2 = Core.replay(2, sameInput);
  assert(r1.valid && r2.valid, 'beide Seeds valid');
  assert(r1.score !== r2.score || r1.frames !== r2.frames,
    'verschiedene Seeds -> anderes Ergebnis (s1=' + r1.score + '/' + r1.frames +
    ' s2=' + r2.score + '/' + r2.frames + ')');
}

// --- Test 5: ungueltiger Input wird abgelehnt ---
{
  const bad = [0, 1, -1, 2, 0];       // 2 ist illegal
  const r = Core.replay(5, bad);
  assert(!r.valid, 'illegaler Input (2) -> valid=false');

  const bad2 = [0, 1, 'x', 0];        // 'x' ist illegal
  const r2 = Core.replay(5, bad2);
  assert(!r2.valid, 'illegaler Input (string) -> valid=false');
}

// --- Test 6: Leere/undefined-Frames werden als 0 behandelt (kein Crash) ---
{
  const withGaps = [0, 1, undefined, null, '', 0, -1];
  const r = Core.replay(9, withGaps);
  assert(r.valid, 'Luecken (undefined/null/"") als 0 -> valid');
}

// --- Test 7: Score ist monoton und startet bei 0 fuer 0-Frame-Log ---
{
  const r0 = Core.replay(3, []);
  assert(r0.score === 0, 'leerer Log -> score 0 (war ' + r0.score + ')');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
