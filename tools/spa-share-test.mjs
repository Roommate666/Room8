// Klaert den Teilen-Flow: existiert navigator.share im iframe (web-share allow)? Und mit ECHTER Geste -> Clipboard?
import { chromium } from 'playwright';
const BASE='https://unigoat-spa.pages.dev';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});
const p=await ctx.newPage();

await p.goto(BASE+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(4000);
await p.goto(BASE+'/index.html',{waitUntil:'load'}); await p.waitForTimeout(3000);

// zu friends (ueber Hub Party-Lostopf)
await p.evaluate(()=>location.hash='#hub'); await p.waitForTimeout(1500);
await p.evaluate(()=>{var f=document.querySelector('#frames iframe.active');var a=f.contentDocument.querySelector('a[href*="friends"]');if(a)a.click();});
await p.waitForTimeout(3000);

// navigator.share im iframe verfuegbar? (web-share allow durchgereicht?)
const shareApi = await p.evaluate(()=>{ var f=document.querySelector('#frames iframe.active'); var w=f.contentWindow; return { hasShare: typeof w.navigator.share==='function', hasClipboard: !!(w.navigator.clipboard&&w.navigator.clipboard.writeText) }; });
console.log('navigator.share im iframe:', shareApi.hasShare?'VERFUEGBAR (web-share allow wirkt)':'nicht da', '| clipboard:', shareApi.hasClipboard);

// navigator.share stubben, um zu sehen ob der Button ihn AUFRUFT (ohne echtes Share-Sheet im Headless)
await p.evaluate(()=>{ var f=document.querySelector('#frames iframe.active'); var w=f.contentWindow; w.__shareCalled=null; w.navigator.share=function(data){ w.__shareCalled=data; return Promise.resolve(); }; });

// ECHTE Geste: Button im iframe per frameLocator klicken
try{
  await p.frameLocator('#frames iframe.active').locator('#shareBtn').click({timeout:5000});
}catch(e){ console.log('frameLocator-Klick Problem:', e.message.split('\n')[0]); }
await p.waitForTimeout(1500);

const shared = await p.evaluate(()=>{ var f=document.querySelector('#frames iframe.active'); return f.contentWindow.__shareCalled; });
console.log('Teilen-Button ruft navigator.share auf:', shared?('JA ✓  url='+(shared.url||'').slice(0,50)):'nein (dann Clipboard-Pfad)');
if(!shared){ const clip=await p.evaluate(async()=>{try{return await navigator.clipboard.readText();}catch(e){return 'ERR';}}); console.log('Clipboard-Fallback:', /https?:/.test(clip)?('LINK ✓ '+clip.slice(0,45)):clip); }

await b.close();
