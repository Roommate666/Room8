// Pflicht-Onboarding-Gate.
// Faengt eingeloggte User mit UNVOLLSTAENDIGEM Profil ab (Stadt/Username/Name fehlt)
// und leitet sie zu complete-profile.html. Loest zwei Probleme:
//   1) Google/iCloud-OAuth (Web) landet direkt auf dashboard.html und ueberspringt
//      den Profil-Schritt -> User ohne Stadt.
//   2) Ohne Stadt kein City-Push -> Wachstums-Loop tot fuer die Mehrheit.
// Auf complete-profile/login/register/auth-Seiten greift es bewusst NICHT.
(function () {
  var path = (window.location.pathname || '').toLowerCase();
  if (/complete-profile|login|register|auth|verify|datenschutz|impressum|agb|disclaimer|inserieren/.test(path)) return;

  function check() {
    if (!window.supabase || typeof SUPABASE_URL === 'undefined') return;
    var sb = window.__gateSb || (window.__gateSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    sb.auth.getUser().then(function (res) {
      var user = res && res.data && res.data.user;
      if (!user) return; // nicht eingeloggt -> Seite regelt Login selbst
      sb.from('profiles').select('username, full_name, city').eq('id', user.id).maybeSingle().then(function (p) {
        var prof = p && p.data;
        var incomplete = !prof || !prof.username || !prof.full_name || !prof.city ||
          /^user[_-]?[0-9a-f]{4,}/i.test(prof.username || '');
        if (incomplete) window.location.replace('complete-profile.html');
      }).catch(function () {});
    }).catch(function () {});
  }

  if (document.readyState !== 'loading') check();
  else document.addEventListener('DOMContentLoaded', check);
})();
