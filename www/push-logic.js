// ==========================================
// PUSH NOTIFICATIONS SERVICE - FIXED
// ==========================================

(function() {
    'use strict';

    // Nutze globalen Supabase Client aus config.js
    function getSupabaseClient() {
        return window.sb || null;
    }

    var PushService = {

        isNativeApp: function() {
            if (window.Capacitor && window.Capacitor.isNativePlatform) {
                return window.Capacitor.isNativePlatform();
            }
            if (window.Capacitor && window.Capacitor.isNative) {
                return true;
            }
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications) {
                return true;
            }
            return false;
        },

        _initialized: false,

        init: async function() {
            if (PushService._initialized) return true;
            console.log('Push init - isNative:', PushService.isNativeApp());

            if (!PushService.isNativeApp()) {
                console.log('Push: Browser-Modus, Push deaktiviert.');
                return false;
            }

            try {
                var PushNotifications = window.Capacitor.Plugins.PushNotifications;
                if (!PushNotifications) {
                    console.warn('Push: PushNotifications Plugin nicht verfügbar');
                    return false;
                }

                await PushNotifications.removeAllListeners();

                // Registration erfolg (FCM/APNs Token)
                PushNotifications.addListener('registration', function(token) {
                    console.log('Push: Token erhalten:', token.value);
                    PushService.saveTokenToSupabase(token.value);
                });

                // Fehler
                PushNotifications.addListener('registrationError', function(error) {
                    console.error('Push: Registrierungs-Fehler:', JSON.stringify(error));
                });

                // Nachricht empfangen (App im Vordergrund)
                PushNotifications.addListener('pushNotificationReceived', function(notification) {
                    console.log('Push: Nachricht im Vordergrund:', notification);
                    // Alle Badges aktualisieren
                    if (window.NotificationBell && window.NotificationBell.refresh) {
                        window.NotificationBell.refresh();
                    }
                    if (window.updateChatBadge) window.updateChatBadge();
                    PushService.updateAppBadge();
                });

                // Nachricht angeklickt
                PushNotifications.addListener('pushNotificationActionPerformed', function(notification) {
                    console.log('Push: Nachricht geklickt:', notification);
                    var data = notification.notification.data;
                    if (data && data.url) {
                        window.location.href = data.url;
                    } else {
                        window.location.href = 'notifications.html';
                    }
                });

                PushNotifications.register();
                PushService._initialized = true;
                console.log('Push: Initialisierung abgeschlossen');
                return true;
            } catch (e) {
                console.error('Push init Fehler:', e);
                return false;
            }
        },

        requestPermission: async function() {
            console.log('Push requestPermission called');

            if (!PushService.isNativeApp()) {
                console.warn('Push nur in nativer App verfügbar');
                return false;
            }

            try {
                var PushNotifications = window.Capacitor.Plugins.PushNotifications;
                var permStatus = await PushNotifications.checkPermissions();

                if (permStatus.receive === 'prompt') {
                    permStatus = await PushNotifications.requestPermissions();
                }

                if (permStatus.receive !== 'granted') {
                    console.warn('Push: Erlaubnis verweigert.');
                    return false;
                }

                await PushService.init();
                return true;
            } catch (e) {
                console.error('Push permission error:', e);
                return false;
            }
        },

        // Token in Datenbank speichern
        saveTokenToSupabase: async function(token) {
            console.log('💾 Speichere FCM Token in Supabase...');

            var sb = getSupabaseClient();
            if (!sb) {
                console.error('Push: Supabase Client nicht verfügbar');
                // Retry nach 3 Sekunden
                setTimeout(function() {
                    PushService.saveTokenToSupabase(token);
                }, 3000);
                return;
            }

            try {
                var response = await sb.auth.getUser();
                var user = response.data ? response.data.user : null;
                if (!user) {
                    console.warn('Push: Kein User eingeloggt, retry in 3s...');
                    setTimeout(function() {
                        PushService.saveTokenToSupabase(token);
                    }, 3000);
                    return;
                }

                // Erst Token bei ALLEN anderen Usern löschen (gleiches Gerät, anderer Account)
                await sb
                    .from('profiles')
                    .update({ fcm_token: null })
                    .eq('fcm_token', token)
                    .neq('id', user.id);

                // Dann beim aktuellen User setzen
                var result = await sb
                    .from('profiles')
                    .update({ fcm_token: token })
                    .eq('id', user.id);

                if (result.error) {
                    console.error('Push: Token speichern fehlgeschlagen:', result.error);
                } else {
                    console.log('✅ FCM Token gespeichert, alte Zuordnungen bereinigt.');
                    localStorage.setItem('push_token', token);
                }
            } catch (e) {
                console.error('Push: saveToken Fehler:', e);
            }
        },

        // App Icon Badge aktualisieren (iOS/Android)
        updateAppBadge: async function() {
            try {
                var sb = getSupabaseClient();
                if (!sb) return;

                var response = await sb.auth.getUser();
                var user = response.data ? response.data.user : null;
                if (!user) return;

                var result = await sb
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('is_read', false);

                var count = (result && !result.error) ? (result.count || 0) : 0;

                if (window.Capacitor && window.Capacitor.Plugins) {
                    // Versuche @capawesome/capacitor-badge
                    var bp = window.Capacitor.Plugins.Badge ||
                             window.Capacitor.Plugins.BadgePlugin;
                    if (bp && bp.set) {
                        await bp.set({ count: count });
                        console.log('App badge set:', count);
                        return;
                    }
                }
                // Fallback: Native Bridge via webkit messageHandler
                if (window.webkit && window.webkit.messageHandlers) {
                    // Badge über iOS native setzen (wird von AppDelegate beim nächsten Aufruf gesetzt)
                    console.log('Badge count für native:', count);
                }
                console.log('Badge count:', count);
            } catch (e) {
                console.log('Badge update error:', e.message || e);
            }
        },

        // Auto-Initialisierung — auf nativen Apps IMMER init (Token muss gespeichert werden)
        autoInit: function() {
            if (PushService.isNativeApp() || localStorage.getItem('push_enabled') === 'true') {
                PushService.init();
            }
        }
    };

    // Global verfügbar machen
    window.PushService = PushService;
    window.updateAppBadge = function() { PushService.updateAppBadge(); };

    // FCM Token Listener - bei JEDEM Event speichern (wichtig für Account-Wechsel)
    window.addEventListener('fcmToken', async function(e) {
        var token = e.detail;
        console.log('📱 FCM Token Event empfangen:', token ? token.substring(0, 20) + '...' : 'leer');
        if (token) {
            await PushService.saveTokenToSupabase(token);
        }
    });

    // Token-Refresh wird bereits vom fcmToken Event-Handler abgedeckt.
    // Kein Re-Save aus localStorage nötig (verhindert Dual-Account-Bug).

    // Auto-Init wenn Push schon erlaubt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            PushService.autoInit();
        });
    } else {
        PushService.autoInit();
    }

})();
