// Beweist Cache-First: bei langsamem Netz erscheinen die Coins SOFORT (aus Cache) statt "-".
import { chromium } from 'playwright';
const BASE='https://unigoat-spa.pages.dev';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true});
const p=await ctx.newPage();

await p.goto(BASE+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4000);

// 1) Dashboard normal laden -> fuellt den Cache
await p.goto(BASE+'/dashboard.html',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
const coinsAfterWarm = await p.evaluate(()=>document.getElementById('coins')?.textContent);
console.log('1) Erst-Laden, Coins nach Query:', JSON.stringify(coinsAfterWarm), '(Cache jetzt gefuellt)');

// 2) DB-Abfragen kuenstlich um 3s verzoegern (simuliert lahmes Mensa-WLAN)
await p.route('**/rest/v1/**', async route=>{ await new Promise(r=>setTimeout(r,3000)); route.continue(); });
await p.route('**/auth/v1/**', async route=>{ await new Promise(r=>setTimeout(r,1500)); route.continue(); });

// 3) Dashboard neu laden und SOFORT (nach 400ms, lange vor dem 3s-Query) die Coins messen
const t=Date.now();
await p.goto(BASE+'/dashboard.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(400);
const coinsEarly = await p.evaluate(()=>document.getElementById('coins')?.textContent);
const heroEarly = await p.evaluate(()=>document.getElementById('heroNum')?.textContent);
console.log('2) Bei LAHMEM Netz nach nur 400ms (Query braucht 3s):');
console.log('   Coins-Anzeige:', JSON.stringify(coinsEarly), '| Hero-Zahl:', JSON.stringify(heroEarly));
console.log('   => '+(coinsEarly && coinsEarly!=='–' && coinsEarly!=='0' ? 'SOFORT DA (Cache-First wirkt) ✓' : 'noch leer/-  ✗'));

// Vergleich: ohne Cache waere hier "-"
await b.close();
