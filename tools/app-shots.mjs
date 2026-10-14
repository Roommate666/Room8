import { chromium } from 'playwright';
const B='https://unigoat.de';
const OUT='/Users/yusufcash/Desktop/UNIGOAT-SCREENSHOTS';
const b=await chromium.launch();
// echtes Handy-Format, Retina (3x) -> knackscharf
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'de-DE'});
const p=await ctx.newPage();
// Login
await p.goto(B+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4500);
const screens=[
  ['hub','dashboard.html',3000],
  ['coupons','coupons.html',3500],
  ['spiel','game/index.html',3500],
  ['rang','challenge.html',3500],
  ['profil','profile.html',3500],
  ['freunde','friends.html',3500],
];
for(const [name,url,wait] of screens){
  try{
    await p.goto(B+'/'+url,{waitUntil:'networkidle',timeout:20000});
    await p.waitForTimeout(wait);
    // nur der sichtbare Handy-Screen (clip auf Viewport), kein Fullpage
    await p.screenshot({path:`${OUT}/UniGoat-${name}.png`, clip:{x:0,y:0,width:390,height:844}});
    console.log('OK', name);
  }catch(e){ console.log('FAIL', name, e.message.split('\n')[0]); }
}
await b.close();
