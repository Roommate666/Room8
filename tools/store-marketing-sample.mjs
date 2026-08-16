// Marketing-Screenshot-MUSTER: App-Screen im Rahmen + Ueberschrift auf Mint.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://unigoat.de';
const EMAIL = 'redbull-demo@unigoat.de', PASS = 'RedBull2026!';
const OUT = process.env.HOME + '/Desktop/unigoat-store-marketing';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });

// 1. Roh-Screen aufnehmen (Coupons), Persona = Lena
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
await page.fill('#loginEmail', EMAIL); await page.fill('#loginPassword', PASS); await page.click('#loginBtn');
await page.waitForTimeout(4000);
await page.goto(BASE + '/coupons.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const raw = '/tmp/raw-coupons.png';
await page.screenshot({ path: raw });
await ctx.close();

// 2. Marketing-Komposition rendern (1320x2868 = iPhone 6.9")
const b64 = fs.readFileSync(raw).toString('base64');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Sora:wght@600;800&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{width:1320px;height:2868px}</style></head>
<body>
<div style="width:1320px;height:2868px;background:#0a0a0b;display:flex;flex-direction:column;align-items:center;overflow:hidden;">
  <div style="padding:150px 90px 40px;text-align:center;">
    <div style="font-family:'Fraunces',serif;font-weight:700;font-size:100px;line-height:1.06;color:#fff;letter-spacing:-1px;">Studenten-Deals<br>in deiner Stadt</div>
    <div style="font-family:'Sora',sans-serif;font-weight:600;font-size:44px;color:rgba(255,255,255,.62);margin-top:30px;">Verifizieren · einlösen · sparen</div>
  </div>
  <div style="margin-top:36px;width:940px;border-radius:70px;overflow:hidden;box-shadow:0 40px 130px rgba(255,255,255,.10);border:2px solid #2a2a2e;">
    <img src="data:image/png;base64,${b64}" style="width:100%;display:block;">
  </div>
</div>
</body></html>`;

const ctx2 = await browser.newContext({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
const p2 = await ctx2.newPage();
await p2.setContent(html, { waitUntil: 'networkidle' });
await p2.waitForTimeout(1500);
await p2.screenshot({ path: `${OUT}/SAMPLE-coupons-6.9.png` });
await ctx2.close();
await browser.close();
console.log('Muster fertig:', `${OUT}/SAMPLE-coupons-6.9.png`);
