import { chromium } from 'playwright';
import fs from 'fs';
const icon = fs.readFileSync(process.env.HOME + '/Dev/roommate_full_updated/resources/goat-white-transparent.png').toString('base64');
const OUT = process.env.HOME + '/Desktop/unigoat-tshirt';

const tee = (label, inner) => `
<div style="display:flex;flex-direction:column;align-items:center;">
  <svg viewBox="0 0 500 520" width="500" height="520">
    <path d="M150 40 L110 20 L60 70 L20 130 L70 180 L110 150 L110 500 L390 500 L390 150 L430 180 L480 130 L440 70 L390 20 L350 40 C330 75 290 90 250 90 C210 90 170 75 150 40 Z"
      fill="#141414" stroke="#2a2a2a" stroke-width="2"/>
  </svg>
  <div style="margin-top:14px;font-family:'Sora';font-weight:800;color:#888;letter-spacing:2px;">${label}</div>
</div>`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Sora:wght@600;800&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}</style></head>
<body>
<div style="width:1200px;height:760px;background:#f4f7f6;display:flex;align-items:center;justify-content:center;gap:70px;position:relative;font-family:'Sora';">
  <div style="position:absolute;top:30px;left:0;width:100%;text-align:center;font-family:'Fraunces';font-weight:700;font-size:32px;color:#111;">UniGoat T-Shirt — Vorschau (schwarzes Shirt)</div>

  <!-- VORNE: kleine Brust-Print -->
  <div style="position:relative;">
    ${tee('VORNE','')}
    <div style="position:absolute;top:150px;left:0;width:500px;display:flex;flex-direction:column;align-items:center;gap:6px;">
      <img src="data:image/png;base64,${icon}" style="width:70px;height:70px;">
      <div style="font-family:'Fraunces';font-weight:700;font-size:26px;color:#fff;">UniGoat</div>
    </div>
  </div>

  <!-- HINTEN: grosser Print -->
  <div style="position:relative;">
    ${tee('HINTEN','')}
    <div style="position:absolute;top:120px;left:0;width:500px;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <img src="data:image/png;base64,${icon}" style="width:150px;height:150px;">
      <div style="font-family:'Fraunces';font-weight:700;font-size:52px;color:#fff;line-height:1;">UniGoat</div>
      <div style="font-family:'Sora';font-weight:600;font-size:19px;color:rgba(255,255,255,.7);margin-top:8px;">Studenten-Deals in deiner Stadt</div>
      <div style="font-family:'Sora';font-weight:800;font-size:19px;color:#fff;margin-top:2px;">@unigoat.de</div>
    </div>
  </div>
</div></body></html>`;

const b = await chromium.launch({ channel: 'chrome' });
const c = await b.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2 });
const p = await c.newPage();
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.screenshot({ path: OUT + '/tshirt-vorschau.png' });

// Druckfertig: transparente Print-Dateien (weisse Grafik)
async function printFile(name, w, h, inner) {
  const pg = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 4 })).newPage();
  await pg.setContent(`<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Sora:wght@600;800&display=swap" rel="stylesheet"><style>*{margin:0;box-sizing:border-box}</style></head><body style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;">${inner}</body></html>`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: OUT + '/' + name, omitBackground: true });
}
await printFile('print-vorne.png', 600, 720, `<div style="display:flex;flex-direction:column;align-items:center;gap:14px;"><img src="data:image/png;base64,${icon}" style="width:220px;height:220px;"><div style="font-family:'Fraunces';font-weight:700;font-size:96px;color:#fff;">UniGoat</div></div>`);
await printFile('print-hinten.png', 900, 1100, `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;"><img src="data:image/png;base64,${icon}" style="width:420px;height:420px;"><div style="font-family:'Fraunces';font-weight:700;font-size:150px;color:#fff;line-height:1;">UniGoat</div><div style="font-family:'Sora';font-weight:600;font-size:52px;color:#fff;margin-top:20px;">Studenten-Deals in deiner Stadt</div><div style="font-family:'Sora';font-weight:800;font-size:52px;color:#fff;">@unigoat.de</div></div>`);

await b.close();
console.log('T-Shirt-Design fertig:', OUT);
