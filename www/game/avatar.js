/* ============================================================================
 * UniGoat Avatar v2 — parametrisierte GANZKOERPER-Ziege ("Bitmoji").
 * renderGoatAvatar(config, size) -> SVG-String. DOM-frei, ueberall einsetzbar.
 *   config = { fur, bg, flag, glasses, hat, outfit, accessory }
 * - Ganzkoerper: Kopf + Hals + Oberkoerper + Beine (stehend, Vorderansicht)
 * - flag: Laender-Flagge als Hintergrund (deckt alle Nationen ab)
 * - outfit: Anzug/Hoodie/Trikot/Kleid auf dem Oberkoerper
 * ========================================================================== */
(function (root) {
  'use strict';

  var FUR = {
    grey:   { body: '#e7e9ee', shade: '#c9ccd6', muzzle: '#f4f5f8', dark: '#b7bcc8' },
    white:  { body: '#fbfcff', shade: '#e2e6ef', muzzle: '#ffffff', dark: '#d4d9e4' },
    caramel:{ body: '#e7c9a3', shade: '#cfa877', muzzle: '#f6e6cf', dark: '#c19a63' },
    brown:  { body: '#b98a5e', shade: '#9a6d44', muzzle: '#e3c8aa', dark: '#875c37' },
    black:  { body: '#565b66', shade: '#3d424c', muzzle: '#767c8b', dark: '#2f333b' },
    mint:   { body: '#bfece0', shade: '#8fd6c4', muzzle: '#e3f7f1', dark: '#77c6b2' },
  };
  var BG = { mint:'#21D0A1', sky:'#7cc6ff', peach:'#ffb27c', lav:'#b6a8ff', gold:'#F4B740', grey:'#e5e7eb', night:'#2b3040', rose:'#ff9fb6' };
  // Laender-Flaggen als Emoji (deckt alle Nationen ab, universell). 'none' = nur Farbe.
  var FLAGS = {
    none:'', de:'🇩🇪', tr:'🇹🇷', at:'🇦🇹', ch:'🇨🇭', it:'🇮🇹', fr:'🇫🇷', es:'🇪🇸', pt:'🇵🇹',
    gb:'🇬🇧', us:'🇺🇸', nl:'🇳🇱', pl:'🇵🇱', ro:'🇷🇴', gr:'🇬🇷', ua:'🇺🇦', ru:'🇷🇺', hr:'🇭🇷',
    rs:'🇷🇸', ba:'🇧🇦', al:'🇦🇱', xk:'🇽🇰', sy:'🇸🇾', iq:'🇮🇶', ir:'🇮🇷', ma:'🇲🇦', tn:'🇹🇳',
    dz:'🇩🇿', eg:'🇪🇬', in:'🇮🇳', pk:'🇵🇰', cn:'🇨🇳', vn:'🇻🇳', ng:'🇳🇬', gh:'🇬🇭', br:'🇧🇷', mx:'🇲🇽',
  };
  var OUTFITS = ['none', 'suit', 'hoodie', 'jersey', 'dress', 'lab'];
  var DEFAULTS = { fur:'grey', bg:'mint', flag:'none', glasses:'none', hat:'none', outfit:'none', accessory:'none' };

  function esc(v){ return String(v).replace(/[<>&"]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }

  function background(cfg){
    var bg = BG[cfg.bg] || BG.mint;
    var out = '<rect width="100" height="120" fill="' + esc(bg) + '"/>';
    var fl = FLAGS[cfg.flag];
    if (fl) {
      // Flagge gross als Hintergrund + leichter Weiss-Schleier fuer Kontrast zur Ziege
      out += '<text x="50" y="74" font-size="120" text-anchor="middle" dominant-baseline="middle">' + fl + '</text>';
      out += '<rect width="100" height="120" fill="#ffffff" opacity="0.14"/>';
    }
    return out;
  }

  function legs(f){
    // 4 Beine (Vorderansicht): 2 hinten (dunkler) + 2 vorne
    return (
      '<g>' +
      '<rect x="34" y="86" width="7" height="24" rx="3.2" fill="' + f.dark + '"/>' +
      '<rect x="59" y="86" width="7" height="24" rx="3.2" fill="' + f.dark + '"/>' +
      '<rect x="30" y="90" width="8" height="22" rx="3.5" fill="' + f.body + '"/>' +
      '<rect x="62" y="90" width="8" height="22" rx="3.5" fill="' + f.body + '"/>' +
      '<rect x="30" y="106" width="8" height="6" rx="2" fill="' + f.shade + '"/>' +
      '<rect x="62" y="106" width="8" height="6" rx="2" fill="' + f.shade + '"/>' +
      '</g>'
    );
  }
  function bodyShape(f){
    return (
      // Oberkoerper/Rumpf
      '<ellipse cx="50" cy="78" rx="27" ry="22" fill="' + f.body + '"/>' +
      '<ellipse cx="50" cy="84" rx="22" ry="16" fill="' + f.shade + '" opacity="0.28"/>' +
      // Bauch heller
      '<ellipse cx="50" cy="82" rx="14" ry="12" fill="' + f.muzzle + '" opacity="0.55"/>' +
      // Hals
      '<rect x="43" y="52" width="14" height="18" rx="7" fill="' + f.body + '"/>'
    );
  }
  function outfit(kind, f){
    if (kind === 'suit') return (
      '<g>' +
      '<path d="M36 66 L50 74 L64 66 L66 96 L34 96 Z" fill="#2b3140"/>' +
      '<path d="M50 74 L44 96 L56 96 Z" fill="#f4f6f8"/>' +          // Hemd
      '<path d="M50 74 l-3 8 l3 5 l3 -5 z" fill="#e0334d"/>' +        // Krawatte
      '<path d="M36 66 L50 74 L44 80 Z" fill="#20242e"/><path d="M64 66 L50 74 L56 80 Z" fill="#20242e"/>' +
      '</g>'
    );
    if (kind === 'hoodie') return (
      '<g>' +
      '<path d="M32 70 Q50 60 68 70 L70 98 L30 98 Z" fill="#21D0A1"/>' +
      '<path d="M40 66 Q50 62 60 66 L58 74 Q50 70 42 74 Z" fill="#12B489"/>' + // Kapuze
      '<rect x="48" y="80" width="4" height="16" fill="#0e9b76"/>' +           // Zipper
      '</g>'
    );
    if (kind === 'jersey') return (
      '<g>' +
      '<path d="M34 68 Q50 62 66 68 L68 96 L32 96 Z" fill="#ffffff"/>' +
      '<path d="M34 68 L32 96 L40 96 L41 70 Z" fill="#21D0A1"/>' +
      '<path d="M66 68 L68 96 L60 96 L59 70 Z" fill="#21D0A1"/>' +
      '<text x="50" y="90" font-size="14" font-weight="700" text-anchor="middle" fill="#15181C" font-family="Arial">10</text>' +
      '</g>'
    );
    if (kind === 'dress') return (
      '<g>' +
      '<path d="M40 68 Q50 63 60 68 L72 100 L28 100 Z" fill="#ff5ea8"/>' +
      '<path d="M40 68 Q50 63 60 68 L58 78 Q50 74 42 78 Z" fill="#e0468e"/>' +
      '<circle cx="44" cy="86" r="1.6" fill="#fff"/><circle cx="52" cy="92" r="1.6" fill="#fff"/><circle cx="58" cy="84" r="1.6" fill="#fff"/>' +
      '</g>'
    );
    if (kind === 'lab') return (
      '<g>' +
      '<path d="M34 68 Q50 62 66 68 L68 100 L32 100 Z" fill="#f4f6f8"/>' +
      '<path d="M50 70 L44 100 M50 70 L56 100" stroke="#d4d9e4" stroke-width="1.5"/>' +
      '<rect x="52" y="76" width="6" height="8" rx="1" fill="#21D0A1"/>' +   // Stift-Tasche
      '</g>'
    );
    return '';
  }
  function ears(f){
    return (
      '<ellipse cx="30" cy="34" rx="9" ry="6" transform="rotate(-30 30 34)" fill="' + f.body + '"/>' +
      '<ellipse cx="70" cy="34" rx="9" ry="6" transform="rotate(30 70 34)" fill="' + f.body + '"/>' +
      '<ellipse cx="31" cy="35" rx="4.6" ry="2.6" transform="rotate(-30 31 35)" fill="' + f.shade + '"/>' +
      '<ellipse cx="69" cy="35" rx="4.6" ry="2.6" transform="rotate(30 69 35)" fill="' + f.shade + '"/>'
    );
  }
  function horns(f){
    return (
      '<path d="M39 24 C31 16 31 8 36 6 C37 12 41 17 44 22 Z" fill="' + f.dark + '"/>' +
      '<path d="M61 24 C69 16 69 8 64 6 C63 12 59 17 56 22 Z" fill="' + f.dark + '"/>'
    );
  }
  function head(f){
    return (
      '<path d="M50 16 C64 16 72 26 72 40 C72 54 62 62 50 62 C38 62 28 54 28 40 C28 26 36 16 50 16 Z" fill="' + f.body + '"/>' +
      '<ellipse cx="50" cy="48" rx="20" ry="16" fill="' + f.shade + '" opacity="0.16"/>' +
      '<ellipse cx="50" cy="50" rx="12.5" ry="9.5" fill="' + f.muzzle + '"/>' +
      '<ellipse cx="45" cy="48.5" rx="1.3" ry="1.9" fill="#8a6b5e"/>' +
      '<ellipse cx="55" cy="48.5" rx="1.3" ry="1.9" fill="#8a6b5e"/>' +
      '<path d="M50 53 C48 56 52 56 50 53" stroke="#8a6b5e" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
      '<path d="M47 60 Q50 70 53 60 Q50 63 47 60 Z" fill="' + f.shade + '"/>'
    );
  }
  function eyes(){
    return (
      '<ellipse cx="43" cy="39" rx="4.8" ry="5.4" fill="#fff"/>' +
      '<ellipse cx="57" cy="39" rx="4.8" ry="5.4" fill="#fff"/>' +
      '<circle cx="43.8" cy="39.8" r="2.4" fill="#2b2f38"/>' +
      '<circle cx="57.2" cy="39.8" r="2.4" fill="#2b2f38"/>' +
      '<circle cx="44.7" cy="38.9" r="0.8" fill="#fff"/>' +
      '<circle cx="58.1" cy="38.9" r="0.8" fill="#fff"/>'
    );
  }
  function glasses(kind){
    if (kind === 'sun') return '<g><rect x="35" y="35" width="12" height="8" rx="3" fill="#22252c"/><rect x="53" y="35" width="12" height="8" rx="3" fill="#22252c"/><rect x="47" y="37.5" width="6" height="2" fill="#22252c"/><rect x="36" y="36.5" width="5" height="1.6" rx="0.8" fill="#4b5563" opacity="0.7"/></g>';
    if (kind === 'nerd') return '<g fill="none" stroke="#2b2f38" stroke-width="1.8"><circle cx="43" cy="39" r="6.4"/><circle cx="57" cy="39" r="6.4"/><path d="M49.4 39 h1.2"/></g>';
    return '';
  }
  function hat(kind){
    if (kind === 'beanie') return '<g><path d="M30 22 C34 8 66 8 70 22 Z" fill="#12B489"/><rect x="29" y="20" width="42" height="6" rx="3" fill="#0e9b76"/><circle cx="50" cy="6" r="3.4" fill="#e9fbf5"/></g>';
    if (kind === 'cap') return '<g><path d="M31 21 C36 9 64 9 69 21 Z" fill="#3b82f6"/><path d="M50 21 h24 c-2 4 -9 6 -14 5 Z" fill="#2563eb"/></g>';
    if (kind === 'grad') return '<g><rect x="38" y="16" width="24" height="7" rx="1.5" fill="#2b2f38"/><path d="M28 15 L50 8 L72 15 L50 22 Z" fill="#1f2430"/><path d="M70 15 v9" stroke="#F4B740" stroke-width="1.4"/><circle cx="70" cy="25" r="1.8" fill="#F4B740"/></g>';
    if (kind === 'party') return '<g><path d="M50 2 L59 20 L41 20 Z" fill="#ff5ea8"/><circle cx="50" cy="2" r="2.6" fill="#F4B740"/><circle cx="46" cy="14" r="1.3" fill="#fff"/><circle cx="54" cy="17" r="1.3" fill="#fff"/></g>';
    if (kind === 'crown') return '<g><path d="M36 20 L38 8 L44 15 L50 6 L56 15 L62 8 L64 20 Z" fill="#F4B740"/><circle cx="50" cy="7" r="1.6" fill="#e0334d"/></g>';
    return '';
  }
  function accessory(kind){
    if (kind === 'scarf') return '<g><path d="M40 62 Q50 68 60 62 L60 66 Q50 72 40 66 Z" fill="#ef4444"/><rect x="54" y="64" width="5" height="12" rx="2" fill="#dc2626"/></g>';
    if (kind === 'chain') return '<g fill="none" stroke="#F4B740" stroke-width="2"><path d="M42 62 Q50 70 58 62"/></g><circle cx="50" cy="69" r="2.6" fill="#F4B740"/>';
    if (kind === 'flower') return '<g transform="translate(66 30)"><circle r="1.8" fill="#F4B740"/><g fill="#ff8fc7"><circle cx="0" cy="-3" r="1.8"/><circle cx="0" cy="3" r="1.8"/><circle cx="-3" cy="0" r="1.8"/><circle cx="3" cy="0" r="1.8"/></g></g>';
    if (kind === 'headphones') return '<g fill="none" stroke="#2b2f38" stroke-width="2.4"><path d="M30 38 Q50 14 70 38"/></g><rect x="27" y="36" width="6" height="10" rx="3" fill="#2b2f38"/><rect x="67" y="36" width="6" height="10" rx="3" fill="#2b2f38"/>';
    return '';
  }

  function renderGoatAvatar(config, size){
    var c = {}; for (var k in DEFAULTS) c[k] = (config && config[k] != null) ? config[k] : DEFAULTS[k];
    var f = FUR[c.fur] || FUR.grey;
    var s = size || 96;
    var h = Math.round(s * 1.2); // Hochformat 100:120 -> kein Verzerren, Hintergrund fuellt
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + h + '" viewBox="0 0 100 120" role="img" aria-label="Ziegen-Avatar">' +
      '<clipPath id="cg"><rect width="100" height="120" rx="16"/></clipPath>' +
      '<g clip-path="url(#cg)">' +
      background(c) +
      legs(f) + bodyShape(f) + outfit(c.outfit, f) +
      ears(f) + horns(f) + head(f) + eyes() + glasses(c.glasses) +
      accessory(c.accessory) + hat(c.hat) +
      '</g></svg>'
    );
  }

  var api = { renderGoatAvatar: renderGoatAvatar, DEFAULTS: DEFAULTS,
    OPTIONS: { fur: Object.keys(FUR), bg: Object.keys(BG), flag: Object.keys(FLAGS),
      glasses: ['none','sun','nerd'], hat: ['none','beanie','cap','grad','party','crown'],
      outfit: OUTFITS, accessory: ['none','scarf','chain','flower','headphones'] },
    FLAGS: FLAGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GoatAvatar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
