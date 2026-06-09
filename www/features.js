// ==========================================
// ROOM8 FEATURE FLAGS (Single Source of Truth)
// ==========================================
// Strategie 05.06.2026 (Mentor-Empfehlung): App auf single-sided Features
// reduzieren (Coupons -> Jobs -> Events), um User ohne Henne-Ei-Problem zu
// gewinnen. Two-sided Features (Wohnungen/Gegenstaende/Chat) bleiben im Code
// erhalten und werden spaeter als Hype-Update reaktiviert.
//
// RE-LAUNCH: Einfach das jeweilige Flag auf true setzen + neuen App-Build
// ausliefern. Der Code der Features ist unveraendert vorhanden.
// ==========================================

(function() {
    'use strict';

    window.ROOM8_FEATURES = {
        coupons: true,
        jobs: true,
        events: true,
        // --- Spaeter-Phase (two-sided, aktuell versteckt) ---
        housing: false,      // Wohnungen (wohnungen/wohnung/upload/saved-searches)
        marketplace: false,  // Gegenstaende (gegenstaende/gegenstand/detail/listing-details)
        chat: false          // Nachrichten/Chat (nachrichten/chat)
    };

    // Map: Seite -> benoetigtes Feature. Seiten die hier stehen werden bei
    // deaktiviertem Feature sofort auf coupons.html umgeleitet.
    var PAGE_FEATURE = {
        'wohnungen.html': 'housing',
        'wohnung.html': 'housing',
        'upload.html': 'housing',
        'saved-searches.html': 'housing',
        'gegenstaende.html': 'marketplace',
        'gegenstand.html': 'marketplace',
        'detail.html': 'marketplace',
        'listing-details.html': 'marketplace',
        'choose-listing.html': 'housing',
        'vertragsvorlagen.html': 'housing',
        'nachrichten.html': 'chat',
        'chat.html': 'chat'
    };

    function currentFile() {
        var path = window.location.pathname;
        var f = path.substring(path.lastIndexOf('/') + 1);
        if (f.indexOf('?') !== -1) f = f.substring(0, f.indexOf('?'));
        return f || 'index.html';
    }

    // Pruefen ob ein Feature aktiv ist
    window.featureEnabled = function(name) {
        return window.ROOM8_FEATURES[name] !== false;
    };

    // Self-Guard: laeuft sofort beim Laden. Liegt die aktuelle Seite hinter
    // einem deaktivierten Feature -> raus zu Coupons (Start der reduzierten App).
    var file = currentFile();
    var needed = PAGE_FEATURE[file];
    if (needed && window.ROOM8_FEATURES[needed] === false) {
        window.location.replace('coupons.html');
    }

    // DOM-Guard: blendet Elemente mit data-feature="X" aus, wenn Flag X aus ist.
    // So bleiben Buttons/Sektionen im HTML erhalten (Re-Launch), sind aber
    // in der reduzierten App unsichtbar.
    function hideDisabledFeatureElements() {
        var els = document.querySelectorAll('[data-feature]');
        for (var i = 0; i < els.length; i++) {
            var f = els[i].getAttribute('data-feature');
            if (window.ROOM8_FEATURES[f] === false) {
                els[i].style.display = 'none';
            }
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideDisabledFeatureElements);
    } else {
        hideDisabledFeatureElements();
    }
})();
