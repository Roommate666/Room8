import { chromium } from 'playwright';
import fs from 'fs';
const white = fs.readFileSync(process.env.HOME + '/Dev/roommate_full_updated/resources/goat-white-transparent.png').toString('base64');
const black = fs.readFileSync(process.env.HOME + '/Dev/roommate_full_updated/resources/goat-black-transparent.png').toString('base64');
const OUT = process.env.HOME + '/Desktop/unigoat-tshirt';
const shirts = [
  { name:'MINT (Marke)', col:'#12B489', ink:'#fff', goat:white },
  { name:'ORANGE', col:'#F5601A', ink:'#fff', goat:white },
  { name:'KNALLGELB', col:'#FFD400', ink:'#141414', goat:black },
];
function tee(col){return `<svg viewBox="0 0 460 480" width="460" height="480"><path d="M140 36 L102 18 L55 64 L18 120 L64 166 L102 138 L102 460 L358 460 L358 138 L396 166 L442 120 L405 64 L358 18 L322 36 C304 68 268 82 230 82 C192 82 156 68 140 36 Z" fill="${col}" stroke="rgba(0,0,0,.12)" stroke-width="2"/></svg>`;}
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Sora:wght@600;800&display=swap" rel="stylesheet"><style>*{margin:0;box-sizing:border-box}</style></head>
<body><div style="width:1500px;height:640px;background:#f4f7f6;display:flex;align-items:center;justify-content:center;gap:40px;font-family:'Sora';padding-top:40px;position:relative;">
<div style="position:absolute;top:26px;width:100%;text-align:center;font-family:'Fraunces';font-weight:700;font-size:30px;">T-Shirt-Farben zum Vergleich</div>
${shirts.map(s=>`<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
  ${tee(s.col)}
  <div style="position:absolute;top:150px;left:0;width:460px;display:flex;flex-direction:column;align-items:center;gap:6px;">
    <img src="data:image/png;base64,${s.goat}" style="width:96px;height:96px;">
    <div style="font-family:'Fraunces';font-weight:700;font-size:30px;color:${s.ink};">UniGoat</div>
  </div>
  <div style="margin-top:12px;font-weight:800;letter-spacing:1px;color:#333;">${s.name}</div>
</div>`).join('')}
</div></body></html>`;
const b=await chromium.launch({channel:'chrome'});const c=await b.newContext({viewport:{width:1500,height:640},deviceScaleFactor:2});const p=await c.newPage();
await p.setContent(html,{waitUntil:'networkidle'});await p.waitForTimeout(1200);
await p.screenshot({path:OUT+'/tshirt-farben.png'});await b.close();console.log('Farbvergleich fertig');
