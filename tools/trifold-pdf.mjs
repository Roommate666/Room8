import { chromium } from 'playwright';
const SRC='file:///Users/yusufcash/Desktop/UNIGOAT-STARTUPSUED/A6-Flyer-Erstis-v5/UniGoat%20Tri-Fold%20StartupSUED.dc.html';
const OUT='/Users/yusufcash/Desktop/UNIGOAT-STARTUPSUED/UniGoat-TriFold-StartupSUED-DRUCK.pdf';
const b=await chromium.launch();
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(SRC,{waitUntil:'networkidle',timeout:30000});
await p.waitForTimeout(2500);
// wie viele doc-pages (Vorder-/Rueckseite)?
const info=await p.evaluate(()=>({
  pages:document.querySelectorAll('doc-page').length,
  imgs:document.querySelectorAll('img').length,
  brokenImgs:[...document.querySelectorAll('img')].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src')),
}));
console.log('doc-pages:',info.pages,'| imgs:',info.imgs,'| kaputte Bilder:',info.brokenImgs.length?info.brokenImgs.join(', '):'keine');
await p.pdf({ path:OUT, width:'306mm', height:'216mm', printBackground:true, margin:{top:'0',bottom:'0',left:'0',right:'0'} });
console.log('JS-Fehler:',errs.length?errs.slice(0,2).join(' // '):'keine');
await b.close();
