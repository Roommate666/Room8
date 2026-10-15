// analytics.js — produkt-internes Event-Tracking ueber die eigene DB (track_event-RPC).
// DSGVO: keine Cookies, keine Drittpartei, nur eingeloggte Nutzer. Fire-and-forget, nie blockierend.
// Nutzung: UGTrack.track('coupon_redeemed', { coupon_id: '...' });  // Pageviews laufen automatisch.
(function () {
  'use strict';

  var queue = [];  // Events die vor dem Laden von window.sb anfallen -> puffern, nicht verwerfen

  function send(event, props) {
    try {
      var sb = window.sb;
      if (!sb || typeof sb.rpc !== 'function') return false;  // sb noch nicht bereit
      sb.rpc('track_event', {
        p_event: String(event || '').slice(0, 60),
        p_props: (props && typeof props === 'object') ? props : {}
      }).then(function () {}, function () {});
      return true;
    } catch (e) { return true; /* still: Fehler nicht endlos re-queuen */ }
  }

  function track(event, props) {
    if (!send(event, props)) queue.push([event, props]);  // puffern bis sb da ist
  }

  function flush() {
    var q = queue.splice(0);
    for (var i = 0; i < q.length; i++) send(q[i][0], q[i][1]);
  }

  function pageview() {
    // Letztes Pfad-Segment; fuer Unterordner-index (z.B. /game/index.html) den Ordner voranstellen
    var parts = location.pathname.split('/').filter(Boolean);
    var f = (parts.pop() || 'index').replace(/\.html$/, '');
    if (f === 'index' && parts.length) f = parts.pop() + '/index';
    track('pageview', { page: f || 'index' });
  }

  window.UGTrack = { track: track };

  // Sobald window.sb (config.js) bereit ist: gepufferte Events senden + Auto-Pageview
  var n = 0;
  (function boot() {
    if (window.sb) { flush(); pageview(); return; }
    if (n++ > 40) return;
    setTimeout(boot, 100);
  })();
})();
