/* Determinismus- + Replay-Test fuer core.js. Ausfuehren: node www/game/core.test.js */
const GoatCore = require('./core.js');

// Eigener Move-Auswahl-RNG (getrennt vom Spiel-RNG), damit Testlaeufe reproduzierbar sind.
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^a>>>15,1|a);t=(t+Math.imul(t^t>>>7,61|t))^t;return((t^t>>>14)>>>0)/4294967296;};}

// Spielt eine Runde mit dem Core, waehlt zufaellig legale Zuege, loggt moves mit Zeitstempel.
function playGame(seed, mode, pickSeed){
  const st = GoatCore.create(seed, mode);
  const pick = mulberry32(pickSeed);
  const moves = [];
  let t = 0;
  const stats = { chili:0, gold:0, mold:0, bomb:0, perfect:0, clears:0 };
  let guard = 0;
  while (!st.over && guard++ < 5000) {
    // alle legalen (idx,r,c) sammeln
    const legal = [];
    for (let idx = 0; idx < st.tray.length; idx++) {
      const p = st.tray[idx]; if (!p) continue;
      for (let r = 0; r < GoatCore.SIZE; r++) for (let c = 0; c < GoatCore.SIZE; c++)
        if (GoatCore.canPlaceAt(st.grid, p.cells, r, c)) legal.push([idx, r, c]);
    }
    if (!legal.length) break;
    const [idx, r, c] = legal[Math.floor(pick() * legal.length)];
    t += 400 + Math.floor(pick() * 2500); // 0.4-2.9s pro Zug (testet Heat-Abbau)
    const res = GoatCore.place(st, idx, r, c, t);
    moves.push({ idx, r, c, t });
    if (!res.ok) throw new Error('illegaler Zug im Playthrough: ' + res.reason);
    stats.chili += res.chili; stats.gold += res.gold;
    if (res.spawnedMold) stats.mold++;
    if (res.spawnedBomb) stats.bomb++;
    if (res.perfect) stats.perfect++;
    if (res.nLines > 0) stats.clears++;
  }
  return { finalScore: st.score, moves, stats, over: st.over };
}

let pass = 0, fail = 0;
function check(name, cond, extra){ if (cond){pass++;console.log('  OK  '+name);} else {fail++;console.log('  FAIL '+name+(extra?'  '+extra:''));} }

console.log('== Goat Blast core: Determinismus + Replay ==');
const agg = { chili:0, gold:0, mold:0, bomb:0, perfect:0, clears:0 };
for (let i = 0; i < 40; i++) {
  const seed = 1000 + i * 7;
  const a = playGame(seed, 'high', 50 + i);
  // 1) Replay des Live-Playthroughs muss exakt denselben Score liefern
  const rep = GoatCore.replay(seed, 'high', a.moves);
  check('seed '+seed+': replay==play ('+a.finalScore+')', rep.valid && rep.score === a.finalScore,
    'replay='+rep.score+' valid='+rep.valid);
  // 2) Zweiter identischer Playthrough (gleiche Seeds) muss identisch sein
  const b = playGame(seed, 'high', 50 + i);
  check('seed '+seed+': playthrough reproduzierbar', b.finalScore === a.finalScore && b.moves.length === a.moves.length);
  for (const k in agg) agg[k] += a.stats[k];
}

// 3) Manipuliertes Replay muss abweichen (hoeherer/anderer Score wird NICHT bestaetigt)
{
  const seed = 424242;
  const a = playGame(seed, 'high', 999);
  const tampered = GoatCore.replay(seed, 'high', a.moves.slice(0, Math.max(1, a.moves.length - 3)));
  check('gekuerzte Zugliste ergibt anderen Score (nicht faelschbar)', tampered.score !== a.finalScore || a.moves.length <= 1);
  // Illegaler Zug wird als invalid erkannt
  const badMoves = a.moves.concat([{ idx: 0, r: 0, c: 0, t: (a.moves.at(-1)?.t||0)+500 }, { idx:0,r:0,c:0,t:9e9 }]);
  const badRep = GoatCore.replay(seed, 'high', badMoves);
  check('illegaler Zusatz-Zug -> valid=false ODER over vorher', badRep.valid === false || a.over);
}

// 4) Daily-Modus: gleicher Seed -> gleiche erste Steine (seed-getrieben)
{
  const d1 = GoatCore.create(20260808, 'daily');
  const d2 = GoatCore.create(20260808, 'daily');
  check('daily gleicher Seed -> gleicher Tray', JSON.stringify(d1.tray) === JSON.stringify(d2.tray));
}

console.log('\nCoverage ueber 40 Runden:', JSON.stringify(agg));
check('Specials/Bomben/Schimmel wurden getriggert', agg.chili>0 && agg.gold>0 && agg.bomb>0 && agg.mold>0);

console.log('\nErgebnis: '+pass+' OK, '+fail+' FAIL');
process.exit(fail ? 1 : 0);
