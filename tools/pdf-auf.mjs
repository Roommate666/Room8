import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file:///tmp/aufsteller.html', { waitUntil:'networkidle' });
await p.waitForTimeout(2000);
// Aufsteller-Container ermitteln (Elemente mit "a6" in der Klasse, aeusserste)
const sel = await p.evaluate(()=>{
  const cands=[...document.querySelectorAll('[class*=a6],[class*=A6]')];
  const outer=cands.filter(e=>!cands.some(o=>o!==e && o.contains(e)));
  if(outer.length){ outer.forEach(e=>e.style.pageBreakAfter='always'); return {cls:'a6-el', n:outer.length}; }
  // Fallback: direkte Body-Kinder
  const kids=[...document.body.children]; kids.forEach(e=>e.style.pageBreakAfter='always');
  return {cls:'body-kind', n:kids.length};
});
await p.addStyleTag({content:'@page{size:A6;margin:0} html,body{margin:0;padding:0} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}'});
await p.pdf({ path:'/Users/yusufcash/Downloads/UniGoat-Tischaufsteller-A6-DRUCK.pdf', format:'A6', printBackground:true, margin:{top:'0',bottom:'0',left:'0',right:'0'} });
console.log('Container:', JSON.stringify(sel));
await b.close();
