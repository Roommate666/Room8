// App-Store-Screenshots in allen Pflicht-Groessen (iPhone + iPad) via Demo-Login.
// Nutzung: node tools/store-screenshots.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://unigoat.de';
const EMAIL = 'redbull-demo@unigoat.de';
const PASS = 'RedBull2026!';
const ROOT = process.env.HOME + '/Desktop/unigoat-screenshots';

// Geraete: Ziel-Pixelmasse / scale = CSS-Viewport
const devices = [
  { dir: 'iphone-6.9-1320x2868', w: 440, h: 956, scale: 3, mobile: true },
  { dir: 'iphone-6.7-1290x2796', w: 430, h: 932, scale: 3, mobile: true },
  { dir: 'iphone-6.5-1242x2688', w: 414, h: 896, scale: 3, mobile: true },
  { dir: 'iphone-5.5-1242x2208', w: 414, h: 736, scale: 3, mobile: true },
  { dir: 'ipad-13-2064x2752',    w: 1032, h: 1376, scale: 2, mobile: false },
  { dir: 'ipad-12.9-2048x2732',  w: 1024, h: 1366, scale: 2, mobile: false },
];

const shots = [
  { name: '1-coupons', url: '/coupons.html' },
  { name: '2-game', url: '/game/index.html' },
  { name: '3-rang', url: '/challenge.html' },
  { name: '4-profil', url: '/profile.html' },
  { name: '5-einstellungen', url: '/einstellungen.html' },
];

const browser = await chromium.launch({ channel: 'chrome' });
let total = 0, okc = 0;

for (const d of devices) {
  const out = `${ROOT}/${d.dir}`;
  fs.mkdirSync(out, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.scale,
    isMobile: d.mobile,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  // Login
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
  await page.fill('#loginEmail', EMAIL);
  await page.fill('#loginPassword', PASS);
  await page.click('#loginBtn');
  await page.waitForTimeout(4000);

  for (const s of shots) {
    total++;
    try {
      await page.goto(BASE + s.url, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: false });
      okc++;
    } catch (e) {
      console.log('FEHLER', d.dir, s.name, '-', String(e).slice(0, 60));
    }
  }
  await ctx.close();
  console.log('fertig:', d.dir);
}
await browser.close();
console.log(`\n=== ${okc}/${total} Screenshots in ${ROOT} ===`);
