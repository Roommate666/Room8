// analytics.js — produkt-internes Event-Tracking ueber die eigene DB (track_event-RPC).
// DSGVO: keine Cookies, keine Drittpartei, nur eingeloggte Nutzer. Fire-and-forget, nie blockierend.
// Nutzung: UGTrack.track('coupon_redeemed', { coupon_id: '...' });  // Pageviews laufen automatisch.
(function () {
  'use strict';

  function track(event, props) {
    try {
      var sb = window.sb;
      if (!sb || typeof sb.rpc !== 'function') return;
      sb.rpc('track_event', {
        p_event: String(event || '').slice(0, 60),
        p_props: (props && typeof props === 'object') ? props : {}
      }).then(function () {}, function () {});
    } catch (e) { /* still: Tracking darf nie den Flow stoeren */ }
  }

  function pageview() {
    var f = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
    track('pageview', { page: f || 'index' });
  }

  window.UGTrack = { track: track };

  // Auto-Pageview, sobald window.sb (config.js) bereit ist
  var n = 0;
  (function boot() {
    if (window.sb) { pageview(); return; }
    if (n++ > 40) return;
    setTimeout(boot, 100);
  })();
})();
