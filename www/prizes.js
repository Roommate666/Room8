// prizes.js - Monats-Preise der G-Coins-Rangliste (Tabelle monthly_prizes, nur Lesen).
// Keine Zeile fuer den laufenden Monat -> nichts wird angezeigt, die Seite bleibt wie vorher.
// Nutzung: UGPrizes.render(el, {variant:'paper'|'game', base:'' | '../', cta:{href,text}})
//          UGPrizes.load().then(function(list){ ... })   // list = [{place,title}] oder []
(function(){
  'use strict';
  var MONTHS=['Januar','Februar','M\u00e4rz','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  var cache=null;

  function monthKey(d){
    var m=d.getMonth()+1;
    return d.getFullYear()+'-'+(m<10?'0':'')+m+'-01';
  }

  function load(){
    if(cache) return cache;
    cache=new Promise(function(resolve){
      var s=window.sb;
      if(!s){ resolve([]); return; }
      try{
        s.from('monthly_prizes').select('place,title').eq('month',monthKey(new Date())).order('place')
          .then(function(r){ resolve((r&&r.data)||[]); }, function(){ resolve([]); });
      }catch(e){ resolve([]); }
    });
    return cache;
  }

  function daysLeftText(){
    var now=new Date();
    var last=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    var left=last-now.getDate();
    if(left<=0) return 'Letzter Tag!';
    return 'noch '+left+(left===1?' Tag':' Tage');
  }

  var CSS=''+
    '.mp{margin:16px var(--space-5,20px) 16px;border:2px solid var(--color-text,#201e1d);background:var(--color-bg,#f3f2f2);color:var(--color-text,#201e1d);font-family:var(--font-heading,inherit)}'+
    '.mp-head{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--color-text,#201e1d);color:var(--color-bg,#f3f2f2);padding:9px 14px;font-weight:800;font-size:13px;letter-spacing:.02em;text-transform:uppercase}'+
    '.mp-left{color:var(--color-accent,#12B489);white-space:nowrap}'+
    '.mp-list{list-style:none;margin:0;padding:6px 14px}'+
    '.mp-list li{display:flex;align-items:baseline;gap:10px;padding:7px 0;border-bottom:1px solid var(--color-divider,rgba(0,0,0,.2));font-weight:800;font-size:16px;line-height:1.3}'+
    '.mp-list li:last-child{border-bottom:0}'+
    '.mp-pl{min-width:22px;font-size:13px;opacity:.65}'+
    '.mp .mp-list li>span{display:inline-block;width:auto;text-align:left;flex:0 0 auto;word-break:normal}'+
    '.mp .mp-list li>span.mp-ti{flex:1 1 auto}'+
    '.mp-foot{padding:0 14px 11px;font-family:var(--font-body,inherit);font-size:12px;line-height:1.45;opacity:.8}'+
    '.mp-foot a{color:inherit;text-decoration:underline}'+
    '.mp-cta{display:block;text-align:center;padding:10px 14px;border-top:2px solid var(--color-text,#201e1d);font-weight:800;font-size:14px;text-decoration:none;color:inherit;background:var(--color-accent,#12B489)}'+
    '.mp--game{margin:0 0 10px;border:1.5px solid #f0c95a;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#fff7e0,#ffefc2);color:#7a5a12;font-family:inherit}'+
    '.mp--game .mp-head{background:#f0c95a;color:#5a400a;border-radius:0;font-size:12px}'+
    '.mp--game .mp-left{color:#c1355e}'+
    '.mp--game .mp-list li{font-size:14px;border-bottom-color:rgba(122,90,18,.2)}'+
    '.mp--game .mp-foot{font-size:11.5px}'+
    '.mp-line{display:block;margin:6px auto 10px;max-width:320px;padding:7px 12px;border-radius:999px;background:linear-gradient(180deg,#fff7e0,#ffefc2);border:1.5px solid #f0c95a;color:#7a5a12;font-size:12.5px;line-height:1.35;text-decoration:none;text-align:center}';

  function injectCss(){
    if(document.getElementById('mpCss')) return;
    var st=document.createElement('style'); st.id='mpCss'; st.textContent=CSS;
    document.head.appendChild(st);
  }

  function el(tag,cls,txt){
    var e=document.createElement(tag);
    if(cls) e.className=cls;
    if(txt!=null) e.textContent=txt;
    return e;
  }

  function render(target,opts){
    opts=opts||{};
    if(!target) return Promise.resolve([]);
    return load().then(function(list){
      if(!list.length){ return list; }   // nichts zu zeigen -> Fallback-Inhalt bleibt
      injectCss();
      var now=new Date();
      if(opts.variant==='line'){
        // Kompakt-Zeile (Spiel-Startbildschirm): nur Platz 1 plus Countdown
        var ln=el('a','mp-line');
        ln.href=(opts.base||'')+'challenge.html';
        ln.appendChild(el('b',null,'🏆 Platz 1 im '+MONTHS[now.getMonth()]+': '+String(list[0].title||'')));
        ln.appendChild(el('span',null,' · '+daysLeftText()));
        target.textContent=''; target.appendChild(ln); target.hidden=false; target.style.display='';
        return list;
      }
      var box=el('div','mp'+(opts.variant==='game'?' mp--game':''));
      var head=el('div','mp-head');
      head.appendChild(el('span',null,'🏆 Preise im '+MONTHS[now.getMonth()]));
      head.appendChild(el('span','mp-left',daysLeftText()));
      box.appendChild(head);
      var ol=el('ol','mp-list');
      list.forEach(function(p){
        var li=el('li');
        li.appendChild(el('span','mp-pl',p.place+'.'));
        li.appendChild(el('span','mp-ti',String(p.title||'')));
        ol.appendChild(li);
      });
      box.appendChild(ol);
      var foot=el('div','mp-foot','Top 3 der G-Coins-Rangliste am Monatsende. Nur verifizierte Studenten, Teilnahme kostenlos. ');
      var a=el('a',null,'Teilnahmebedingungen');
      a.href=(opts.base||'')+'nutzungsbedingungen.html#wettkampf';
      foot.appendChild(a);
      box.appendChild(foot);
      if(opts.cta&&opts.cta.href){
        var c=el('a','mp-cta',opts.cta.text||'Zur Rangliste');
        c.href=opts.cta.href;
        box.appendChild(c);
      }
      target.textContent='';
      target.appendChild(box);
      target.hidden=false;
      target.style.display='';
      return list;
    });
  }

  window.UGPrizes={load:load,render:render};
})();
