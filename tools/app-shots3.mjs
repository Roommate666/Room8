import { chromium } from 'playwright';
const B='https://unigoat.de';
const OUT='/Users/yusufcash/Desktop/UNIGOAT-SCREENSHOTS-v2';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'de-DE'});
const p=await ctx.newPage();
await p.goto(B+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4500);
await p.goto(B+'/game/index.html',{waitUntil:'networkidle',timeout:20000}); await p.waitForTimeout(2500);
// Spielen
await p.evaluate(()=>{const e=[...document.querySelectorAll('button,a,.btn')].find(x=>/spielen|▶/i.test(x.textContent||'')&&!/daily|freund/i.test(x.textContent||''));if(e)e.click();});
await p.waitForTimeout(2500);
// Tutorial "Los geht's" wegklicken
const t1=await p.evaluate(()=>{const e=[...document.querySelectorAll('button,a,.btn')].find(x=>/los geht|geht's|start|verstanden|weiter/i.test(x.textContent||''));if(e){e.click();return e.textContent.trim();}return null;});
console.log('Tutorial-Button:',t1);
await p.waitForTimeout(4000);
// evtl. zweites Overlay
await p.evaluate(()=>{const e=[...document.querySelectorAll('button,a,.btn')].find(x=>/los geht|geht's|start|verstanden|ok/i.test(x.textContent||''));if(e)e.click();});
await p.waitForTimeout(2500);
await p.screenshot({path:`${OUT}/UniGoat-spiel.png`, clip:{x:0,y:0,width:390,height:844}});
// Debug: was ist sichtbar?
const txt=await p.evaluate(()=>(document.body.innerText||'').replace(/\s+/g,' ').slice(0,80));
console.log('Sichtbar:',txt);
await b.close();
