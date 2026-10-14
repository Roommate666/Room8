// Flow-Test: Consent-Banner, Freund-Einladen (Link/Share), Duell-Dialog, Preload-Speed.
// Sendet KEINE echten Anfragen/Duelle ab.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE='https://unigoat-spa.pages.dev';
const OUT='/tmp/spa-flows'; fs.mkdirSync(OUT,{recursive:true});
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true});
await ctx.grantPermissions(['clipboard-read','clipboard-write','camera'],{origin:BASE});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const rep=[];
async function clk(sel){ return await p.evaluate((sel)=>{var f=document.querySelector('#frames iframe.active');var el=f.contentDocument.querySelector(sel);if(el){el.click();return true;}return false;},sel); }
async function feval(fn){ return await p.evaluate((fnStr)=>{var f=document.querySelector('#frames iframe.active');var d=f.contentDocument,w=f.contentWindow;return (new Function('d','w','return ('+fnStr+')(d,w)'))(d,w);}, fn.toString()); }

// Login
await p.goto(BASE+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4000);

// 1) CONSENT: localStorage reset -> Shell -> Banner muss erscheinen
await p.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.removeItem('room8_cookie_consent_v1'));
await p.goto(BASE+'/index.html',{waitUntil:'load'});
await p.waitForTimeout(1300);
const bannerDa = await p.evaluate(()=>!!document.getElementById('r8-cookie-banner'));
rep.push('1) DSGVO-Banner in Shell: '+(bannerDa?'ERSCHEINT ✓':'FEHLT ✗'));
if(bannerDa){ await p.evaluate(()=>document.getElementById('r8-cc-all')?.click()); await p.waitForTimeout(400);
  const gone=await p.evaluate(()=>!document.getElementById('r8-cookie-banner'));
  const saved=await p.evaluate(()=>!!localStorage.getItem('room8_cookie_consent_v1'));
  rep.push('   "Alle akzeptieren" -> Banner weg: '+gone+' | gespeichert: '+saved);
}

// 2) PRELOAD: nach ~4s sollten coupons/rang/profil geladen sein
await p.waitForTimeout(4000);
const preloaded = await p.evaluate(()=>{ var o={}; ['hub','coupons','rang','profil','game'].forEach(function(t){ var f=document.querySelector('#frames iframe[data-tab='+t+']'); o[t]= f && f.src ? 'geladen':'lazy'; }); return o; });
rep.push('2) Preload-Status: '+JSON.stringify(preloaded));

// 3) FREUND EINLADEN: friends oeffnen (via Hub Party-Lostopf), Code + Share pruefen
await p.evaluate(()=>location.hash='#hub'); await p.waitForTimeout(1500);
await clk('a[href*="friends"]'); await p.waitForTimeout(3000);
const codeVal = await feval((d)=>{ var el=d.getElementById('myCode'); return el?el.textContent.trim():'(kein Element)'; });
const hasShare = await feval((d)=>!!d.getElementById('shareBtn'));
rep.push('3) Freund einladen: Einladungs-Code="'+codeVal+'" | Teilen-Button: '+(hasShare?'da':'fehlt'));
// Share klicken -> im iframe faellt es auf Clipboard zurueck -> toast "kopiert"
await feval((d)=>{ var s=d.getElementById('shareBtn'); if(s) s.click(); return true; });
await p.waitForTimeout(1500);
const clip = await p.evaluate(async()=>{ try{ return await navigator.clipboard.readText(); }catch(e){ return 'CLIP-ERR '+e.message; } });
rep.push('   Nach Teilen -> Zwischenablage: '+(/https?:\/\//.test(clip)?('LINK KOPIERT ✓ ('+clip.slice(0,45)+'...)'):clip));

// 4) DUELL: Rang oeffnen, Duell-Dialog oeffnen (NICHT absenden)
await p.evaluate(()=>location.hash='#rang'); await p.waitForTimeout(3000);
const duelBtns = await feval((d)=>d.querySelectorAll('.duelbtn, .poddual').length);
rep.push('4) Duell: '+duelBtns+' Duell-Buttons gefunden');
if(duelBtns>0){ await feval((d)=>{ var bb=d.querySelector('.duelbtn, .poddual'); if(bb) bb.click(); return true; }); await p.waitForTimeout(1200);
  const dialog = await feval((d)=>{ var dw=d.getElementById('dwbg'); return dw ? (dw.classList.contains('show')||getComputedStyle(dw).display!=='none') : false; });
  rep.push('   Duell-Dialog oeffnet: '+(dialog?'JA ✓ (nicht abgesendet)':'nein'));
}

rep.push('JS-Fehler: '+(errs.length?errs.slice(0,4).join(' // '):'keine'));
await b.close();
console.log('=== FLOW-TEST (Consent/Einladen/Duell/Preload) ===');
rep.forEach(r=>console.log(r));
