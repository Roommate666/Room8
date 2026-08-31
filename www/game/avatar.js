/* ============================================================================
 * UniGoat Avatar v3 — Galerie-Modell (hochwertige Higgsfield-Renders).
 * renderGoatAvatar(config, size) -> HTML-String (div: Flaggen-/Farb-Hintergrund + Avatar-Bild).
 *   config = { avatar, flag, bg }
 * Bilder liegen unter /game/assets/avatars/<avatar>.webp (absoluter Pfad -> auf allen Seiten gleich).
 * ========================================================================== */
(function (root) {
  'use strict';

  var PATH = '/game/assets/avatars/';
  var AVATARS = ['classic','hoodie','suit','jersey','dress','lab','graduate','king','cool','gamer','winter','chef','superhero','astronaut','ninja','dino','pirate','rockstar','cowboy'];
  var AV_LABELS = {
    classic:'Klassisch', hoodie:'Hoodie', suit:'Anzug', jersey:'Trikot', dress:'Kleid',
    lab:'Kittel', graduate:'Absolvent', king:'K&ouml;nig', cool:'Cool', gamer:'Gamer', winter:'Winter', chef:'Koch',
    superhero:'Superheld', astronaut:'Astronaut', ninja:'Ninja', dino:'Dino',
    pirate:'Pirat', rockstar:'Rockstar', cowboy:'Cowboy'
  };
  var BG = { mint:'#21D0A1', sky:'#7cc6ff', peach:'#ffb27c', lav:'#b6a8ff', gold:'#F4B740', grey:'#e5e7eb', night:'#2b3040', rose:'#ff9fb6' };
  // Tier-Freischaltung: G-Coins-Schwelle pro Kostuem (Bronze 0 / Silber 1000 / Gold 3000 / Platin 8000)
  var AVATAR_MIN = {
    classic:0, hoodie:0, jersey:0, dress:0, cool:0, winter:0, chef:0, cowboy:0,
    gamer:1000, ninja:1000, pirate:1000, dino:1000, lab:1000,
    suit:3000, graduate:3000, rockstar:3000,
    astronaut:8000
  };
  // Champion-exklusiv: NUR fuer Monats-Gewinner (is_champion), nicht per Coins kaufbar
  var AVATAR_CHAMPION = { king:true };
  // Streak-exklusiv: freigeschaltet ab X Tagen Best-Streak (nicht per Coins kaufbar)
  var AVATAR_STREAK = { superhero:100 };
  function streakFlames(days){ days=days||0; return days>=100?'🔥🔥🔥':days>=30?'🔥🔥':days>=7?'🔥':''; }
  var TIERS = [['Bronze',0],['Silber',1000],['Gold',3000],['Platin',8000]];
  function tierLabel(coins){ var t='Bronze'; for(var i=0;i<TIERS.length;i++){ if((coins||0)>=TIERS[i][1]) t=TIERS[i][0]; } return t; }
  function tierForCoins(min){ for(var i=0;i<TIERS.length;i++){ if(TIERS[i][1]===min) return TIERS[i][0]; } return 'Bronze'; }
  function avatarUnlocked(id, coins){ return (coins||0) >= (AVATAR_MIN[id]||0); }
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

  // Visitenkarte: geteilter Karten-HTML-Baustein (Leaderboard-Tap + Profil-Vorschau)
  function renderVisitenkarte(x){
    x = x || {};
    function e(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    var champ = !!x.is_champion;
    var big = renderGoatAvatar(x.avatar_config||{}, 150);
    var coinsForTier = (x.coins_total!=null) ? x.coins_total : (x.coins||0);
    var tier = tierLabel(Number(coinsForTier)||0);
    var rankLine = x.rank ? ('<span class="pill">#'+x.rank+' · '+(Number(x.coins_month||0)).toLocaleString('de-DE')+' G-Coins</span>')
                          : ('<span class="pill">'+(Number(coinsForTier)||0).toLocaleString('de-DE')+' G-Coins</span>');
    return '<div class="vk'+(champ?' champion':'')+'">'+
      '<button class="close" aria-label="Schliessen">✕</button>'+
      (champ?'<div class="vktitle">🏆 Champion des Monats</div>':'')+
      '<div class="goat">'+big+'</div>'+
      '<div class="vkname">'+(champ?'👑 ':'')+e(x.username||x.full_name||'Anonym')+'</div>'+
      (x.city?'<div class="vkcity">📍 '+e(x.city)+'</div>':'')+
      '<div class="vkrow">'+
        (champ?'<span class="pill champ">👑 Champion</span>':'')+
        ((x.streak||0)>=7?'<span class="pill">'+streakFlames(x.streak)+' '+x.streak+' Tage</span>':'')+
        '<span class="pill">'+tier+'</span>'+ rankLine +
      '</div></div>';
  }

  var api = { renderGoatAvatar: renderGoatAvatar, renderVisitenkarte: renderVisitenkarte, DEFAULTS: DEFAULTS, PATH: PATH,
    AVATARS: AVATARS, AV_LABELS: AV_LABELS, BG: BG, FLAG_PATH: FLAG_PATH, FLAG_CODES: FLAG_CODES,
    AVATAR_MIN: AVATAR_MIN, AVATAR_CHAMPION: AVATAR_CHAMPION, AVATAR_STREAK: AVATAR_STREAK, streakFlames: streakFlames, TIERS: TIERS, tierLabel: tierLabel, tierForCoins: tierForCoins, avatarUnlocked: avatarUnlocked,
    OPTIONS: { avatar: AVATARS, flag: FLAG_CODES, bg: Object.keys(BG) } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GoatAvatar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
