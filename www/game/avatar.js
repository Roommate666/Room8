/* ============================================================================
 * UniGoat Avatar v3 — Galerie-Modell (hochwertige Higgsfield-Renders).
 * renderGoatAvatar(config, size) -> HTML-String (div: Flaggen-/Farb-Hintergrund + Avatar-Bild).
 *   config = { avatar, flag, bg }
 * Bilder liegen unter /game/assets/avatars/<avatar>.webp (absoluter Pfad -> auf allen Seiten gleich).
 * ========================================================================== */
(function (root) {
  'use strict';

  var PATH = '/game/assets/avatars/';
  var AVATARS = ['classic','hoodie','suit','jersey','dress','lab','graduate','king','cool','gamer','winter','chef','superhero','astronaut','ninja','dino'];
  var AV_LABELS = {
    classic:'Klassisch', hoodie:'Hoodie', suit:'Anzug', jersey:'Trikot', dress:'Kleid',
    lab:'Kittel', graduate:'Absolvent', king:'Koenig', cool:'Cool', gamer:'Gamer', winter:'Winter', chef:'Koch',
    superhero:'Superheld', astronaut:'Astronaut', ninja:'Ninja', dino:'Dino'
  };
  var BG = { mint:'#21D0A1', sky:'#7cc6ff', peach:'#ffb27c', lav:'#b6a8ff', gold:'#F4B740', grey:'#e5e7eb', night:'#2b3040', rose:'#ff9fb6' };
  // Echte Flaggen-SVGs (Nationalflaggen, gemeinfrei) statt Emoji -> randlos, scharf, geraeteunabhaengig.
  var FLAG_PATH = '/game/assets/flags/';
  var FLAG_CODES = ['none','de','tr','at','ch','it','fr','es','pt','gb','us','nl','pl','ro','gr','ua','ru','hr','rs','ba','al','xk','sy','iq','ir','ma','tn','dz','eg','in','pk','cn','vn','ng','gh','br','mx'];
  var DEFAULTS = { avatar:'classic', flag:'none', bg:'mint' };

  function renderGoatAvatar(config, size) {
    var c = {}; for (var k in DEFAULTS) c[k] = (config && config[k] != null) ? config[k] : DEFAULTS[k];
    if (AVATARS.indexOf(c.avatar) === -1) c.avatar = 'classic';
    var s = size || 96, h = Math.round(s * 1.2);
    var bg = BG[c.bg] || BG.mint;
    // Echte Flagge randlos als Hintergrund; leichter Verlauf unten fuers Erden der Ziege
    var flagLayer = (c.flag && c.flag !== 'none')
      ? '<div style="position:absolute;inset:0;background:url(' + FLAG_PATH + c.flag + '.svg) center/cover no-repeat;"></div>' +
        '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(0,0,0,.16));"></div>'
      : '';
    return (
      '<div class="ug-av" style="position:relative;width:' + s + 'px;height:' + h + 'px;border-radius:16%;overflow:hidden;background:' + bg + ';">' +
      flagLayer +
      '<img src="' + PATH + c.avatar + '.webp" alt="Ziege" loading="lazy" style="position:absolute;left:8%;bottom:0;width:84%;height:90%;object-fit:contain;object-position:bottom center;" onerror="this.style.display=\'none\'">' +
      '</div>'
    );
  }

  var api = { renderGoatAvatar: renderGoatAvatar, DEFAULTS: DEFAULTS, PATH: PATH,
    AVATARS: AVATARS, AV_LABELS: AV_LABELS, BG: BG, FLAG_PATH: FLAG_PATH, FLAG_CODES: FLAG_CODES,
    OPTIONS: { avatar: AVATARS, flag: FLAG_CODES, bg: Object.keys(BG) } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GoatAvatar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
