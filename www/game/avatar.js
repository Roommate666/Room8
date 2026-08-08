/* ============================================================================
 * UniGoat Avatar — parametrisierte SVG-Ziege ("Bitmoji").
 * renderGoatAvatar(config, size) -> SVG-String. DOM-frei, ueberall einsetzbar
 * (Board, Profil, Editor). Config wird als profiles.avatar_config (jsonb) gespeichert.
 *   config = { fur, bg, glasses, hat, accessory }
 * ========================================================================== */
(function (root) {
  'use strict';

  const FUR = {
    grey:   { body: '#e7e9ee', shade: '#c9ccd6', muzzle: '#f4f5f8' },
    white:  { body: '#fbfcff', shade: '#dfe3ec', muzzle: '#ffffff' },
    caramel:{ body: '#e7c9a3', shade: '#cfa877', muzzle: '#f6e6cf' },
    brown:  { body: '#b98a5e', shade: '#9a6d44', muzzle: '#e3c8aa' },
    black:  { body: '#4a4f5a', shade: '#343842', muzzle: '#6b7080' },
    mint:   { body: '#bfece0', shade: '#8fd6c4', muzzle: '#e3f7f1' },
  };
  const BG = {
    mint:  '#21D0A1', sky: '#7cc6ff', peach: '#ffb27c', lav: '#b6a8ff',
    gold:  '#F4B740', grey: '#e5e7eb', night: '#2b3040',
  };
  const DEFAULTS = { fur: 'grey', bg: 'mint', glasses: 'none', hat: 'none', accessory: 'none' };

  function esc(v) { return String(v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

  function horns(shade) {
    return (
      '<path d="M34 30 C24 20 24 10 30 7 C31 14 36 20 40 26 Z" fill="' + shade + '"/>' +
      '<path d="M66 30 C76 20 76 10 70 7 C69 14 64 20 60 26 Z" fill="' + shade + '"/>'
    );
  }
  function ears(body, shade) {
    return (
      '<ellipse cx="24" cy="44" rx="11" ry="7" transform="rotate(-28 24 44)" fill="' + body + '"/>' +
      '<ellipse cx="76" cy="44" rx="11" ry="7" transform="rotate(28 76 44)" fill="' + body + '"/>' +
      '<ellipse cx="26" cy="45" rx="6" ry="3.4" transform="rotate(-28 26 45)" fill="' + shade + '"/>' +
      '<ellipse cx="74" cy="45" rx="6" ry="3.4" transform="rotate(28 74 45)" fill="' + shade + '"/>'
    );
  }
  function face(f) {
    return (
      // Kopf
      '<path d="M50 22 C68 22 78 34 78 52 C78 72 66 84 50 84 C34 84 22 72 22 52 C22 34 32 22 50 22 Z" fill="' + f.body + '"/>' +
      // Wangen-Schattierung
      '<ellipse cx="50" cy="60" rx="26" ry="22" fill="' + f.shade + '" opacity="0.18"/>' +
      // Schnauze
      '<ellipse cx="50" cy="66" rx="17" ry="13" fill="' + f.muzzle + '"/>' +
      // Nasenloecher
      '<ellipse cx="44" cy="64" rx="1.7" ry="2.4" fill="#8a6b5e"/>' +
      '<ellipse cx="56" cy="64" rx="1.7" ry="2.4" fill="#8a6b5e"/>' +
      // Mund
      '<path d="M50 70 C47 74 53 74 50 70" stroke="#8a6b5e" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      // Ziegenbart
      '<path d="M46 78 Q50 92 54 78 Q50 82 46 78 Z" fill="' + f.shade + '"/>'
    );
  }
  function eyes() {
    return (
      '<ellipse cx="41" cy="52" rx="6.2" ry="7" fill="#fff"/>' +
      '<ellipse cx="59" cy="52" rx="6.2" ry="7" fill="#fff"/>' +
      '<circle cx="42.2" cy="53" r="3.1" fill="#2b2f38"/>' +
      '<circle cx="57.8" cy="53" r="3.1" fill="#2b2f38"/>' +
      '<circle cx="43.4" cy="51.8" r="1" fill="#fff"/>' +
      '<circle cx="59" cy="51.8" r="1" fill="#fff"/>'
    );
  }
  function glasses(kind) {
    if (kind === 'sun') return (
      '<g>' +
      '<rect x="33" y="47" width="15" height="10" rx="4" fill="#22252c"/>' +
      '<rect x="52" y="47" width="15" height="10" rx="4" fill="#22252c"/>' +
      '<rect x="47" y="50" width="6" height="2.4" fill="#22252c"/>' +
      '<rect x="34" y="48.5" width="6" height="2" rx="1" fill="#4b5563" opacity="0.7"/>' +
      '</g>'
    );
    if (kind === 'nerd') return (
      '<g fill="none" stroke="#2b2f38" stroke-width="2.2">' +
      '<circle cx="41" cy="52" r="8"/>' +
      '<circle cx="59" cy="52" r="8"/>' +
      '<path d="M49 52 h2"/>' +
      '</g>'
    );
    return '';
  }
  function hat(kind) {
    if (kind === 'beanie') return (
      '<g>' +
      '<path d="M26 34 C30 18 70 18 74 34 Z" fill="#12B489"/>' +
      '<rect x="25" y="32" width="50" height="7" rx="3.5" fill="#0e9b76"/>' +
      '<circle cx="50" cy="15" r="4" fill="#e9fbf5"/>' +
      '</g>'
    );
    if (kind === 'cap') return (
      '<g>' +
      '<path d="M27 33 C33 19 67 19 73 33 Z" fill="#3b82f6"/>' +
      '<path d="M50 33 h28 c-2 5 -10 7 -16 6 Z" fill="#2563eb"/>' +
      '</g>'
    );
    if (kind === 'grad') return (
      '<g>' +
      '<rect x="34" y="26" width="32" height="9" rx="2" fill="#2b2f38"/>' +
      '<path d="M24 24 L50 16 L76 24 L50 32 Z" fill="#1f2430"/>' +
      '<path d="M74 24 v10" stroke="#F4B740" stroke-width="1.6"/>' +
      '<circle cx="74" cy="35" r="2" fill="#F4B740"/>' +
      '</g>'
    );
    if (kind === 'party') return (
      '<g>' +
      '<path d="M50 8 L60 30 L40 30 Z" fill="#ff5ea8"/>' +
      '<circle cx="50" cy="8" r="3" fill="#F4B740"/>' +
      '<circle cx="46" cy="22" r="1.6" fill="#fff"/><circle cx="54" cy="26" r="1.6" fill="#fff"/>' +
      '</g>'
    );
    return '';
  }
  function accessory(kind) {
    if (kind === 'scarf') return (
      '<g>' +
      '<path d="M30 82 Q50 92 70 82 L70 88 Q50 98 30 88 Z" fill="#ef4444"/>' +
      '<rect x="60" y="84" width="7" height="14" rx="2" fill="#dc2626"/>' +
      '</g>'
    );
    if (kind === 'chain') return (
      '<g fill="none" stroke="#F4B740" stroke-width="2.4">' +
      '<path d="M36 82 Q50 92 64 82"/>' +
      '</g><circle cx="50" cy="90" r="3.2" fill="#F4B740"/>'
    );
    if (kind === 'flower') return (
      '<g transform="translate(70 40)">' +
      '<circle cx="0" cy="0" r="2.4" fill="#F4B740"/>' +
      '<g fill="#ff8fc7">' +
      '<circle cx="0" cy="-4" r="2.4"/><circle cx="0" cy="4" r="2.4"/><circle cx="-4" cy="0" r="2.4"/><circle cx="4" cy="0" r="2.4"/>' +
      '</g></g>'
    );
    return '';
  }

  function renderGoatAvatar(config, size) {
    const c = Object.assign({}, DEFAULTS, config || {});
    const f = FUR[c.fur] || FUR.grey;
    const bg = BG[c.bg] || BG.mint;
    const s = size || 96;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 100 100" role="img" aria-label="Ziegen-Avatar">' +
      '<clipPath id="cg"><circle cx="50" cy="50" r="50"/></clipPath>' +
      '<g clip-path="url(#cg)">' +
      '<rect width="100" height="100" fill="' + esc(bg) + '"/>' +
      horns(f.shade) + ears(f.body, f.shade) + face(f) + eyes() +
      glasses(c.glasses) + hat(c.hat) + accessory(c.accessory) +
      '</g></svg>'
    );
  }

  const api = { renderGoatAvatar, FUR: Object.keys(FUR), BG: Object.keys(BG), DEFAULTS,
    OPTIONS: { fur: Object.keys(FUR), bg: Object.keys(BG),
      glasses: ['none', 'sun', 'nerd'], hat: ['none', 'beanie', 'cap', 'grad', 'party'],
      accessory: ['none', 'scarf', 'chain', 'flower'] } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GoatAvatar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
