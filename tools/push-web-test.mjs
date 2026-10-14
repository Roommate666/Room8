import { chromium } from 'playwright';
const B='https://2ac579d7.unigoat-spa.pages.dev';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
// Login -> Shell
await p.goto(B+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(5000);
const inShell=await p.evaluate(()=>!!document.getElementById('frames'));
const hasHook=await p.evaluate(()=>typeof window.__ugDeepLink==='function');
const sbShell=await p.evaluate(()=>!!window.sb);
const pushLoaded=await p.evaluate(()=>!!window.PushService);
console.log('Login -> Shell:', inShell);
console.log('Deeplink-Hook __ugDeepLink da:', hasHook);
console.log('window.sb in Shell (fuer Token-Save):', sbShell);
console.log('PushService geladen:', pushLoaded);
// Deeplink-Test: Haupt-Seite -> Tab
await p.evaluate(()=>window.__ugDeepLink('coupons.html')); await p.waitForTimeout(1500);
const tab1=await p.evaluate(()=>{var a=document.querySelector('#frames iframe.active');return a?a.getAttribute('data-tab'):null;});
console.log('Deeplink coupons.html -> aktiver Tab:', tab1, '(soll coupons)');
// Deeplink-Test: Nicht-Tab-Ziel -> im aktiven iframe geoeffnet
await p.evaluate(()=>window.__ugDeepLink('notifications.html')); await p.waitForTimeout(2500);
const url2=await p.evaluate(()=>{try{var a=document.querySelector('#frames iframe.active');return a.contentWindow.location.pathname;}catch(e){return '?';}});
console.log('Deeplink notifications.html -> aktives iframe URL:', url2.replace(/^.*\//,''), '(soll notifications.html)');
const real=errs.filter(x=>!/mime|favicon|sentry|manifest|status of 4/i.test(x));
console.log('JS-Fehler:', real.length?real.slice(0,3).join(' // '):'keine');
await b.close();
