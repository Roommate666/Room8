// ==========================================
// PUSH NOTIFICATIONS SERVICE - FIXED
// ==========================================

(function() {
    'use strict';

    // Nutze globalen Supabase Client aus config.js
    function getSupabaseClient() {
        return window.sb || null;
    }

    // Debug-Trace No-Op (kann fuer Debugging reaktiviert werden)
    function debugTrace(_step, _msg, _extra) { /* no-op */ }

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
            if (PushService._initialized) { debugTrace('S0_already_init', 'init already done'); return true; }
            console.log('Push init - isNative:', PushService.isNativeApp());
            debugTrace('S1_init_start', 'isNative=' + PushService.isNativeApp());

            if (!PushService.isNativeApp()) {
                console.log('Push: Browser-Modus, Push deaktiviert.');
                debugTrace('S1b_not_native', 'browser mode, abort');
                return false;
            }

            try {
                var PushNotifications = window.Capacitor.Plugins.PushNotifications;
                if (!PushNotifications) {
                    console.warn('Push: PushNotifications Plugin nicht verfuegbar');
                    debugTrace('S2_no_plugin', 'PushNotifications plugin nicht verfuegbar');
                    return false;
                }
                debugTrace('S2_plugin_ok', 'plugin verfuegbar');

                await PushNotifications.removeAllListeners();

                // Registration erfolg (FCM/APNs Token)
                PushNotifications.addListener('registration', function(token) {
                    console.log('Push: Token erhalten:', token.value);
                    debugTrace('S4_registration_event', 'tokenLen=' + (token.value ? token.value.length : 0), { preview: token.value ? token.value.substring(0, 30) : null });
                    PushService.saveTokenToSupabase(token.value);
                });

                // Fehler
                PushNotifications.addListener('registrationError', function(error) {
                    console.error('Push: Registrierungs-Fehler:', JSON.stringify(error));
                    debugTrace('S4err_registration_error', 'registration failed', error);
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

                // Wichtig: erst checkPermissions, ggf. requestPermissions, DANN register
                var perm = await PushNotifications.checkPermissions();
                debugTrace('S3a_checkPermissions', 'receive=' + perm.receive);
                if (perm.receive !== 'granted') {
                    var req = await PushNotifications.requestPermissions();
                    debugTrace('S3b_requestPermissions', 'receive=' + req.receive);
                    if (req.receive !== 'granted') {
                        debugTrace('S3_perm_denied', 'abort register');
                        return false;
                    }
                }

                debugTrace('S3_calling_register', 'PushNotifications.register()');
                await PushNotifications.register();
                debugTrace('S3_register_returned', 'register awaited');
                PushService._initialized = true;
                console.log('Push: Initialisierung abgeschlossen');
                return true;
            } catch (e) {
                console.error('Push init Fehler:', e);
                debugTrace('S_init_exception', e && e.message ? e.message : String(e));
                return false;
            }
        },

        requestPermission: async function() {
            console.log('Push requestPermission called');

            if (!PushService.isNativeApp()) {
                console.warn('Push nur in nativer App verfuegbar');
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

            // FCM-Tokens enthalten immer ":APA91b" (oder ":APx" bei Web).
            // APNs-Hex-Tokens (64 Zeichen, nur 0-9a-f) sind KEINE FCM-Tokens
            // und wuerden FCM dazu bringen den Token zu invalidieren.
            if (!token || token.indexOf(':') < 0) {
                console.warn('Push: Token sieht nicht wie FCM aus (kein Doppelpunkt), skip save:', token ? token.substring(0, 30) : 'empty');
                return;
            }

            var sb = getSupabaseClient();
            if (!sb) {
                console.error('Push: Supabase Client nicht verfuegbar');
                debugTrace('S6err_no_sb', 'window.sb null, retry');
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
                    debugTrace('S6err_no_user', 'auth.getUser empty, retry');
                    setTimeout(function() {
                        PushService.saveTokenToSupabase(token);
                    }, 3000);
                    return;
                }

                // SECURITY DEFINER RPC mit Multi-Device-Support (Migration 20260504000007).
                // Schreibt in fcm_tokens-Tabelle (eine Zeile pro Device) + Legacy-
                // profiles.fcm_token. Platform-Detection via Capacitor falls verfuegbar.
                var platform = 'unknown';
                try {
                    if (window.Capacitor && window.Capacitor.getPlatform) {
                        platform = window.Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
                    } else if (/Android/i.test(navigator.userAgent)) {
                        platform = 'android';
                    } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                        platform = 'ios';
                    } else {
                        platform = 'web';
                    }
                } catch (_) { platform = 'unknown'; }

                var result = await sb.rpc('register_fcm_token', { p_token: token, p_platform: platform });

                if (result.error) {
                    console.error('Push: Token speichern fehlgeschlagen:', result.error);
                    debugTrace('S6err_update_failed', result.error.message || JSON.stringify(result.error));
                } else {
                    console.log('✅ FCM Token registriert via RPC.');
                    debugTrace('S7_save_ok', 'OK uid=' + user.id.substring(0, 8));
                }
            } catch (e) {
                console.error('Push: saveToken Fehler:', e);
                debugTrace('S6_exception', e && e.message ? e.message : String(e));
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
                    // Badge ueber iOS native setzen (wird von AppDelegate beim naechsten Aufruf gesetzt)
                    console.log('Badge count fuer native:', count);
                }
                console.log('Badge count:', count);
            } catch (e) {
                console.log('Badge update error:', e.message || e);
            }
        },

        // Auto-Initialisierung — auf nativen Apps IMMER init (Token muss gespeichert werden)
        autoInit: function() {
            var native = PushService.isNativeApp();
            var enabled = localStorage.getItem('push_enabled') === 'true';
            debugTrace('S0_autoInit', 'native=' + native + ' enabled=' + enabled);
            if (native || enabled) {
                PushService.init();
            }
        }
    };

    // Global verfuegbar machen
    window.PushService = PushService;
    window.updateAppBadge = function() { PushService.updateAppBadge(); };

    // FCM Token Listener - bei JEDEM Event speichern (wichtig fuer Account-Wechsel)
    window.addEventListener('fcmToken', async function(e) {
        var token = e.detail;
        console.log('📱 FCM Token Event empfangen:', token ? token.substring(0, 20) + '...' : 'leer');
        debugTrace('S5_fcmToken_event', 'tokenLen=' + (token ? token.length : 0), { preview: token ? token.substring(0, 30) : null });
        if (token) {
            await PushService.saveTokenToSupabase(token);
        }
    });

    // Token-Refresh wird bereits vom fcmToken Event-Handler abgedeckt.
    // Kein Re-Save aus localStorage noetig (verhindert Dual-Account-Bug).

    // Auto-Init wenn Push schon erlaubt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            PushService.autoInit();
        });
    } else {
        PushService.autoInit();
    }

})();
