// Pflicht-Onboarding-Gate.
// Faengt eingeloggte User mit UNVOLLSTAENDIGEM Profil ab (Stadt/Username/Name fehlt)
// und leitet sie zu complete-profile.html. Loest:
//   1) Google/iCloud-OAuth (Web) landet direkt in der App und ueberspringt den
//      Profil-Schritt -> User ohne Stadt.
//   2) Ohne Stadt kein City-Push -> Wachstums-Loop tot fuer die Mehrheit.
// WICHTIG (Haertung 09.06.): FAIL-OPEN. Nur umleiten wenn das Profil NACHWEISLICH
// unvollstaendig ist. Wenn der Read fehlschlaegt (RLS/Timing/Netzwerk) -> NICHT
// umleiten (sonst Endlos-Loop fuer vollstaendige User). Plus Loop-Schutz pro Session.
(function () {
  var path = (window.location.pathname || '').toLowerCase();
  if (/complete-profile|login|register|auth|verify|datenschutz|impressum|agb|disclaimer|inserieren/.test(path)) return;
  // Loop-Schutz: pro Tab nur einmal umleiten. Verhindert harten Redirect-Loop.
  try { if (sessionStorage.getItem('og_redirected') === '1') return; } catch (e) {}

  function check() {
    if (!window.supabase || typeof SUPABASE_URL === 'undefined') return;
    var sb = window.__gateSb || (window.__gateSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    sb.auth.getUser().then(function (res) {
      var user = res && res.data && res.data.user;
      if (!user) return; // nicht eingeloggt -> Seite regelt Login selbst
      // Eigen-Read ueber my_profile-View (zuverlaessiger als profiles direkt).
      sb.from('my_profile').select('username, full_name, city').maybeSingle().then(function (p) {
        // FAIL-OPEN: Read-Fehler ODER kein Datensatz -> NICHT umleiten.
        if (!p || p.error || !p.data) return;
        var prof = p.data;
        var incomplete = !prof.username || !prof.full_name || !prof.city ||
          /^user[_-]?[0-9a-f]{4,}/i.test(prof.username || '');
        if (incomplete) {
          try { sessionStorage.setItem('og_redirected', '1'); } catch (e) {}
          window.location.replace('complete-profile.html');
        }
      }).catch(function () { /* fail-open */ });
    }).catch(function () { /* fail-open */ });
  }

  if (document.readyState !== 'loading') check();
  else document.addEventListener('DOMContentLoaded', check);
})();
