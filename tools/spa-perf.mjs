// Misst wo die Ladezeit draufgeht: externe Requests (Fonts/CDN), DB-Queries, Bilder, Lib-Doppelladung.
import { chromium } from 'playwright';
const BASE='https://unigoat-spa.pages.dev';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true});
const p=await ctx.newPage();

const reqs=[];
p.on('requestfinished', async r=>{
  try{ const t=r.timing(); const resp=await r.response(); reqs.push({url:r.url(), ms:Math.round(t.responseEnd), type:r.resourceType(), status:resp?resp.status():0}); }catch(e){}
});

await p.goto(BASE+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4000);

// Kaltstart Shell messen
reqs.length=0;
const t0=Date.now();
await p.goto(BASE+'/index.html',{waitUntil:'load'});
const tShellLoad=Date.now()-t0;
// warten bis dashboard-iframe interaktiv (Coins-Element gefuellt)
await p.waitForTimeout(4000);
const tInteractive=Date.now()-t0;

// Kategorisieren
function host(u){ try{return new URL(u).host;}catch(e){return u;} }
const byHost={};
reqs.forEach(r=>{ const h=host(r.url); byHost[h]=(byHost[h]||{n:0,ms:0}); byHost[h].n++; byHost[h].ms=Math.max(byHost[h].ms,r.ms); });
const supa=reqs.filter(r=>/supabase\.co/.test(r.url));
const fonts=reqs.filter(r=>/fonts\.(googleapis|gstatic)/.test(r.url));
const cdn=reqs.filter(r=>/cdnjs|jsdelivr|unpkg/.test(r.url));
const imgs=reqs.filter(r=>r.type==='image');
const libDup={}; reqs.filter(r=>/\.js($|\?)/.test(r.url)).forEach(r=>{ const n=r.url.split('/').pop().split('?')[0]; libDup[n]=(libDup[n]||0)+1; });

console.log('=== PERF-MESSUNG (Browser; nativ sind HTML/CSS/JS lokal, Rest bleibt) ===');
console.log('Shell load-Event:', tShellLoad+'ms | bis interaktiv ~'+tInteractive+'ms');
console.log('\n-- Externe Requests (gehen AUCH nativ uebers Netz) --');
console.log('Google Fonts:', fonts.length, 'Requests, langsamster '+(Math.max(0,...fonts.map(r=>r.ms)))+'ms');
console.log('CDN (html5-qrcode etc.):', cdn.length);
console.log('Supabase DB-Queries:', supa.length, '| langsamster '+(Math.max(0,...supa.map(r=>r.ms)))+'ms');
supa.slice(0,8).forEach(r=>console.log('   ['+r.ms+'ms] '+r.url.replace(/^.*supabase\.co/,'').slice(0,70)));
console.log('Bilder:', imgs.length, '| langsamster '+(Math.max(0,...imgs.map(r=>r.ms)))+'ms');
console.log('\n-- Mehrfach geladene JS-Libs (iframe-Redundanz) --');
Object.entries(libDup).filter(([n,c])=>c>1).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([n,c])=>console.log('   '+c+'x  '+n));

// Coupons-Tab: erster Besuch messen
const tc=Date.now();
await p.evaluate(()=>{var f=document.querySelector('#frames iframe.active');var a=f.contentDocument.querySelector('.tabbar a[href*="coupons"]');if(a)a.click();});
await p.waitForFunction(()=>{try{var f=document.querySelector('#frames iframe[data-tab=coupons]');return f&&f.contentDocument&&/Coupons/.test(f.contentDocument.body.innerText||'');}catch(e){return false;}},{timeout:8000}).catch(()=>{});
console.log('\nCoupons-Tab ERSTER Besuch (Vollladung iframe):', (Date.now()-tc)+'ms');
// zweiter Besuch (schon geladen)
await p.evaluate(()=>{var f=document.querySelector('#frames iframe[data-tab=hub]');/*hub*/location.hash='#hub';});
await p.waitForTimeout(500);
const tc2=Date.now();
await p.evaluate(()=>{location.hash='#coupons';});
await p.waitForTimeout(300);
console.log('Coupons-Tab ZWEITER Besuch (schon geladen):', (Date.now()-tc2)+'ms (=instant)');

await b.close();
