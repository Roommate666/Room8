import { chromium } from 'playwright';
import fs from 'fs';
const g = fs.readFileSync(process.env.HOME + '/Dev/roommate_full_updated/resources/goat-white-transparent.png').toString('base64');
const OUT = process.env.HOME + '/Desktop/unigoat-tshirt';
const MINT = '#12B489';
const tee = `<svg viewBox="0 0 500 520" width="500" height="520"><path d="M150 40 L110 20 L60 70 L20 130 L70 180 L110 150 L110 500 L390 500 L390 150 L430 180 L480 130 L440 70 L390 20 L350 40 C330 75 290 90 250 90 C210 90 170 75 150 40 Z" fill="${MINT}" stroke="rgba(0,0,0,.12)" stroke-width="2"/></svg>`;
async function render(file, w, h, inner){
  const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});const p=await c.newPage();
  await p.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Sora:wght@600;800&display=swap" rel="stylesheet"><style>*{margin:0;box-sizing:border-box}</style></head><body style="width:${w}px;height:${h}px;background:#f4f7f6;font-family:'Sora';">${inner}</body></html>`,{waitUntil:'networkidle'});
  await p.waitForTimeout(1100);await p.screenshot({path:OUT+'/'+file});await c.close();
}
const b=await chromium.launch({channel:'chrome'});

// Finale Vorschau: Vorne + Hinten (Mint)
await render('tshirt-final-mint.png',1200,760,`
<div style="width:1200px;height:760px;display:flex;align-items:center;justify-content:center;gap:70px;position:relative;">
 <div style="position:absolute;top:30px;width:100%;text-align:center;font-family:'Fraunces';font-weight:700;font-size:32px;">UniGoat T-Shirt — FINAL (Mint)</div>
 <div style="position:relative;">${tee}<div style="position:absolute;top:150px;left:0;width:500px;display:flex;flex-direction:column;align-items:center;gap:6px;"><img src="data:image/png;base64,${g}" style="width:70px;height:70px;"><div style="font-family:'Fraunces';font-weight:700;font-size:26px;color:#fff;">UniGoat</div></div><div style="text-align:center;margin-top:12px;font-weight:800;color:#333;">VORNE</div></div>
 <div style="position:relative;">${tee}<div style="position:absolute;top:120px;left:0;width:500px;display:flex;flex-direction:column;align-items:center;gap:4px;"><img src="data:image/png;base64,${g}" style="width:150px;height:150px;"><div style="font-family:'Fraunces';font-weight:700;font-size:52px;color:#fff;line-height:1;">UniGoat</div><div style="font-weight:600;font-size:19px;color:rgba(255,255,255,.85);margin-top:8px;">Studenten-Deals in deiner Stadt</div><div style="font-weight:800;font-size:19px;color:#fff;">@unigoat.de</div></div><div style="text-align:center;margin-top:12px;font-weight:800;color:#333;">HINTEN</div></div>
</div>`);

// Team-Variante (Mint, "TEAM" auf Brust)
await render('tshirt-team-mint.png',640,760,`
<div style="width:640px;height:760px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;">
 <div style="position:absolute;top:26px;width:100%;text-align:center;font-family:'Fraunces';font-weight:700;font-size:28px;">Team-Variante</div>
 <div style="position:relative;">${tee}<div style="position:absolute;top:145px;left:0;width:500px;display:flex;flex-direction:column;align-items:center;gap:4px;"><img src="data:image/png;base64,${g}" style="width:66px;height:66px;"><div style="font-family:'Fraunces';font-weight:700;font-size:24px;color:#fff;">UniGoat</div><div style="margin-top:6px;font-weight:800;font-size:16px;letter-spacing:3px;color:#04231a;background:#fff;border-radius:20px;padding:3px 14px;">TEAM</div></div></div>
</div>`);

await b.close();console.log('Final + Team fertig');
