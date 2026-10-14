// Test der iframe-Shell: 1:1-Optik + Tab-Wechsel OHNE Shell-Reload + Cross-Links.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE='https://unigoat-spa.pages.dev';
const OUT='/tmp/spa-shell'; fs.mkdirSync(OUT,{recursive:true});

const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,locale:'de-DE'});
const p=await ctx.newPage();
const errs=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));

// Login
await p.goto(BASE+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de');
await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn');
await p.waitForTimeout(4000);

// Shell laden
await p.goto(BASE+'/index.html',{waitUntil:'networkidle'});
await p.waitForTimeout(3500);
// Marker in die Shell setzen -> ueberlebt nur, wenn die Shell NICHT neu geladen wird
await p.evaluate(()=>{ window.__shellMarker = 'ALIVE-'+Date.now(); });

async function activeTab(){ return await p.evaluate(()=>{ var a=document.querySelector('#frames iframe.active'); return a?a.getAttribute('data-tab'):null; }); }
async function frameText(){ return await p.evaluate(()=>{ var a=document.querySelector('#frames iframe.active'); try{return (a.contentDocument.body.innerText||'').slice(0,80).replace(/\n/g,' ');}catch(e){return 'X';} }); }
async function markerAlive(){ return await p.evaluate(()=>window.__shellMarker||null); }

const rep=[];
rep.push('Start-Tab: '+await activeTab()+' | Text: '+await frameText());
await p.screenshot({path:OUT+'/1-hub.png',fullPage:false});

// Tab-Bar im aktiven iframe: Coupons klicken (via Shell-Interceptor -> Tab-Switch)
async function clickInFrame(tab, sel){
  return await p.evaluate(({tab,sel})=>{
    var f=document.querySelector('#frames iframe.active');
    var el=f.contentDocument.querySelector(sel);
    if(el){ el.click(); return true; } return false;
  },{tab,sel});
}
// dashboard tabbar -> coupons
let ok = await clickInFrame('hub','.tabbar a[href*="coupons"]');
await p.waitForTimeout(3000);
rep.push('Nach Klick Coupons-Tab: aktiv='+await activeTab()+' | Marker='+(await markerAlive()?'LEBT (kein Reload)':'WEG (Shell neu geladen!)')+' | Text: '+await frameText());
await p.screenshot({path:OUT+'/2-coupons.png',fullPage:false});

// zurueck zu Hub via tabbar
await clickInFrame('coupons','.tabbar a[href*="dashboard"]');
await p.waitForTimeout(2000);
rep.push('Zurueck zu Hub: aktiv='+await activeTab()+' | Marker='+(await markerAlive()?'LEBT':'WEG'));

// Rang (von Hub-Tabbar)
await clickInFrame('hub','.tabbar a[href*="challenge"]');
await p.waitForTimeout(2800);
rep.push('Rang-Tab: aktiv='+await activeTab()+' | Marker='+(await markerAlive()?'LEBT':'WEG')+' | Text: '+await frameText());
await p.screenshot({path:OUT+'/4-rang.png',fullPage:false});

// Profil (von Rang-Tabbar)
await clickInFrame('rang','.tabbar a[href*="profile"]');
await p.waitForTimeout(2800);
rep.push('Profil-Tab: aktiv='+await activeTab()+' | Marker='+(await markerAlive()?'LEBT':'WEG')+' | Text: '+await frameText());
await p.screenshot({path:OUT+'/5-profil.png',fullPage:false});

// Game (von Profil-Tabbar, Cross-Link zur Vollbild-Spielseite)
await clickInFrame('profil','.tabbar a[href*="game"]');
await p.waitForTimeout(4000);
rep.push('Game-Tab: aktiv='+await activeTab()+' | Marker='+(await markerAlive()?'LEBT':'WEG')+' | Text: '+await frameText());
await p.screenshot({path:OUT+'/3-game.png',fullPage:false});

const realErr=errs.filter(x=>!/mime|Content-Type|favicon|sentry|manifest|the server responded with a status of 4/i.test(x));
rep.push('JS-Fehler (ohne harmlose): '+(realErr.length?realErr.slice(0,4).join(' // '):'keine'));

await b.close();
console.log('=== IFRAME-SHELL TEST ===');
rep.forEach(r=>console.log(r));
console.log('Screenshots:',OUT);
