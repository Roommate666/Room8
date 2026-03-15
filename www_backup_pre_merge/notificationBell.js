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
        var overlayPages = ['listing-details.html', 'job-detail.html', 'coupon-detail.html'];
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

    // Native App Badge aktualisieren (Capacitor BadgePlugin)
    function updateNativeBadge(count) {
        try {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Badge) {
                if (count > 0) {
                    window.Capacitor.Plugins.Badge.setBadge({ count: count });
                } else {
                    window.Capacitor.Plugins.Badge.clearBadge();
                }
            }
        } catch (e) {
            // Kein nativer Badge-Support (z.B. im Browser)
        }
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
                        // Native App Badge aktualisieren (MIUI/Xiaomi)
                        updateNativeBadge(count);
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

    // In-App Toast bei neuer Benachrichtigung
    function showInAppToast(title, message) {
        // Toast CSS injizieren
        if (!document.getElementById('toast-notification-style')) {
            var toastCSS = document.createElement('style');
            toastCSS.id = 'toast-notification-style';
            toastCSS.textContent = [
                '.room8-toast {',
                '    position: fixed;',
                '    top: calc(60px + env(safe-area-inset-top, 0px));',
                '    left: 16px;',
                '    right: 16px;',
                '    background: white;',
                '    border-radius: 12px;',
                '    box-shadow: 0 8px 32px rgba(0,0,0,0.18);',
                '    padding: 12px 16px;',
                '    display: flex;',
                '    align-items: center;',
                '    gap: 12px;',
                '    z-index: 99999;',
                '    transform: translateY(-120%);',
                '    transition: transform 0.3s ease;',
                '    border-left: 4px solid #6366F1;',
                '    cursor: pointer;',
                '}',
                '.room8-toast.show { transform: translateY(0); }',
                '.room8-toast-icon { font-size: 1.5rem; flex-shrink: 0; }',
                '.room8-toast-content { flex: 1; min-width: 0; }',
                '.room8-toast-title { font-weight: 700; font-size: 0.85rem; margin: 0; color: #1F2937; }',
                '.room8-toast-msg { font-size: 0.8rem; color: #6B7280; margin: 2px 0 0; ',
                '    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
                '.room8-toast-close { background: none; border: none; font-size: 1.2rem; color: #9CA3AF; cursor: pointer; padding: 4px; }'
            ].join('\n');
            document.head.appendChild(toastCSS);
        }

        // Alten Toast entfernen
        var old = document.querySelector('.room8-toast');
        if (old) old.remove();

        var toast = document.createElement('div');
        toast.className = 'room8-toast';
        toast.innerHTML =
            '<span class="room8-toast-icon">🔔</span>' +
            '<div class="room8-toast-content">' +
                '<p class="room8-toast-title">' + (title || 'Room8') + '</p>' +
                '<p class="room8-toast-msg">' + (message && message.indexOf('[IMG]') !== -1 ? (message.replace(/\[IMG\].*?\[\/IMG\]\n?/, '').trim() || 'Bild') : (message || '')) + '</p>' +
            '</div>' +
            '<button class="room8-toast-close">&times;</button>';

        toast.addEventListener('click', function() {
            window.location.href = 'notifications.html';
        });
        toast.querySelector('.room8-toast-close').addEventListener('click', function(e) {
            e.stopPropagation();
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 300);
        });

        document.body.appendChild(toast);
        setTimeout(function() { toast.classList.add('show'); }, 50);
        setTimeout(function() {
            if (toast.parentNode) {
                toast.classList.remove('show');
                setTimeout(function() { toast.remove(); }, 300);
            }
        }, 5000);
    }

    // Realtime Subscription fuer Live-Updates
    var realtimeSubscribed = false;
    function subscribeToNotifications() {
        if (realtimeSubscribed) return;
        var sb = createSupabaseClient();
        if (!sb) return;

        sb.auth.getUser().then(function(response) {
            var user = response.data ? response.data.user : null;
            if (!user) return;

            realtimeSubscribed = true;
            sb.channel('bell-notifications')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: 'user_id=eq.' + user.id
                }, function(payload) {
                    // Neue Benachrichtigung - Badge aktualisieren
                    loadUnreadCount(function(count) {
                        renderBell(count);
                    });
                    // Nav-Badge auch aktualisieren
                    if (window.updateNavChatBadge) window.updateNavChatBadge();
                    // In-App Toast anzeigen
                    if (payload.new) {
                        showInAppToast(payload.new.title, payload.new.message);
                    }
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: 'user_id=eq.' + user.id
                }, function() {
                    // Notification gelesen - Badge aktualisieren
                    loadUnreadCount(function(count) {
                        renderBell(count);
                    });
                    // Nav-Badge auch aktualisieren
                    if (window.updateNavChatBadge) window.updateNavChatBadge();
                })
                .subscribe();
        });
    }

    // Expose refresh Funktion
    window.NotificationBell = {
        refresh: function() {
            loadUnreadCount(function(count) {
                renderBell(count);
            });
        },
        init: initBell,
        showToast: showInAppToast
    };

    // Starte Realtime nach Init
    setTimeout(function() {
        if (shouldShowBell()) {
            ensureSupabaseLoaded(function() {
                subscribeToNotifications();
            });
        }
    }, 2000);

    // Polling-Fallback alle 30 Sekunden (falls Realtime nicht funktioniert)
    setInterval(function() {
        if (shouldShowBell() && bellInitialized) {
            loadUnreadCount(function(count) {
                renderBell(count);
            });
        }
    }, 30000);

})();
