// ==========================================
// NOTIFICATION BELL - STANDALONE VERSION
// Laedt supabase selbst, funktioniert ueberall
// ==========================================

(function() {
    'use strict';
    
    console.log('NotificationBell: Script loaded');
    
    var BELL_SUPABASE_URL = null;
    var BELL_SUPABASE_KEY = null;
    var bellSupabase = null;
    var bellInitialized = false;
    var bellRetryCount = 0;
    var MAX_RETRIES = 10;

    // Hole Config-Werte
    function getConfig() {
        // Versuche verschiedene Quellen
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
        
        // Pruefe ob supabase Library geladen ist
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
        
        // Lade Supabase von CDN
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = function() {
            setTimeout(callback, 100);
        };
        script.onerror = function() {
            console.log('NotificationBell: Could not load supabase');
        };
        document.head.appendChild(script);
    }

    // Inject CSS Styles
    function injectStyles() {
        if (document.getElementById('notification-bell-styles')) return;
        
        var css = [
            '.notification-bell-wrapper {',
            '    position: relative;',
            '    margin-right: 0.5rem;',
            '    display: inline-flex;',
            '}',
            '.notification-bell {',
            '    position: relative;',
            '    cursor: pointer;',
            '    padding: 0.5rem;',
            '    border-radius: 50%;',
            '    background: rgba(255,255,255,0.2);',
            '    border: none;',
            '    transition: all 0.2s;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '}',
            '.notification-bell:hover {',
            '    background: rgba(255,255,255,0.3);',
            '    transform: scale(1.05);',
            '}',
            '.notification-bell svg {',
            '    width: 22px;',
            '    height: 22px;',
            '    color: white;',
            '    stroke: white;',
            '}',
            '.notification-badge {',
            '    position: absolute;',
            '    top: -2px;',
            '    right: -2px;',
            '    background: #ef4444;',
            '    color: white;',
            '    border-radius: 10px;',
            '    min-width: 18px;',
            '    height: 18px;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    font-size: 0.65rem;',
            '    font-weight: 600;',
            '    padding: 0 4px;',
            '    border: 2px solid white;',
            '    animation: bellPulse 2s ease-in-out infinite;',
            '}',
            '@keyframes bellPulse {',
            '    0%, 100% { transform: scale(1); }',
            '    50% { transform: scale(1.1); }',
            '}'
        ].join('\n');
        
        var style = document.createElement('style');
        style.id = 'notification-bell-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // Render die Glocke
    function renderBell(unreadCount) {
        var header = document.querySelector('.app-header');
        if (!header) {
            return false;
        }

        // Entferne alte Glocke falls vorhanden
        var existing = document.getElementById('notificationBellWrapper');
        if (existing) {
            existing.remove();
        }

        injectStyles();

        var wrapper = document.createElement('div');
        wrapper.id = 'notificationBellWrapper';
        wrapper.className = 'notification-bell-wrapper';
        
        var badgeHtml = '';
        if (unreadCount > 0) {
            var badgeText = unreadCount > 99 ? '99+' : unreadCount;
            badgeHtml = '<span class="notification-badge">' + badgeText + '</span>';
        }
        
        wrapper.innerHTML = 
            '<button class="notification-bell" id="notificationBellBtn" title="Benachrichtigungen">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
                    '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' +
                '</svg>' +
                badgeHtml +
            '</button>';
        
        // Versuche in header-actions einzufuegen, sonst an header anhaengen
        var headerActions = header.querySelector('.header-actions');
        if (headerActions) {
            headerActions.insertBefore(wrapper, headerActions.firstChild);
        } else {
            header.appendChild(wrapper);
        }
        
        document.getElementById('notificationBellBtn').addEventListener('click', function() {
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

    // Haupt-Init Funktion
    function initBell() {
        console.log('NotificationBell: initBell called, initialized=' + bellInitialized);
        
        if (bellInitialized) return;
        
        // Pruefe ob Header existiert
        var header = document.querySelector('.app-header');
        console.log('NotificationBell: header found=' + (header ? 'yes' : 'no'));
        
        if (!header) {
            // Retry spaeter
            bellRetryCount++;
            console.log('NotificationBell: no header, retry ' + bellRetryCount);
            if (bellRetryCount < MAX_RETRIES) {
                setTimeout(initBell, 500);
            }
            return;
        }

        // Zeige Glocke SOFORT (auch ohne Supabase)
        console.log('NotificationBell: rendering bell...');
        if (renderBell(0)) {
            bellInitialized = true;
            console.log('NotificationBell: bell rendered successfully');
        } else {
            console.log('NotificationBell: renderBell returned false');
        }

        // Versuche dann den Count zu laden
        if (getConfig()) {
            ensureSupabaseLoaded(function() {
                loadUnreadCount(function(count) {
                    console.log('NotificationBell: unread count=' + count);
                    renderBell(count);
                });
            });
        }
    }

    // Starte wenn DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initBell, 300);
        });
    } else {
        setTimeout(initBell, 300);
    }

    // Backup: Versuche auch spaeter nochmal
    setTimeout(initBell, 1000);
    setTimeout(initBell, 2000);
    setTimeout(initBell, 3500);

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
