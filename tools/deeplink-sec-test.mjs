import { chromium } from 'playwright';
const B='https://unigoat-spa.pages.dev';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto(B+'/login.html',{waitUntil:'networkidle'});
await p.fill('#loginEmail','redbull-demo@unigoat.de'); await p.fill('#loginPassword','RedBull2026!');
await p.click('#loginBtn'); await p.waitForTimeout(6000);
async function testDL(url){
  return await p.evaluate((u)=>{ try{ window.__ugDeepLink(u); }catch(e){}
    var a=document.querySelector('#frames iframe.active');
    var tab=a?a.getAttribute('data-tab'):null;
    var loc=''; try{ loc=a.contentWindow.location.href; }catch(e){ loc='blocked'; }
    return {tab, loc:loc.replace(/^https?:\/\/[^/]+\//,'').slice(0,40)}; }, url);
}
await p.evaluate(()=>location.hash='#hub'); await p.waitForTimeout(800);
console.log('BOESE javascript: ->', JSON.stringify(await testDL('javascript:alert(1)')), '(soll: KEIN javascript in loc)');
await p.waitForTimeout(800);
console.log('BOESE //evil.com ->', JSON.stringify(await testDL('//evil.com/x')), '(soll: nicht evil.com)');
await p.waitForTimeout(800);
console.log('BOESE http://evil.com ->', JSON.stringify(await testDL('http://evil.com')), '(soll: nicht evil.com)');
await p.waitForTimeout(1500);
console.log('GUT coupons.html ->', JSON.stringify(await testDL('coupons.html')), '(soll: coupons-Tab)');
await b.close();
