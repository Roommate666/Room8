// events-tab.js — blendet den Events-Tab in die .tabbar ein.
// Zentral statt in jeder Seite dupliziert. Zeigt den Tab NUR, wenn:
//   1. der Admin-Schalter app_config.events_enabled = true ist, UND
//   2. mindestens ein sichtbares Event existiert (Sicherheitsnetz gegen leeren Tab).
// Schalter aus -> dieses Script tut NICHTS, die App bleibt unveraendert (5 Tabs).
(function(){
  'use strict';

  function iconCalendar(){
    // Gleicher .icn-Stil wie die bestehenden Tab-Icons (eckig, stroke currentColor)
    return '<svg class="icn" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="0"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>';
  }

  function insertTab(){
    var bar = document.querySelector('nav.tabbar');
    if(!bar) return;
    if(bar.querySelector('a[data-tab="events"]')) return; // schon eingefuegt

    var cur = (location.pathname.split('/').pop() || '');
    var onEvents = (cur === 'events.html' || cur === 'event-detail.html' || cur === 'event-create.html');

    var a = document.createElement('a');
    a.className = 'tab';
    a.setAttribute('href', 'events.html');
    a.setAttribute('data-tab', 'events');
    if(onEvents) a.setAttribute('aria-current', 'page');
    a.innerHTML = iconCalendar() + 'Events';

    // Position: Hub . Coupons . [Events] . Game . Rang . Profil
    var coup = bar.querySelector('a[href="coupons.html"]');
    if(coup && coup.nextSibling) bar.insertBefore(a, coup.nextSibling);
    else bar.appendChild(a);
  }

  async function maybeShow(){
    if(!window.sb) return;
    try{
      var cfg = await sb.from('app_config').select('value').eq('key','events_enabled').maybeSingle();
      if(!cfg.data || cfg.data.value !== true) return;           // Schalter aus
      var cnt = await sb.from('events').select('id', { count:'exact', head:true })
                        .eq('status','active').eq('is_test', false);
      if((cnt.count || 0) < 1) return;                           // kein leerer Tab
      insertTab();
    }catch(e){ /* still: lieber kein Tab als ein kaputter */ }
  }

  // window.sb kommt aus config.js; kurz nachwarten falls noch nicht initialisiert
  function run(tries){
    if(window.sb){ maybeShow(); return; }
    if(tries > 20) return;
    setTimeout(function(){ run(tries + 1); }, 100);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ run(0); });
  else run(0);
})();
