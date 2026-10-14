import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1240,height:1754}, deviceScaleFactor:4 });
await p.goto('file:///tmp/aufsteller.html', { waitUntil:'networkidle' });
await p.waitForTimeout(2000);
// pro QR-img: zugehoeriger Ladenname (aus umgebendem Container "GUELTIG BEI X")
const names = await p.evaluate(()=>{
  return [...document.querySelectorAll('img')].map(img=>{
    let el=img, name='?';
    for(let i=0;i<7 && el;i++){ el=el.parentElement; if(!el) break; const t=el.innerText||'';
      const m=t.match(/G[ÜU]LTIG BEI\s*\n?\s*([^\n]+)/i); if(m){ name=m[1].trim(); break; } }
    return name;
  });
});
const imgs = await p.$$('img');
for(let i=0;i<imgs.length;i++){ await imgs[i].screenshot({ path:`/tmp/qr_${i}.png` }); }
console.log(JSON.stringify(names));
await b.close();
