// Tiefentest: Unterseiten durch die Shell oeffnen + Zurueck + Fehler. Nur lesend (kein Einloesen).
import { chromium } from 'playwright';
import fs from 'fs';
const BASE='https://unigoat-spa.pages.dev';
const OUT='/tmp/spa-depth'; fs.mkdirSync(OUT,{recursive:true});

const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,locale:'de-DE'});
const p=await ctx.newPage();
const errs=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));

await p.goto(BASE+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4000);
await p.goto(BASE+'/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(3500);
await p.evaluate(()=>{ window.__m='ALIVE'; });

const rep=[];
async function activeTab(){ return await p.evaluate(()=>{var a=document.querySelector('#frames iframe.active');return a?a.getAttribute('data-tab'):null;}); }
async function frameText(){ return await p.evaluate(()=>{var a=document.querySelector('#frames iframe.active');try{return (a.contentDocument.body.innerText||'').replace(/\s+/g,' ').trim().slice(0,90);}catch(e){return 'X-blocked';}}); }
async function frameURL(){ return await p.evaluate(()=>{var a=document.querySelector('#frames iframe.active');try{return a.contentWindow.location.pathname;}catch(e){return '?';}}); }
async function alive(){ return await p.evaluate(()=>window.__m||'WEG'); }
// Klick im aktiven iframe per Selektor (erste Treffer). Gibt true/false.
async function clk(sel){ return await p.evaluate((sel)=>{var f=document.querySelector('#frames iframe.active');var el=f.contentDocument.querySelector(sel);if(el){el.click();return true;}return false;},sel); }
// Tab wechseln ueber die Tab-Bar des aktiven iframes
async function tab(part){ await clk('.tabbar a[href*="'+part+'"]'); await p.waitForTimeout(2600); }

async function step(name, sel, waitMs=2600){
  const before = await frameURL();
  const clicked = await clk(sel);
  await p.waitForTimeout(waitMs);
  const url = await frameURL(); const txt = await frameText();
  rep.push(`${name}: ${clicked?'geklickt':'LINK NICHT GEFUNDEN'} -> ${url.replace(/^.*\//,'')} | ${txt.slice(0,60)}`);
  return {clicked,url,txt,before};
}

// --- COUPONS: Karte -> Detail -> Zurueck ---
await tab('coupons');
rep.push('== Coupons-Tab: '+await frameText());
await step('  Coupon-Detail oeffnen','a[href*="coupon-detail"]',3000);
await p.screenshot({path:OUT+'/coupon-detail.png'});
// Zurueck (rnd-Button mit history.back)
await clk('.rnd'); await p.waitForTimeout(2500);
rep.push('  Zurueck aus Detail -> '+(await frameURL()).replace(/^.*\//,'')+' (soll coupons.html)');

// --- HUB: Party-Lostopf ---
await tab('dashboard');
await step('Party-Lostopf (friends)','a[href*="friends"]',3000);
await p.screenshot({path:OUT+'/friends.png'});

// --- PROFIL: Shop / Einstellungen / Verify / Bearbeiten ---
await tab('profile');
rep.push('== Profil-Tab: '+(await frameText()).slice(0,50));
let r = await step('  Goat-Shop (avatar-edit)','a[href*="avatar-edit"]',3000);
await p.screenshot({path:OUT+'/avatar.png'});
if(r.clicked){ await clk('.backbtn,[class*="back"]'); await p.waitForTimeout(2500); rep.push('  Zurueck aus Shop -> '+(await frameURL()).replace(/^.*\//,'')+' | Marker '+await alive()); }

await tab('profile');
await step('  Einstellungen','a[href*="einstellungen"]',2800);
await p.screenshot({path:OUT+'/settings.png'});

await tab('profile');
await step('  Verifizierung','a[href*="verify-options"]',2800);
await p.screenshot({path:OUT+'/verify.png'});

await tab('profile');
await step('  Profil bearbeiten','a[href*="edit-profile"]',2800);
await p.screenshot({path:OUT+'/edit.png'});

const realErr=errs.filter(x=>!/mime|Content-Type|favicon|sentry|manifest|status of 4|net::ERR.*(favicon|manifest)/i.test(x));
rep.push('JS-Fehler (ohne harmlose): '+(realErr.length?realErr.slice(0,5).join(' // '):'keine'));
rep.push('Marker am Ende: '+await alive());

await b.close();
console.log('=== TIEFENTEST UNTERSEITEN ===');
rep.forEach(r=>console.log(r));
console.log('Screenshots:',OUT);
