// Room8 Cookie-Consent Banner (TTDSG-konform, § 25 Abs. 1)
// Zeigt ein Opt-In-Banner beim ersten Besuch.
// Bis Einwilligung: keine nicht-essentiellen Tracker (Sentry, FCM Token-Persist).
(function () {
  'use strict';
  var STORAGE_KEY = 'room8_cookie_consent_v1';
  // Vorhandene Entscheidung lesen
  function getConsent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
  }
  // Entscheidung speichern + global flag für andere Scripts setzen
  function setConsent(consent) {
    var rec = { accepted: !!consent.accepted, analytics: !!consent.analytics, push: !!consent.push, timestamp: new Date().toISOString(), version: 1 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
    window.Room8Consent = rec;
    document.dispatchEvent(new CustomEvent('room8:consent', { detail: rec }));
    hideBanner();
  }
  function hideBanner() {
    var b = document.getElementById('r8-cookie-banner');
    if (b) b.remove();
  }
  function showBanner() {
    if (document.getElementById('r8-cookie-banner')) return;
    var html =
      '<div id="r8-cookie-banner" role="dialog" aria-labelledby="r8-cc-title" style="' +
        'position:fixed; left:1rem; right:1rem; bottom:calc(1rem + env(safe-area-inset-bottom, 0px));' +
        'background:white; border-radius:18px; box-shadow:0 8px 40px rgba(0,0,0,0.15); padding:1.25rem;' +
        'z-index:99999; max-width:520px; margin:0 auto; border:1px solid rgba(0,0,0,0.06); font-family:-apple-system, sans-serif; line-height:1.5;">' +
        '<div id="r8-cc-title" style="font-weight:800; font-size:1rem; color:#111827; margin-bottom:0.4rem;">🍪 Datenschutz-Einstellungen</div>' +
        '<p style="font-size:0.88rem; color:#4B5563; margin:0 0 0.85rem;">Wir nutzen technisch notwendige Cookies für Login und Sprache. Optional helfen uns Fehler-Tracking (Sentry) und Push-Notifications, die Plattform zu verbessern. Du entscheidest. <a href="datenschutz.html" style="color:#2563EB; text-decoration:underline;">Mehr</a></p>' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">' +
          '<button id="r8-cc-all"  style="flex:1; min-width:140px; background:linear-gradient(135deg,#3B82F6,#2563EB); color:white; border:none; padding:0.85rem 1rem; border-radius:12px; font-weight:700; font-size:0.92rem; cursor:pointer;">Alle akzeptieren</button>' +
          '<button id="r8-cc-min"  style="flex:1; min-width:140px; background:#F3F4F6; color:#374151; border:none; padding:0.85rem 1rem; border-radius:12px; font-weight:600; font-size:0.92rem; cursor:pointer;">Nur notwendige</button>' +
        '</div>' +
        '<button id="r8-cc-cust" style="margin-top:0.5rem; background:transparent; color:#6B7280; border:none; font-size:0.82rem; text-decoration:underline; cursor:pointer; padding:0.25rem;">Einzeln auswählen</button>' +
      '</div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstChild);
    document.getElementById('r8-cc-all').onclick = function () { setConsent({ accepted: true, analytics: true, push: true }); };
    document.getElementById('r8-cc-min').onclick = function () { setConsent({ accepted: true, analytics: false, push: false }); };
    document.getElementById('r8-cc-cust').onclick = showCustomSheet;
  }
  function showCustomSheet() {
    hideBanner();
    var html =
      '<div id="r8-cookie-banner" role="dialog" style="' +
        'position:fixed; left:1rem; right:1rem; bottom:calc(1rem + env(safe-area-inset-bottom, 0px));' +
        'background:white; border-radius:18px; box-shadow:0 8px 40px rgba(0,0,0,0.18); padding:1.25rem;' +
        'z-index:99999; max-width:520px; margin:0 auto; border:1px solid rgba(0,0,0,0.06); font-family:-apple-system, sans-serif; line-height:1.5;">' +
        '<div style="font-weight:800; font-size:1rem; color:#111827; margin-bottom:0.85rem;">Einzelne Auswahl</div>' +
        '<label style="display:flex; align-items:start; gap:0.6rem; padding:0.5rem 0; border-bottom:1px solid #F3F4F6;">' +
          '<input type="checkbox" checked disabled style="margin-top:0.2rem;">' +
          '<span style="font-size:0.88rem;"><strong>Technisch notwendig</strong><br><span style="color:#6B7280; font-size:0.8rem;">Login-Session, Spracheinstellung. Kann nicht deaktiviert werden.</span></span>' +
        '</label>' +
        '<label style="display:flex; align-items:start; gap:0.6rem; padding:0.5rem 0; border-bottom:1px solid #F3F4F6;">' +
          '<input type="checkbox" id="r8-cc-opt-analytics" style="margin-top:0.2rem;">' +
          '<span style="font-size:0.88rem;"><strong>Fehler-Diagnostik (Sentry)</strong><br><span style="color:#6B7280; font-size:0.8rem;">Anonyme Crash-Reports. Keine E-Mails oder Tokens.</span></span>' +
        '</label>' +
        '<label style="display:flex; align-items:start; gap:0.6rem; padding:0.5rem 0;">' +
          '<input type="checkbox" id="r8-cc-opt-push" style="margin-top:0.2rem;">' +
          '<span style="font-size:0.88rem;"><strong>Push-Benachrichtigungen</strong><br><span style="color:#6B7280; font-size:0.8rem;">FCM-Token-Speicherung für Push. Native Dialog erfolgt zusätzlich.</span></span>' +
        '</label>' +
        '<div style="display:flex; gap:0.5rem; margin-top:0.85rem;">' +
          '<button id="r8-cc-save" style="flex:1; background:linear-gradient(135deg,#3B82F6,#2563EB); color:white; border:none; padding:0.85rem 1rem; border-radius:12px; font-weight:700; font-size:0.92rem; cursor:pointer;">Auswahl speichern</button>' +
        '</div>' +
      '</div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstChild);
    document.getElementById('r8-cc-save').onclick = function () {
      setConsent({
        accepted: true,
        analytics: document.getElementById('r8-cc-opt-analytics').checked,
        push: document.getElementById('r8-cc-opt-push').checked
      });
    };
  }
  // Public API
  window.Room8CookieConsent = {
    get: getConsent,
    show: showBanner,
    reset: function () { localStorage.removeItem(STORAGE_KEY); window.Room8Consent = null; showBanner(); }
  };
  // Init
  document.addEventListener('DOMContentLoaded', function () {
    var c = getConsent();
    if (c) { window.Room8Consent = c; return; }
    setTimeout(showBanner, 800);
  });
})();
