// verifyGate.js - Shared Verifizierungs-Sperre mit modernem Overlay
// Aufruf: verifyGate({ blur: ['#mainContent'], message: 'Text...' })
// Benoetigt: sb (Supabase client) muss vorher definiert sein

(function() {
    // CSS einmalig injizieren
    var style = document.createElement('style');
    style.textContent = [
        '@keyframes vgFadeIn { from { opacity: 0; } to { opacity: 1; } }',
        '@keyframes vgSlideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }',
        '@keyframes vgPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }',
        '.vg-overlay {',
        '  position: fixed; top: 0; left: 0; right: 0; bottom: 0;',
        '  background: rgba(0,0,0,0.35);',
        '  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);',
        '  z-index: 50; display: flex; align-items: center; justify-content: center;',
        '  padding: 1.5rem;',
        '  animation: vgFadeIn 0.4s ease;',
        '}',
        '.vg-card {',
        '  background: rgba(255,255,255,0.97);',
        '  border-radius: 24px;',
        '  max-width: 380px; width: 100%;',
        '  overflow: hidden;',
        '  box-shadow: 0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.3);',
        '  animation: vgSlideUp 0.5s ease;',
        '}',
        '.vg-card-top {',
        '  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);',
        '  padding: 2rem 2rem 1.5rem;',
        '  text-align: center;',
        '  position: relative;',
        '  overflow: hidden;',
        '}',
        '.vg-card-top::before {',
        '  content: "";',
        '  position: absolute; top: -50%; right: -50%;',
        '  width: 100%; height: 100%;',
        '  background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);',
        '  border-radius: 50%;',
        '}',
        '.vg-icon {',
        '  width: 64px; height: 64px;',
        '  background: rgba(255,255,255,0.2);',
        '  border-radius: 50%;',
        '  display: flex; align-items: center; justify-content: center;',
        '  margin: 0 auto 1rem;',
        '  font-size: 1.8rem;',
        '  animation: vgPulse 3s ease infinite;',
        '}',
        '.vg-card-top h3 {',
        '  color: white; margin: 0;',
        '  font-size: 1.2rem; font-weight: 700;',
        '  letter-spacing: -0.3px;',
        '}',
        '.vg-card-body {',
        '  padding: 1.5rem 2rem 2rem;',
        '  text-align: center;',
        '}',
        '.vg-card-body p {',
        '  color: #6b7280; margin: 0 0 1.5rem;',
        '  line-height: 1.6; font-size: 0.95rem;',
        '}',
        '.vg-btn {',
        '  display: inline-flex; align-items: center; gap: 0.5rem;',
        '  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);',
        '  color: white; padding: 0.9rem 2.5rem;',
        '  border-radius: 99px; text-decoration: none;',
        '  font-weight: 600; font-size: 1rem;',
        '  box-shadow: 0 4px 20px rgba(102,126,234,0.4);',
        '  transition: transform 0.2s, box-shadow 0.2s;',
        '}',
        '.vg-btn:active {',
        '  transform: scale(0.97);',
        '  box-shadow: 0 2px 10px rgba(102,126,234,0.3);',
        '}',
    ].join('\n');
    document.head.appendChild(style);

    // Hilfsfunktion: Overlay via DOM erstellen (kein innerHTML)
    function buildOverlay(message) {
        var overlay = document.createElement('div');
        overlay.className = 'vg-overlay';

        var card = document.createElement('div');
        card.className = 'vg-card';

        // Card Top
        var cardTop = document.createElement('div');
        cardTop.className = 'vg-card-top';

        var iconWrap = document.createElement('div');
        iconWrap.className = 'vg-icon';
        iconWrap.textContent = '\uD83D\uDD12';

        var _t = (typeof Room8i18n !== 'undefined') ? Room8i18n.t : function(k) { return k; };
        var h3 = document.createElement('h3');
        h3.textContent = _t('verify_required');

        cardTop.appendChild(iconWrap);
        cardTop.appendChild(h3);

        // Card Body
        var cardBody = document.createElement('div');
        cardBody.className = 'vg-card-body';

        var p = document.createElement('p');
        p.textContent = message;

        var btn = document.createElement('a');
        btn.href = 'verify-options.html';
        btn.className = 'vg-btn';

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        var path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'M9 12l2 2 4-4');
        var path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z');
        svg.appendChild(path1);
        svg.appendChild(path2);

        var btnText = document.createTextNode(' ' + _t('verify_now'));
        btn.appendChild(svg);
        btn.appendChild(btnText);

        cardBody.appendChild(p);
        cardBody.appendChild(btn);

        card.appendChild(cardTop);
        card.appendChild(cardBody);
        overlay.appendChild(card);

        return overlay;
    }

    window.verifyGate = async function(opts) {
        opts = opts || {};
        var blurSelectors = opts.blur || [];
        var _t2 = (typeof Room8i18n !== 'undefined') ? Room8i18n.t : function(k) { return k; };
        var message = opts.message || _t2('verify_default_message');

        if (typeof sb === 'undefined' || !sb) return false;

        try {
            var result = await sb.auth.getUser();
            var user = result.data ? result.data.user : null;
            if (!user) return false;

            var profResult = await sb.from('profiles').select('is_verified, is_student_verified').eq('id', user.id).single();
            var profile = profResult.data;
            var isVerified = profile && (profile.is_verified || profile.is_student_verified);

            if (isVerified) return false; // Kein Gate noetig

            // Overlay erstellen und anzeigen (blur wird in showVerifyOverlay gemacht)
            showVerifyOverlay(blurSelectors, message);
            return true; // Gate aktiv
        } catch (err) {
            console.error('verifyGate error:', err);
            return false;
        }
    };

    // Nur Overlay anzeigen (fuer Seiten mit eigener Logik wie Owner-Check)
    function showVerifyOverlay(blurSelectors, message) {
        blurSelectors.forEach(function(sel) {
            var el = document.querySelector(sel);
            if (el) {
                el.style.filter = 'blur(16px) saturate(0.5)';
                el.style.pointerEvents = 'none';
                el.style.userSelect = 'none';
                el.style.transition = 'filter 0.5s ease';
            }
        });
        var overlay = buildOverlay(message);
        // Overlay in app-container einfuegen statt body,
        // damit Header (z-index:100) darueber bleibt
        var container = document.querySelector('.app-container');
        if (container) {
            overlay.style.position = 'absolute';
            container.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }
    }
    window.showVerifyOverlay = showVerifyOverlay;
})();
