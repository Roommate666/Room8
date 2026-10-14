// v2.5.1 Marketing-Screenshots: 7 Screens inkl. Duell + Freunde. Demo = redbull-demo.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://unigoat.de';
const EMAIL = 'redbull-demo@unigoat.de', PASS = 'RedBull2026!';
const ROOT = process.env.HOME + '/Desktop/unigoat-store-marketing-v251';
fs.mkdirSync(ROOT, { recursive: true });
const COUPON = 'd399fab9-78bc-4da8-bd78-c250f2048649';

const screens = [
  { key: 'coupons', url: '/coupons.html',                    h1: 'Studenten-Deals<br>in deiner Stadt', h2: 'Verifizieren · einlösen · sparen' },
  { key: 'duel',    url: '/game/duel.html',                  h1: 'Fordere Freunde<br>zum Duell',       h2: 'Wette G-Coins, gewinne den Pot' },
  { key: 'game',    url: '/game/index.html',                 h1: 'Spiel dich<br>an die Spitze',        h2: 'Täglich zocken, G-Coins sammeln' },
  { key: 'deal',    url: '/coupon-detail.html?id=' + COUPON, h1: 'Einlösen mit<br>QR-Code',            h2: 'Dein Deal, direkt vor Ort' },
  { key: 'friends', url: '/friends.html',                    h1: 'Zock mit<br>deinen Freunden',        h2: 'Einladen, adden, herausfordern' },
  { key: 'rang',    url: '/challenge.html',                  h1: 'Monats-<br>Challenge',               h2: 'Die Top 3 gewinnen echte Preise' },
  { key: 'profil',  url: '/profile.html',                    h1: 'Sammle G-Coins,<br>level auf',       h2: 'Belohnungen mit jedem Deal' },
];

const devices = [
  { dir: 'iphone-6.9-1320x2868', W: 1320, H: 2868 },
  { dir: 'iphone-6.7-1290x2796', W: 1290, H: 2796 },
];

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
await page.fill('#loginEmail', EMAIL); await page.fill('#loginPassword', PASS); await page.click('#loginBtn');
await page.waitForTimeout(4500);

