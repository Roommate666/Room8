/* Universal-Link-Router: oeffnet die native App per Link direkt an der richtigen Stelle (z.B. Duell-Einladung).
 * DEFENSIV: registriert den Listener NUR wenn das Capacitor App-Plugin vorhanden ist (native App).
 * Im Web-Browser ist window.Capacitor.Plugins.App nicht da -> die Funktion tut GAR NICHTS (kein Risiko fuer die Web-App).
 */
(function () {
  try {
    var Cap = window.Capacitor;
    if (!Cap || !Cap.Plugins || !Cap.Plugins.App || typeof Cap.Plugins.App.addListener !== 'function') return;
    Cap.Plugins.App.addListener('appUrlOpen', function (data) {
      try {
        var url = data && data.url;
        if (!url) return;
        var u = new URL(url);
        // Nur Duell-Links behandeln -> in-App zur lokalen Duell-Seite navigieren (mit ?code=)
        if (/\/game\/duel\.html/.test(u.pathname)) {
          var target = '/game/duel.html' + (u.search || '');
          if (window.location.pathname.indexOf('/game/duel.html') === -1) {
            window.location.href = target;
          } else {
            // Schon auf der Duell-Seite: neu laden mit dem Code, damit der Auto-Join greift
            window.location.replace(target);
          }
        }
      } catch (e) { /* still */ }
    });
  } catch (e) { /* still */ }
})();
