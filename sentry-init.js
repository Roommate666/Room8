/**
 * Sentry Error Monitoring fuer Room8.
 * Eingebettet via einem Tag: <script src="sentry-init.js"></script> in <head>.
 * Loader-Script wird asynchron nachgeladen, blockt Render nicht.
 *
 * Konfig:
 * - DSN ist im Loader-Script eingebettet (Sentry Project: room8-web)
 * - environment: production / dev (basierend auf hostname)
 * - release: aus window.ROOM8_VERSION wenn gesetzt
 * - PII: KEINE Email/Phone/FCM-Token in Events (DSGVO)
 * - ignoreErrors: bekannte Browser-Noise filtern
 *
 * Geaendert wird hier NUR die Konfig — DSN wird im Sentry-Dashboard rotiert.
 */
(function () {
    'use strict';

    // Custom Init-Config — wird vom Loader vor Sentry.init() aufgerufen
    window.sentryOnLoad = function () {
        if (!window.Sentry) return;

        var hostname = (typeof location !== 'undefined' && location.hostname) || '';
        var isProd = hostname === 'www.room8.club' || hostname === 'room8.club';
        var env = isProd ? 'production'
                : hostname === 'localhost' || hostname === '127.0.0.1' ? 'dev'
                : 'preview';

        Sentry.init({
            // DSN kommt aus Loader-Script automatisch
            environment: env,
            release: 'room8-web@' + (window.ROOM8_VERSION || '2.1.0'),

            // Wir nehmen Error Monitoring only — KEIN Tracing/Session-Replay (Quota schonen)
            tracesSampleRate: 0,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,

            // Bekannte harmlose Browser-Noise filtern
            ignoreErrors: [
                'Network request failed',
                'Failed to fetch',
                'Load failed',
                'NetworkError',
                'AbortError',
                /ResizeObserver loop/i,
                /Non-Error promise rejection captured/i,
                // Browser-Extensions die Pages tracken
                'Extension context invalidated',
                'chrome-extension://',
                'moz-extension://',
            ],

            // URL-Filter: nur unsere Domains capturen, nicht 3rd-party Scripts
            allowUrls: [
                /https?:\/\/(www\.)?room8\.club/,
                /capacitor:\/\/localhost/,        // Native iOS/Android WebView
                /file:\/\//,                      // Native Android File-Scheme
            ],

            beforeSend: function (event) {
                // PII-Strip: Email aus URLs/Tags entfernen
                try {
                    if (event.request && event.request.url) {
                        event.request.url = event.request.url
                            .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
                            .replace(/access_token=[^&]+/g, 'access_token=<redacted>')
                            .replace(/refresh_token=[^&]+/g, 'refresh_token=<redacted>');
                    }

                    // Capacitor Native Plattform taggen
                    var isCapacitor = typeof window.Capacitor !== 'undefined';
                    event.tags = event.tags || {};
                    if (isCapacitor && window.Capacitor.getPlatform) {
                        event.tags.platform = window.Capacitor.getPlatform();
                    } else {
                        event.tags.platform = 'web';
                    }

                    // Page-Tag
                    event.tags.page = (location.pathname || '/').split('/').pop() || 'index';
                } catch (e) {
                    // Filter darf NIE Send blockieren
                }
                return event;
            },
        });

        // User-Kontext setzen wenn Supabase-User vorhanden — id only, KEINE Email
        try {
            if (window.sb && window.sb.auth && typeof window.sb.auth.getUser === 'function') {
                window.sb.auth.getUser().then(function (res) {
                    if (res && res.data && res.data.user && res.data.user.id) {
                        Sentry.setUser({ id: res.data.user.id });
                    }
                }).catch(function () { /* silent */ });
            }
        } catch (e) { /* silent */ }

        // Hilfs-Funktion fuer manuelles Capture aus dem App-Code:
        //   window.Room8Sentry.captureMessage('xy', { level: 'warning' })
        //   window.Room8Sentry.captureException(err)
        window.Room8Sentry = {
            captureException: function (err, ctx) {
                try { Sentry.captureException(err, ctx); } catch (e) {}
            },
            captureMessage: function (msg, ctx) {
                try { Sentry.captureMessage(msg, ctx); } catch (e) {}
            },
            setTag: function (k, v) {
                try { Sentry.setTag(k, v); } catch (e) {}
            },
        };
    };

    // Loader-Script asynchron einbinden (nicht blocking)
    var s = document.createElement('script');
    s.src = 'https://js-de.sentry-cdn.com/9941e3abb148ca8129391459a79cd456.min.js';
    s.crossOrigin = 'anonymous';
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
})();
