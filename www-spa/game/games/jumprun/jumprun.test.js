/* ============================================================================
 * UniGoat Jump'n'Run — Determinismus-Test (Node)
 * ----------------------------------------------------------------------------
 * Prueft: gleicher Seed + gleiches Frame-Input-Log -> identischer Score,
 * ueber zwei unabhaengige Laeufe. Zusaetzlich: replay() liefert bit-identisch
 * denselben Score wie ein manueller step()-Lauf (Anti-Cheat-Kern).
 *
 * Ausfuehren:  node www/game/games/jumprun/jumprun.test.js
 * ========================================================================== */
'use strict';

const Core = require('./jumprun.js');

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  PASS: ' + msg);
  } else {
    console.error('  FAIL: ' + msg);
    failed++;
  }
}

// Deterministisches Input-Log aus dem SEED selbst erzeugen (kein Math.random,
// damit der Test selbst reproduzierbar ist). Ergibt "sinnvolles" Spiel:
// gelegentlich springen.
function buildInputLog(seed, frames) {
  const rng = Core.mulberry32(seed | 0);
  const log = [];
  for (let i = 0; i < frames; i++) {
    // ca. alle ~28 Frames ein Sprung-Versuch (Wert aus rng, deterministisch)
    log.push(rng() < 0.035 ? ['jump'] : []);
  }
  return log;
}

// Einen vollen Lauf ueber step() rechnen und Endstand zurueckgeben.
function runManual(seed, log) {
  const st = Core.create(seed);
  let frames = 0;
  for (let i = 0; i < log.length; i++) {
    if (st.over) break;
    Core.step(st, log[i]);
    frames++;
  }
  return { score: st.score, over: st.over, frames: frames, cheese: st.cheese, coins: st.coins };
}

console.log('UniGoat Jump\'n\'Run — Determinismus-Test\n');

const SEED = 1337;
const FRAMES = 60 * 60; // 60 Sekunden Simulation
const log = buildInputLog(SEED, FRAMES);

// --- Test 1: zwei manuelle Laeufe, gleicher Seed + gleiches Log ---
const runA = runManual(SEED, log);
const runB = runManual(SEED, log);
console.log('Lauf A:', JSON.stringify(runA));
console.log('Lauf B:', JSON.stringify(runB));
assert(runA.score === runB.score, 'zwei Laeufe -> identischer Score (' + runA.score + ')');
assert(runA.frames === runB.frames, 'zwei Laeufe -> identische Frame-Zahl (' + runA.frames + ')');
assert(runA.over === runB.over, 'zwei Laeufe -> identischer Game-Over-Status');
assert(runA.cheese === runB.cheese && runA.coins === runB.coins, 'zwei Laeufe -> identische Sammel-Zaehler');

// --- Test 2: replay() == manueller Lauf (bit-identisch) ---
// Nur den Teil des Logs verwenden, den der manuelle Lauf tatsaechlich gespielt
// hat (replay verbietet Input nach Game-Over).
const playedLog = log.slice(0, runA.frames);
const rep = Core.replay(SEED, playedLog);
console.log('Replay :', JSON.stringify(rep));
assert(rep.valid === true, 'replay meldet valid=true');
assert(rep.score === runA.score, 'replay-Score == Live-Score (' + rep.score + ' == ' + runA.score + ')');
assert(rep.frames === runA.frames, 'replay spielt gleiche Frame-Zahl (' + rep.frames + ')');

// --- Test 3: anderer Seed -> (sehr wahrscheinlich) anderer Verlauf ---
const other = runManual(4242, buildInputLog(4242, FRAMES));
assert(other.score !== runA.score || other.frames !== runA.frames,
  'anderer Seed erzeugt anderen Verlauf (Score/Frames unterscheiden sich)');

// --- Test 4: Input nach Game-Over wird als invalid erkannt ---
if (runA.over) {
  const tooLong = log.slice(0, runA.frames + 5); // ein paar Frames zu viel
  const bad = Core.replay(SEED, tooLong);
  assert(bad.valid === false, 'replay erkennt Input nach Game-Over als invalid');
} else {
  console.log('  SKIP: Lauf endete nicht mit Game-Over (Test 4 uebersprungen)');
}

// --- Test 5: unbekannte Aktion -> invalid ---
const bad2 = Core.replay(SEED, [['jump'], ['fly'], []]);
assert(bad2.valid === false, 'replay erkennt unbekannte Aktion als invalid');

console.log('');
if (failed === 0) {
  console.log('ALLE TESTS BESTANDEN.');
  process.exit(0);
} else {
  console.error(failed + ' TEST(S) FEHLGESCHLAGEN.');
  process.exit(1);
}