const raw = {};
for (const s of screens) {
  await page.goto(BASE + s.url, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2800);

  if (s.key === 'game') {
    await page.click('#btnHigh').catch(() => {});
    await page.waitForTimeout(1400);
    await page.click('#helpClose').catch(() => {});
    await page.evaluate(() => {
      var hp = document.getElementById('helpPanel'); if (hp) hp.hidden = true;
      var sp = document.getElementById('goatSpeech'); if (sp) sp.classList.remove('show');
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const cells = document.querySelectorAll('#board .cell');
      const tones = ['tg', 'tx', 'tm'];
      cells.forEach((c, idx) => {
        const r = Math.floor(idx / 8), col = idx % 8;
        if (r >= 2 && col <= r - 1) { c.className = 'cell filled ' + tones[(r + col) % tones.length]; c.textContent = ''; }
      });
      const sc = document.getElementById('score'); if (sc) sc.textContent = '12.480';
    });
    await page.waitForTimeout(600);
  }

  if (s.key === 'duel') {
    // Lobby aus, Spiel-Ansicht an + realistischer Duell-Zustand (kein echtes Match noetig)
    await page.evaluate(() => {
      var lobby = document.getElementById('lobby'); if (lobby){ lobby.classList.add('hidden'); lobby.style.display='none'; }
      var game = document.getElementById('game'); if (game){ game.classList.remove('hidden'); game.style.display='block'; }
      var set = (id,v)=>{ var e=document.getElementById(id); if(e) e.textContent=v; };
      set('meName','Du'); set('meScore','9.240'); set('oppName','Jonas'); set('oppScore','7.680');
      set('coinBar','1.240'); set('gameWagerN','50');
      var wp=document.getElementById('gameWager'); if(wp) wp.classList.remove('hidden');
      // Board 8x8 als realistischer Stapel fuellen (mint)
      var board=document.getElementById('board');
      if(board){
        board.innerHTML='';
        for(var i=0;i<64;i++){ var c=document.createElement('div'); c.className='cell'; board.appendChild(c); }
        var heights=[4,5,3,6,5,4,6,3];
        var filled={};
        for(var col=0;col<8;col++){ for(var k=0;k<heights[col];k++){ filled[(7-k)*8+col]=1; } }
        delete filled[7*8+3]; delete filled[6*8+5]; delete filled[5*8+0];
        Object.keys(filled).forEach(function(idx){ var cell=board.children[idx]; if(cell) cell.className='cell filled'; });
      }
      // Gegner-Mini-Board leicht fuellen
      var mini=document.getElementById('oppMini');
      if(mini){ mini.innerHTML=''; for(var m=0;m<64;m++){ var mc=document.createElement('i'); if([56,57,48,49,58,50,40].indexOf(m)>=0) mc.style.background='var(--mint,#12B489)'; mini.appendChild(mc);} }
    });
    await page.waitForTimeout(600);
  }

  if (s.key === 'friends') {
    await page.evaluate(() => {
      var fr=document.getElementById('frList'); var fc=document.getElementById('frCount');
      if(fc) fc.textContent='4';
      if(fr){ fr.innerHTML=[
        ['Jonas K.','3.420 G-Coins · Ulm'],['Mara S.','5.980 G-Coins · Neu-Ulm'],
        ['Elias B.','2.140 G-Coins · Ulm'],['Sophie L.','7.310 G-Coins · Augsburg']
      ].map(function(x){ return '<div class="row"><div class="frname"><i class="sq"></i><div>'+
        '<div class="row-title">'+x[0]+'</div><div class="row-sub tnum">'+x[1]+'</div></div></div>'+
        '<div class="fr-actions"><button class="btn btn-secondary btn-icon" title="Herausfordern">⚔️</button></div></div>'; }).join(''); }
      var lb=document.getElementById('lbList');
      if(lb){ lb.innerHTML=[
        ['Sophie L.','7.310',false],['Mara S.','5.980',false],['Du','5.240',true],
        ['Jonas K.','3.420',false],['Elias B.','2.140',false]
      ].map(function(x,i){ return '<div class="row row-rank'+(x[2]?' row-me':'')+'">'+
        '<div class="tnum" style="font-weight:800">'+String(i+1).padStart(2,'0')+'</div>'+
        '<div style="font-weight:800">'+x[0]+(x[2]?' · du':'')+'</div>'+
        '<div class="tnum" style="font-weight:800"><i class="sq'+(x[2]?' sq-ink':'')+'"></i> '+x[1]+'</div></div>'; }).join(''); }
    });
    await page.waitForTimeout(400);
  }

  const p = `/tmp/rawv-${s.key}.png`;
  await page.screenshot({ path: p });
  raw[s.key] = fs.readFileSync(p).toString('base64');
  console.log('roh:', s.key);
}
await ctx.close();

function html(W, H, b64, h1, h2) {
  const hf = Math.round(H * 0.035), sf = Math.round(H * 0.0152), pt = Math.round(H * 0.05);
  const fh = Math.round(H * 0.60), fw = Math.round(fh * 0.4614), br = Math.round(fw * 0.075);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Sora:wght@600&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}</style></head>
<body><div style="width:${W}px;height:${H}px;background:#0a0a0b;display:flex;flex-direction:column;align-items:center;overflow:hidden;">
  <div style="padding:${pt}px 60px 0;text-align:center;">
    <div style="font-family:'Fraunces',serif;font-weight:700;font-size:${hf}px;line-height:1.06;color:#fff;letter-spacing:-1px;">${h1}</div>
    <div style="font-family:'Sora',sans-serif;font-weight:600;font-size:${sf}px;color:rgba(255,255,255,.6);margin-top:${Math.round(H*0.011)}px;">${h2}</div>
  </div>
  <div style="margin-top:${Math.round(H*0.028)}px;width:${fw}px;border-radius:${br}px;overflow:hidden;box-shadow:0 40px 130px rgba(255,255,255,.10);border:2px solid #2a2a2e;">
    <img src="data:image/png;base64,${b64}" style="width:100%;display:block;">
  </div>
</div></body></html>`;
}

let n = 0;
for (const d of devices) {
  const out = `${ROOT}/${d.dir}`;
  fs.mkdirSync(out, { recursive: true });
  const c = await browser.newContext({ viewport: { width: d.W, height: d.H }, deviceScaleFactor: 1 });
  const pg = await c.newPage();
  let i = 0;
  for (const s of screens) {
    i++;
    await pg.setContent(html(d.W, d.H, raw[s.key], s.h1, s.h2), { waitUntil: 'networkidle' });
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: `${out}/${i}-${s.key}.png` });
    n++;
  }
  await c.close();
  console.log('fertig:', d.dir);
}
await browser.close();
console.log(`\n=== ${n} Bilder in ${ROOT} ===`);
