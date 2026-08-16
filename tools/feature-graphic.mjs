import { chromium } from 'playwright';
import fs from 'fs';
const icon = fs.readFileSync(process.env.HOME + '/Dev/roommate_full_updated/resources/icon.png').toString('base64');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Sora:wght@600&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}</style></head>
<body><div style="width:1024px;height:500px;background:#0a0a0b;display:flex;align-items:center;gap:44px;padding:0 70px;overflow:hidden;">
  <img src="data:image/png;base64,${icon}" style="width:210px;height:210px;filter:invert(1);flex:0 0 auto;">
  <div>
    <div style="font-family:'Fraunces',serif;font-weight:700;font-size:78px;color:#fff;line-height:1;">UniGoat</div>
    <div style="font-family:'Fraunces',serif;font-weight:700;font-size:40px;color:#fff;line-height:1.12;margin-top:14px;">Studenten-Deals<br>in deiner Stadt</div>
    <div style="font-family:'Sora',sans-serif;font-weight:600;font-size:24px;color:rgba(255,255,255,.6);margin-top:16px;">Coupons · Spiel · G-Coins 🐐</div>
  </div>
</div></body></html>`;
const b = await chromium.launch({ channel: 'chrome' });
const c = await b.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
const p = await c.newPage();
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.screenshot({ path: process.env.HOME + '/Desktop/unigoat-playstore/feature-graphic-1024x500.png' });
await b.close();
console.log('Feature-Graphic fertig');
