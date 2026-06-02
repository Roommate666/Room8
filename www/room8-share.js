// Teilen-Helper: oeffnet den nativen Share-Dialog (WhatsApp, Instagram, Story,
// Telegram, Kopieren ...) und faellt auf Zwischenablage zurueck.
// Geteilt wird /s/<id> -> Server-Side-OG-Vorschau (Bild + Titel + Preis) -> App.
(function () {
  window.Room8Share = function (opts) {
    opts = opts || {};
    var shareUrl = opts.id
      ? ('https://www.room8.club/s/' + encodeURIComponent(opts.id))
      : (opts.url || window.location.href);
    var data = { title: opts.title || 'Room8', text: opts.text || '', url: shareUrl };

    if (navigator.share) {
      navigator.share(data).catch(function () { /* User-Abbruch ignorieren */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(function () {
        if (window.Room8UI) Room8UI.success('Link kopiert - jetzt einfuegen!');
        else window.prompt('Link kopieren:', shareUrl);
      }).catch(function () { window.prompt('Link kopieren:', shareUrl); });
    } else {
      window.prompt('Link kopieren:', shareUrl);
    }
  };
})();
