// Testet den Einloese-Flow bis zum QR-Scan: Sheet -> Swipe-Funktion -> Kamera startet IM iframe.
// Loest KEINE echte Einloesung aus (kein gueltiger Laden-QR -> kein self_redeem_qr mit echtem Token).
import { chromium } from 'playwright';
import fs from 'fs';
const BASE='https://unigoat-spa.pages.dev';
const OUT='/tmp/spa-redeem'; fs.mkdirSync(OUT,{recursive:true});

const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,locale:'de-DE'});
await ctx.grantPermissions(['camera'],{origin:BASE});
const p=await ctx.newPage();
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text());}); p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));

await p.goto(BASE+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4000);
await p.goto(BASE+'/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(3500);

const rep=[];
async function clk(sel){ return await p.evaluate((sel)=>{var f=document.querySelector('#frames iframe.active');var el=f.contentDocument.querySelector(sel);if(el){el.click();return true;}return false;},sel); }
async function ftext(){ return await p.evaluate(()=>{var f=document.querySelector('#frames iframe.active');try{return (f.contentDocument.body.innerText||'').replace(/\s+/g,' ').trim();}catch(e){return 'X';}}); }

// Coupons -> erste Karte -> Detail
await clk('.tabbar a[href*="coupons"]'); await p.waitForTimeout(2600);
await clk('a[href*="coupon-detail"]'); await p.waitForTimeout(3000);
rep.push('Coupon-Detail offen: '+(await ftext()).slice(0,55));

// "Jetzt einloesen" klicken (Button per Text finden)
const clickedRedeem = await p.evaluate(()=>{
  var f=document.querySelector('#frames iframe.active'); var d=f.contentDocument;
  var els=[].slice.call(d.querySelectorAll('button,a,.btn,[role=button]'));
  var el=els.find(function(e){return /jetzt einl|einlösen/i.test(e.textContent||'');});
  if(el){ el.click(); return el.textContent.trim().slice(0,30); } return null;
});
await p.waitForTimeout(1500);
rep.push('"Jetzt einloesen" geklickt: '+(clickedRedeem||'BUTTON NICHT GEFUNDEN'));
rep.push('  Sheet-Inhalt: '+(await ftext()).slice(-90));
await p.screenshot({path:OUT+'/1-sheet.png'});

// Swipe ueberspringen: window.finish() direkt (das ruft der Swipe am Ende auf) -> QR-Scan
const finishOk = await p.evaluate(()=>{
  var f=document.querySelector('#frames iframe.active');
  try{ if(typeof f.contentWindow.finish==='function'){ f.contentWindow.finish(); return true; } }catch(e){ return 'ERR '+e.message; }
  return false;
});
rep.push('window.finish() (Swipe-Ende -> Scan): '+finishOk);
await p.waitForTimeout(5000); // lib laden + Kamera starten

// Kamera-Status pruefen
const scan = await p.evaluate(()=>{
  var f=document.querySelector('#frames iframe.active'); var d=f.contentDocument;
  var reader=d.getElementById('qr-reader');
  var hint=d.getElementById('qr-hint');
  var video=d.querySelector('#qr-reader video');
  var body=(d.body.innerText||'');
  return {
    hasReader: !!reader,
    hint: hint?hint.textContent.trim():null,
    hasVideo: !!video,
    videoPlaying: video ? (video.readyState>=2 && !video.paused) : false,
    kameraFehler: /Kamerazugriff nicht möglich|konnte nicht geladen/.test(body)
  };
});
rep.push('QR-Scan-Ansicht: reader='+scan.hasReader+' | hint="'+scan.hint+'" | video='+scan.hasVideo+' | video_laeuft='+scan.videoPlaying+' | KAMERA-FEHLER='+scan.kameraFehler);
await p.screenshot({path:OUT+'/2-scan.png'});

const realErr=errs.filter(x=>!/mime|favicon|sentry|manifest|status of 4/i.test(x));
rep.push('JS-Fehler: '+(realErr.length?realErr.slice(0,4).join(' // '):'keine'));

await b.close();
console.log('=== EINLOESE-FLOW TEST (bis Kamera) ===');
rep.forEach(r=>console.log(r));
console.log('Screenshots:',OUT);
