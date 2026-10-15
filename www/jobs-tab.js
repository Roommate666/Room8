// jobs-tab.js — blendet den Jobs-Tab in die .tabbar ein (analog events-tab.js).
// Zeigt den Tab NUR, wenn:
//   1. app_config.jobs_enabled = true ist, UND
//   2. mindestens ein aktiver Job existiert (kein leerer Tab).
// Schalter aus -> dieses Script tut NICHTS, die App bleibt unveraendert.
// Position: direkt nach Coupons (Coupons . [Jobs] . [Events] . Game ...).
(function(){
  'use strict';

  function iconJob(){
    return '<svg class="icn" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="0"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>';
  }

  function insertTab(){
    var bar = document.querySelector('nav.tabbar');
    if(!bar) return;
    if(bar.querySelector('a[data-tab="jobs"]')) return; // schon eingefuegt

    var cur = (location.pathname.split('/').pop() || '');
    var onJobs = (cur === 'jobs.html' || cur === 'job-detail.html' || cur === 'job-create.html');

    var a = document.createElement('a');
    a.className = 'tab';
    a.setAttribute('href', 'jobs.html');
    a.setAttribute('data-tab', 'jobs');
    if(onJobs) a.setAttribute('aria-current', 'page');
    a.innerHTML = iconJob() + 'Jobs';

    // Jobs IMMER direkt nach Coupons (vor einem evtl. Events-Tab) -> Coupons . Jobs . Events
    var coup = bar.querySelector('a[href="coupons.html"]');
    if(coup && coup.nextSibling) bar.insertBefore(a, coup.nextSibling);
    else bar.appendChild(a);
  }

  async function maybeShow(){
    var s = window.sb;
    if(!s) return;
    try{
      var cfg = await s.from('app_config').select('value').eq('key','jobs_enabled').maybeSingle();
      if(!cfg.data || cfg.data.value !== true) return;           // Schalter aus
      var cnt = await s.from('jobs').select('id', { count:'exact', head:true })
                        .eq('status','active').eq('is_test', false);
      if((cnt.count || 0) < 1) return;                           // kein leerer Tab
      insertTab();
    }catch(e){ if(window.Room8Sentry) Room8Sentry.captureException(e); /* sonst still: lieber kein Tab als ein kaputter */ }
  }

  var n = 0;
  function run(tries){
    if(window.sb){ maybeShow(); return; }
    if(tries > 20) return;
    setTimeout(function(){ run(tries + 1); }, 100);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ run(0); });
  else run(0);
})();
