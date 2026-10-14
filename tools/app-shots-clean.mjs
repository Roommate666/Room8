import { chromium } from 'playwright';
const B='https://unigoat.de';
const OUT='/Users/yusufcash/Desktop/UNIGOAT-SCREENSHOTS-v3';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'de-DE'});
const p=await ctx.newPage();
await p.goto(B+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(5000);

// transiente Einblendungen (Begruessungs-Toast, Promo-Popups) entfernen fuer sauberen Shot
async function declutter(){
  await p.evaluate(()=>{
    document.querySelectorAll('[class*=toast],[class*=greet],[id*=greet],[class*=popup],[class*=promo],[role=dialog]').forEach(e=>{try{e.style.display='none';}catch(_){}});
  });
}

// HUB - Toast weg, oben, settle
await p.goto(B+'/dashboard.html',{waitUntil:'networkidle'}); await p.waitForTimeout(6000);
await declutter(); await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(600);
await p.screenshot({path:`${OUT}/UniGoat-hub.png`, clip:{x:0,y:0,width:390,height:844}});
console.log('OK hub');

// COUPONS
await p.goto(B+'/coupons.html',{waitUntil:'networkidle'}); await p.waitForTimeout(4000);
await declutter(); await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(600);
await p.screenshot({path:`${OUT}/UniGoat-coupons.png`, clip:{x:0,y:0,width:390,height:844}});
console.log('OK coupons');

// RANG (Podium sieht edel aus - bessere Wahl als Freunde)
await p.goto(B+'/challenge.html',{waitUntil:'networkidle'}); await p.waitForTimeout(4000);
await declutter(); await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(600);
await p.screenshot({path:`${OUT}/UniGoat-rang.png`, clip:{x:0,y:0,width:390,height:844}});
console.log('OK rang');

// SPIEL - Brett, Tutorial weg
await p.goto(B+'/game/index.html',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
await p.evaluate(()=>{const e=[...document.querySelectorAll('button,a,.btn')].find(x=>/spielen|▶/i.test(x.textContent||'')&&!/daily|freund/i.test(x.textContent||''));if(e)e.click();});
await p.waitForTimeout(2500);
await p.evaluate(()=>{const e=[...document.querySelectorAll('button,a,.btn')].find(x=>/los geht|geht's/i.test(x.textContent||''));if(e)e.click();});
await p.waitForTimeout(3500);
await p.screenshot({path:`${OUT}/UniGoat-spiel.png`, clip:{x:0,y:0,width:390,height:844}});
console.log('OK spiel');
await b.close();
