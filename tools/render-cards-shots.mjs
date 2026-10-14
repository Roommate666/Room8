// Farbiges Duell-Board + Coupon-Detail fuer StartupSUED-Karten. Demo=redbull-demo.
import { chromium } from 'playwright';
const BASE='https://unigoat.de', EMAIL='redbull-demo@unigoat.de', PASS='RedBull2026!';
const OUT=process.env.HOME+'/Desktop/UNIGOAT-STARTUPSUED';
const COUPON='d399fab9-78bc-4da8-bd78-c250f2048649';
const browser=await chromium.launch({channel:'chrome'});
const ctx=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const page=await ctx.newPage();
await page.goto(BASE+'/login.html',{waitUntil:'domcontentloaded'});
await page.fill('#loginEmail',EMAIL); await page.fill('#loginPassword',PASS); await page.click('#loginBtn');
await page.waitForTimeout(4500);

// --- Duell FARBIG ---
await page.goto(BASE+'/game/duel.html',{waitUntil:'networkidle',timeout:25000});
await page.waitForTimeout(2500);
await page.evaluate(()=>{
  var lobby=document.getElementById('lobby'); if(lobby){lobby.classList.add('hidden');lobby.style.display='none';}
  var game=document.getElementById('game'); if(game){game.classList.remove('hidden');game.style.display='block';}
  var set=(id,v)=>{var e=document.getElementById(id);if(e)e.textContent=v;};
  set('meName','Du');set('meScore','9.240');set('oppName','Jonas');set('oppScore','7.680');
  set('coinBar','1.240');set('gameWagerN','50');
  var wp=document.getElementById('gameWager'); if(wp) wp.classList.remove('hidden');
  var board=document.getElementById('board');
  if(board){
    board.innerHTML='';
    for(var i=0;i<64;i++){var c=document.createElement('div');c.className='cell';c.style.setProperty('--cell','44px');board.appendChild(c);}
    var heights=[4,5,3,6,5,4,6,3], filled=[];
    for(var col=0;col<8;col++){for(var k=0;k<heights[col];k++){filled.push((7-k)*8+col);}}
    [7*8+3,6*8+5,5*8+0].forEach(function(x){var p=filled.indexOf(x);if(p>=0)filled.splice(p,1);});
    filled.forEach(function(idx){var cell=board.children[idx];if(cell){var r=Math.floor(idx/8),col=idx%8;cell.className='cell filled tn uc'+((r+col)%6);}});
  }
  var mini=document.getElementById('oppMini');
  if(mini){mini.innerHTML='';for(var m=0;m<64;m++){var mc=document.createElement('i');if([56,57,48,49,58,50,40].indexOf(m)>=0)mc.style.background='#2FCB63';mini.appendChild(mc);}}
});
await page.waitForTimeout(700);
await page.screenshot({path:OUT+'/app-duel-v2.png'});
console.log('app-duel-v2.png (farbig) gerendert');

// --- Coupon-Detail ---
await page.goto(BASE+'/coupon-detail.html?id='+COUPON,{waitUntil:'networkidle',timeout:25000});
await page.waitForTimeout(2600);
await page.screenshot({path:OUT+'/app-deal-v2.png'});
console.log('app-deal-v2.png gerendert');

await browser.close();
