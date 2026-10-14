import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1240,height:1754}, deviceScaleFactor:3 });
await p.goto('file:///tmp/aufsteller.html', { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
const info = await p.evaluate(()=>({
  imgs: document.querySelectorAll('img').length,
  svgs: document.querySelectorAll('svg').length,
  canvas: document.querySelectorAll('canvas').length,
  text: (document.body.innerText||'').replace(/\s+/g,' ').slice(0,300)
}));
console.log('DOM:', JSON.stringify(info));
await p.screenshot({ path:'/tmp/aufsteller_neu.png', fullPage:true });
const box = await p.evaluate(()=>({w:document.body.scrollWidth,h:document.body.scrollHeight}));
console.log('Seite:', box.w+'x'+box.h);
await b.close();
