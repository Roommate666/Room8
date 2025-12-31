// ==========================================
// PUSH NOTIFICATIONS SERVICE (Fixed)
// ==========================================

const PushService = {
    
    // 1. Initialisierung und Token-Registrierung
    init: async () => {
        // Prüfung: Läuft es als App oder im Browser?
        const isNative = window.Capacitor && window.Capacitor.isNative;
        if (!isNative) {
            console.warn('Push: Nur im Browser-Modus. Echte Push-Nachrichten gehen nur auf dem Handy (Android/iOS).');
            return false;
        }

        const { PushNotifications } = window.Capacitor.Plugins;

        // Listener aufräumen
        await PushNotifications.removeAllListeners();

        // A) Erfolgreiche Registrierung -> Token speichern
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Token erhalten:', token.value);
            localStorage.setItem('push_token', token.value);
            
            // Token an Supabase senden (wichtig für Hintergrund-Nachrichten!)
            await PushService.saveTokenToSupabase(token.value);
        });

        // B) Fehler bei Registrierung
        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Registrierungs-Fehler:', JSON.stringify(error));
            // alert('Push-Fehler: ' + JSON.stringify(error)); // Zum Debuggen einkommentieren
        });

        // C) Nachricht empfangen (App offen)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Nachricht empfangen:', notification);
            // Badge aktualisieren oder Toast anzeigen
            if (window.updateNotificationBadge) window.updateNotificationBadge();
        });

        // D) Nachricht angeklickt (App öffnet sich)
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push: Nachricht geklickt:', notification);
            // Hier könnte man direkt zum Chat navigieren
            const data = notification.notification.data;
            if (data.url) window.location.href = data.url;
            else window.location.href = 'notifications.html';
        });

        // Registrierung durchführen (fordert Token an)
        PushNotifications.register();
        return true;
    },

    // 2. Erlaubnis anfragen (Popup)
    requestPermission: async () => {
        const isNative = window.Capacitor && window.Capacitor.isNative;
        if (!isNative) {
            alert("Push-Benachrichtigungen funktionieren nur in der installierten App, nicht in der Vorschau.");
            return false;
        }

        const { PushNotifications } = window.Capacitor.Plugins;

        // Status prüfen
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('Push: Erlaubnis verweigert.');
            return false;
        }

        // Wenn erlaubt, sofort initialisieren
        await PushService.init();
        return true;
    },

    // 3. Auto-Ask beim Start (ruft man im Dashboard auf)
    tryAutoAsk: async () => {
        // Wir fragen nur, wenn noch nicht gefragt wurde ODER wenn es schon erlaubt ist
        const hasAsked = localStorage.getItem('has_asked_push');
        
        if (!hasAsked) {
            // Erstes Mal: Wir fragen!
            const granted = await PushService.requestPermission();
            if (granted) {
                localStorage.setItem('has_asked_push', 'true');
                localStorage.setItem('push_enabled', 'true');
            }
        } else if (localStorage.getItem('push_enabled') === 'true') {
            // Schon erlaubt: Wir initialisieren direkt (für Token-Refresh)
            PushService.init();
        }
    },

    // 4. Token in Datenbank speichern (Das Wichtigste!)
    saveTokenToSupabase: async (token) => {
        if (typeof supabase === 'undefined') return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Wir speichern den Token im Profil
        // WICHTIG: Deine 'profiles' Tabelle braucht eine Spalte 'fcm_token' (Text)
        const { error } = await supabase
            .from('profiles')
            .update({ fcm_token: token }) 
            .eq('id', user.id);

        if (error) {
            console.error('Push: Konnte Token nicht in DB speichern:', error);
        } else {
            console.log('Push: Token erfolgreich in DB gespeichert.');
        }
    }
};

// Mache es global verfügbar
window.PushService = PushService;