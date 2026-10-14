import { chromium } from 'playwright';
const B='https://unigoat.de';
const OUT='/Users/yusufcash/Desktop/UNIGOAT-SCREENSHOTS-v2';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'de-DE'});
const p=await ctx.newPage();
await p.goto(B+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4500);

// Hub, Coupons, Freunde - saubere Viewport-Shots
for(const [name,url] of [['hub','dashboard.html'],['coupons','coupons.html'],['freunde','friends.html']]){
  await p.goto(B+'/'+url,{waitUntil:'networkidle',timeout:20000}); await p.waitForTimeout(3000);
  await p.screenshot({path:`${OUT}/UniGoat-${name}.png`, clip:{x:0,y:0,width:390,height:844}});
  console.log('OK',name);
}

// SPIEL: Spiel starten -> Brett mit Bloecken capturen
try{
  await p.goto(B+'/game/index.html',{waitUntil:'networkidle',timeout:20000}); await p.waitForTimeout(3000);
  // "Spielen"-Button finden + klicken
  const clicked=await p.evaluate(()=>{
    const els=[...document.querySelectorAll('button,a,[role=button],.btn')];
    const el=els.find(e=>/spielen|▶/i.test(e.textContent||'')&&!/daily|freund/i.test(e.textContent||''));
    if(el){el.click();return el.textContent.trim().slice(0,20);}return null;
  });
  console.log('Spielen geklickt:',clicked);
  await p.waitForTimeout(4000); // Brett laden lassen
  await p.screenshot({path:`${OUT}/UniGoat-spiel.png`, clip:{x:0,y:0,width:390,height:844}});
  console.log('OK spiel (Brett)');
}catch(e){ console.log('FAIL spiel',e.message.split('\n')[0]); }
await b.close();
