// Alle Marketing-Screenshots: B&W-Look, 5 Screens x 6 Groessen, Demo=Lena.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://unigoat.de';
const EMAIL = 'redbull-demo@unigoat.de', PASS = 'RedBull2026!';
const ROOT = process.env.HOME + '/Desktop/unigoat-store-marketing';
fs.mkdirSync(ROOT, { recursive: true });
const DAMASKUS = '300e13da-a854-4da6-b7f6-9e133078b43f';

const screens = [
  { key: 'coupons',  url: '/coupons.html',                     h1: 'Studenten-Deals<br>in deiner Stadt', h2: 'Verifizieren · einlösen · sparen' },
  { key: 'deal',     url: '/coupon-detail.html?id=' + DAMASKUS, h1: 'Einlösen mit<br>einem Tap',          h2: 'Dein Deal, direkt vor Ort' },
  { key: 'game',     url: '/game/index.html',                   h1: 'Spiel dich<br>an die Spitze',         h2: 'Täglich zocken, G-Coins sammeln' },
  { key: 'rang',     url: '/challenge.html',                    h1: 'Monats-<br>Challenge',                h2: 'Die Top 3 gewinnen echte Preise' },
  { key: 'profil',   url: '/profile.html',                      h1: 'Sammle G-Coins,<br>level auf',        h2: 'Belohnungen mit jedem Deal' },
];

const devices = [
  { dir: 'iphone-6.9-1320x2868', W: 1320, H: 2868 },
  { dir: 'iphone-6.7-1290x2796', W: 1290, H: 2796 },
  { dir: 'iphone-6.5-1242x2688', W: 1242, H: 2688 },
  { dir: 'iphone-5.5-1242x2208', W: 1242, H: 2208 },
  { dir: 'ipad-13-2064x2752',    W: 2064, H: 2752 },
  { dir: 'ipad-12.9-2048x2732',  W: 2048, H: 2732 },
];

const browser = await chromium.launch({ channel: 'chrome' });

// 1. Roh-Screens aufnehmen (einmal, hohe Aufloesung)
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
    // Spiel starten + Board mit Steinen fuellen (Gameplay-Look statt Menue)
    await page.click('#btnHigh').catch(() => {});
    await page.waitForTimeout(1400);
    await page.click('#helpClose').catch(() => {});
    await page.evaluate(() => {
      var hp = document.getElementById('helpPanel'); if (hp) hp.hidden = true;
      var sp = document.getElementById('goatSpeech'); if (sp) sp.classList.remove('show');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const cells = document.querySelectorAll('#board .cell');
      const tones = ['tg', 'tx', 'tm'];
      cells.forEach((c, idx) => {
        const r = Math.floor(idx / 8), col = idx % 8;
        if (r >= 2 && col <= r - 1) {
          c.className = 'cell filled ' + tones[(r + col) % tones.length];
          c.textContent = '';
        }
      });
      const sc = document.getElementById('score');
      if (sc) sc.textContent = '12.480';
    });
    await page.waitForTimeout(700);
  }
  const p = `/tmp/raw-${s.key}.png`;
  await page.screenshot({ path: p });
  raw[s.key] = fs.readFileSync(p).toString('base64');
  console.log('roh:', s.key);
}
await ctx.close();

// 2. Kompositionen bauen (B&W), Groessen aus Hoehe abgeleitet
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
console.log(`\n=== ${n} Marketing-Bilder in ${ROOT} ===`);
