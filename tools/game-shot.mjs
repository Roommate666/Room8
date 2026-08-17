import { chromium } from 'playwright';
const b=await chromium.launch({channel:'chrome'});
const c=await b.newContext({viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await c.newPage();
await p.goto('https://unigoat.de/login.html',{waitUntil:'domcontentloaded'});
await p.fill('#loginEmail','redbull-demo@unigoat.de');await p.fill('#loginPassword','RedBull2026!');await p.click('#loginBtn');
await p.waitForTimeout(4000);
await p.goto('https://unigoat.de/game/index.html',{waitUntil:'networkidle'});await p.waitForTimeout(2500);
await p.click('#btnHigh').catch(()=>{});await p.waitForTimeout(1400);
await p.click('#helpClose').catch(()=>{});
await p.evaluate(()=>{var hp=document.getElementById('helpPanel');if(hp)hp.hidden=true;});
await p.waitForTimeout(400);
await p.evaluate(()=>{
  const N=8, cells=document.querySelectorAll('#board .cell');
  // Fuellmuster: eine fast-volle Reihe unten + ein Bergsegment (gleiche Farbe) -> nahtlose Masse
  const g=Array.from({length:N},()=>Array(N).fill(0));
  for(let x=0;x<7;x++)g[7][x]=1;            // fast fertige Reihe
  for(let x=0;x<6;x++)g[6][x]=1;
  for(let x=0;x<4;x++)g[5][x]=1;
  for(let x=0;x<2;x++)g[4][x]=1;
  const col='#22b463';
  for(let r=0;r<N;r++)for(let x=0;x<N;x++){ if(!g[r][x])continue;
    const el=cells[r*N+x]; el.className='cell filled tn'; el.style.setProperty('--c',col); el.textContent='';
    if(r>0&&g[r-1][x])el.classList.add('nT');
    if(r<N-1&&g[r+1][x])el.classList.add('nB');
    if(x>0&&g[r][x-1])el.classList.add('nL');
    if(x<N-1&&g[r][x+1])el.classList.add('nR');
  }
  var s=document.getElementById('score');if(s)s.textContent='12.480';
});
await p.waitForTimeout(600);
await p.screenshot({path:process.env.HOME+'/Desktop/game-eckig.png'});
await b.close();console.log('shot ok');
