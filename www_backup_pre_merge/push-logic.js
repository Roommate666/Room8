// ==========================================
// PUSH NOTIFICATIONS SERVICE
// ==========================================

const PushService = {

    // Helper: Check if running in native app
    isNativeApp: () => {
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

    // Initialize and set up listeners
    init: async () => {
        console.log('Push init - isNative:', PushService.isNativeApp());

        if (!PushService.isNativeApp()) {
            console.warn('Push: Nur im Browser-Modus.');
            return false;
        }

        // FCM Token Event Listener (von iOS Native)
        window.addEventListener('fcmToken', async (e) => {
            const token = e.detail;
            console.log('📱 FCM Token von Native erhalten:', token);
            if (token) {
                await PushService.saveTokenToSupabase(token);
            }
        });

        const { PushNotifications } = window.Capacitor.Plugins;

        await PushNotifications.removeAllListeners();

        // Registration erfolg
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Token erhalten:', token.value);
            // Auf Android ist das direkt der FCM Token → speichern
            if (token.value) {
                await PushService.saveTokenToSupabase(token.value);
            }
        });

        // Fehler
        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Registrierungs-Fehler:', JSON.stringify(error));
        });

        // Nachricht empfangen (App offen)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Nachricht empfangen:', notification);
            if (window.updateNotificationBadge) window.updateNotificationBadge();
        });

        // Nachricht angeklickt
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push: Nachricht geklickt:', notification);
            const data = notification.notification.data;
            if (data && data.url) window.location.href = data.url;
            else window.location.href = 'notifications.html';
        });

        PushNotifications.register();
        return true;
    },

    // Erlaubnis anfragen
    requestPermission: async () => {
        console.log('Push requestPermission called');

        if (!PushService.isNativeApp()) {
            console.warn('Push nur in nativer App verfügbar');
            return false;
        }

        const { PushNotifications } = window.Capacitor.Plugins;

        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('Push: Erlaubnis verweigert.');
            return false;
        }

        await PushService.init();
        return true;
    },

    // Auto-Ask beim Start
    tryAutoAsk: async () => {
        // FCM Token Listener immer aktivieren
        window.addEventListener('fcmToken', async (e) => {
            const token = e.detail;
            console.log('📱 FCM Token (auto) erhalten:', token);
            if (token) {
                await PushService.saveTokenToSupabase(token);
            }
        });

        const hasAsked = localStorage.getItem('has_asked_push');

        if (!hasAsked) {
            const granted = await PushService.requestPermission();
            if (granted) {
                localStorage.setItem('has_asked_push', 'true');
                localStorage.setItem('push_enabled', 'true');
            }
        } else if (localStorage.getItem('push_enabled') === 'true') {
            PushService.init();
        }
    },

    // Token in Datenbank speichern
    saveTokenToSupabase: async (token) => {
        console.log('💾 Speichere FCM Token in Supabase...');

        // Supabase Client finden oder erstellen
        var sb = window.sb;
        if (!sb && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }

        if (!sb || !sb.auth) {
            console.error('Push: Supabase Client nicht gefunden');
            return;
        }

        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            console.warn('Push: Kein User eingeloggt');
            return;
        }

        const { error } = await sb
            .from('profiles')
            .update({ fcm_token: token })
            .eq('id', user.id);

        if (error) {
            console.error('Push: Token speichern fehlgeschlagen:', error);
        } else {
            console.log('✅ FCM Token erfolgreich in DB gespeichert!');
            localStorage.setItem('push_token', token);
        }
    }
};

// Global verfügbar machen
window.PushService = PushService;

// FCM Token Listener SOFORT aktivieren (nicht erst bei init)
window.addEventListener('fcmToken', async (e) => {
    const token = e.detail;
    console.log('📱 FCM Token Event empfangen:', token);
    if (token && window.PushService) {
        await window.PushService.saveTokenToSupabase(token);
    }
});

// AUTO-INIT: Push automatisch starten wenn in nativer App
(function() {
    function autoInitPush() {
        if (!PushService.isNativeApp()) return;
        // Warte kurz bis Supabase/Config geladen ist
        setTimeout(function() {
            console.log('Push: Auto-Init auf', window.location.pathname);
            PushService.tryAutoAsk().catch(function(e) {
                console.warn('Push auto-init Fehler:', e);
            });
        }, 1500);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInitPush);
    } else {
        autoInitPush();
    }
})();
