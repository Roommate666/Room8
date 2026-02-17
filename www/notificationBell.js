// ==========================================
// NOTIFICATION BELL - UNIVERSAL VERSION
// Einheitliche Glocke auf allen Seiten
// ==========================================

(function() {
    'use strict';

    var BELL_SUPABASE_URL = null;
    var BELL_SUPABASE_KEY = null;
    var bellSupabase = null;
    var bellInitialized = false;
    var bellRetryCount = 0;
    var MAX_RETRIES = 10;

    // Hole Config-Werte
    function getConfig() {
        if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
            BELL_SUPABASE_URL = SUPABASE_URL;
            BELL_SUPABASE_KEY = SUPABASE_ANON_KEY;
            return true;
        }
        if (typeof window.SUPABASE_URL !== 'undefined' && typeof window.SUPABASE_ANON_KEY !== 'undefined') {
            BELL_SUPABASE_URL = window.SUPABASE_URL;
            BELL_SUPABASE_KEY = window.SUPABASE_ANON_KEY;
            return true;
        }
        return false;
    }

    // Erstelle Supabase Client
    function createSupabaseClient() {
        if (bellSupabase) return bellSupabase;

        if (!getConfig()) {
            return null;
        }

        if (window.supabase && window.supabase.createClient) {
            bellSupabase = window.supabase.createClient(BELL_SUPABASE_URL, BELL_SUPABASE_KEY);
            return bellSupabase;
        }

        return null;
    }

    // Lade Supabase Library dynamisch falls noetig
    function ensureSupabaseLoaded(callback) {
        if (window.supabase && window.supabase.createClient) {
            callback();
            return;
        }

        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.14';
        script.onload = function() {
            setTimeout(callback, 100);
        };
        script.onerror = function() {
            console.log('NotificationBell: Could not load supabase');
        };
        document.head.appendChild(script);
    }

    // Inject CSS Styles - EINHEITLICH
    function injectStyles() {
        if (document.getElementById('notification-bell-styles')) return;

        var css = [
            '/* Notification Bell - Einheitlicher Stil */',
            '.notification-bell-container {',
            '    position: fixed;',
            '    top: calc(12px + env(safe-area-inset-top, 0px));',
            '    right: 16px;',
            '    z-index: 9998;',
            '}',
            '.notification-bell-btn {',
            '    width: 40px;',
            '    height: 40px;',
            '    border-radius: 50%;',
            '    background: rgba(255, 255, 255, 0.95);',
            '    border: none;',
            '    cursor: pointer;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);',
            '    transition: all 0.2s ease;',
            '    position: relative;',
            '}',
            '.notification-bell-btn:hover {',
            '    transform: scale(1.05);',
            '    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);',
            '}',
            '.notification-bell-btn:active {',
            '    transform: scale(0.95);',
            '}',
            '.notification-bell-btn svg {',
            '    width: 22px;',
            '    height: 22px;',
            '    color: #374151;',
            '    stroke: #374151;',
            '}',
            '.notification-bell-badge {',
            '    position: absolute;',
            '    top: -4px;',
            '    right: -4px;',
            '    background: #ef4444;',
            '    color: white;',
            '    border-radius: 10px;',
            '    min-width: 18px;',
            '    height: 18px;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    font-size: 0.65rem;',
            '    font-weight: 700;',
            '    padding: 0 5px;',
            '    border: 2px solid white;',
            '    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.4);',
            '}',
            '.notification-bell-badge.has-notifications {',
            '    animation: bellPulse 2s ease-in-out infinite;',
            '}',
            '@keyframes bellPulse {',
            '    0%, 100% { transform: scale(1); }',
            '    50% { transform: scale(1.15); }',
            '}',
            '/* Verstecke alte/manuelle Notification Bells */',
            '.header-bell, .header-icon-btn[href="notifications.html"], a.header-bell {',
            '    display: none !important;',
            '}',
            '/* Auf Detail-Seiten mit transparentem Header */',
            '.notification-bell-container.overlay-style .notification-bell-btn {',
            '    background: rgba(0, 0, 0, 0.3);',
            '    backdrop-filter: blur(4px);',
            '    -webkit-backdrop-filter: blur(4px);',
            '}',
            '.notification-bell-container.overlay-style .notification-bell-btn svg {',
            '    color: white;',
            '    stroke: white;',
            '}'
        ].join('\n');

        var style = document.createElement('style');
        style.id = 'notification-bell-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // Entferne alte/manuelle Notification Bells
    function removeOldBells() {
        // Verschiedene Selektoren für alte Bells
        var selectors = [
            '.header-bell',
            'a[href="notifications.html"].header-icon-btn',
            '#notificationBell',
            '.notification-btn-overlay'
        ];

        selectors.forEach(function(sel) {
            var elements = document.querySelectorAll(sel);
            elements.forEach(function(el) {
                // Nicht unsere eigene Bell entfernen
                if (el.id !== 'unifiedNotificationBell') {
                    el.style.display = 'none';
                }
            });
        });
    }

    // Prüfe ob Seite einen "Overlay"-Stil braucht (Detail-Seiten)
    function needsOverlayStyle() {
        var path = window.location.pathname;
        var filename = path.substring(path.lastIndexOf('/') + 1);
        var overlayPages = ['listing-details.html', 'detail.html', 'job-detail.html', 'coupon-detail.html'];
        return overlayPages.indexOf(filename) !== -1;
    }

    // Render die Glocke - FIXED POSITION
    function renderBell(unreadCount) {
        // Entferne alte Glocke falls vorhanden
        var existing = document.getElementById('unifiedNotificationBell');
        if (existing) {
            existing.remove();
        }

        injectStyles();
        removeOldBells();

        var container = document.createElement('div');
        container.id = 'unifiedNotificationBell';
        container.className = 'notification-bell-container';

        // Overlay-Stil für Detail-Seiten
        if (needsOverlayStyle()) {
            container.classList.add('overlay-style');
        }

        var badgeHtml = '';
        if (unreadCount > 0) {
            var badgeText = unreadCount > 99 ? '99+' : unreadCount;
            badgeHtml = '<span class="notification-bell-badge has-notifications">' + badgeText + '</span>';
        }

        container.innerHTML =
            '<button class="notification-bell-btn" title="Benachrichtigungen">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
                    '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' +
                '</svg>' +
                badgeHtml +
            '</button>';

        document.body.appendChild(container);

        container.querySelector('.notification-bell-btn').addEventListener('click', function() {
            window.location.href = 'notifications.html';
        });

        return true;
    }

    // Lade ungelesene Anzahl
    function loadUnreadCount(callback) {
        var sb = createSupabaseClient();
        if (!sb) {
            callback(0);
            return;
        }

        sb.auth.getUser()
            .then(function(response) {
                var user = response.data ? response.data.user : null;
                if (!user) {
                    callback(0);
                    return;
                }

                sb.from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('is_read', false)
                    .then(function(result) {
                        var count = 0;
                        if (!result.error && result.count !== undefined) {
                            count = result.count;
                        }
                        callback(count);
                    })
                    .catch(function() {
                        callback(0);
                    });
            })
            .catch(function() {
                callback(0);
            });
    }

    // Prüfe ob Seite die Bell haben soll
    function shouldShowBell() {
        var path = window.location.pathname;
        var filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

        // Seiten OHNE Bell (nicht eingeloggt oder spezielle Seiten)
        var excludedPages = [
            'index.html',
            'login.html',
            'register.html',
            'forgot-password.html',
            'update-password.html',
            'notifications.html' // Auf der Notifications-Seite selbst nicht anzeigen
        ];

        return excludedPages.indexOf(filename) === -1;
    }

    // Haupt-Init Funktion
    function initBell() {
        if (bellInitialized) return;

        if (!shouldShowBell()) {
            return;
        }

        // Zeige Glocke sofort
        if (renderBell(0)) {
            bellInitialized = true;
        }

        // Lade dann den Count
        if (getConfig()) {
            ensureSupabaseLoaded(function() {
                loadUnreadCount(function(count) {
                    renderBell(count);
                });
            });
        }
    }

    // Starte wenn DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initBell, 100);
        });
    } else {
        setTimeout(initBell, 100);
    }

    // Backup falls DOM noch nicht fertig
    setTimeout(initBell, 500);
    setTimeout(initBell, 1500);

    // Expose refresh Funktion
    window.NotificationBell = {
        refresh: function() {
            loadUnreadCount(function(count) {
                renderBell(count);
            });
        },
        init: initBell
    };

})();
