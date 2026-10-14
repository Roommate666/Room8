import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file:///tmp/aufsteller.html', { waitUntil:'networkidle' });
await p.waitForTimeout(2000);
// jeden Aufsteller-Block auf eigene Seite
await p.evaluate(()=>{ [...document.body.children].forEach(e=>e.style.pageBreakAfter='always'); });
// exakt 100x150mm Seitengroesse (passt in den gekauften 10x15cm Steck-Aufsteller)
await p.addStyleTag({content:'@page{size:100mm 150mm;margin:0} html,body{margin:0;padding:0} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}'});
await p.pdf({ path:'/Users/yusufcash/Downloads/UniGoat-Tischaufsteller-10x15cm-DRUCK.pdf',
  width:'100mm', height:'150mm', printBackground:true, margin:{top:'0',bottom:'0',left:'0',right:'0'} });
await b.close();
console.log('fertig');
