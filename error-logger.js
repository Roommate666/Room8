/**
 * Room8 Error Logger
 * Faengt Fehler automatisch ab und loggt sie in Supabase error_logs Tabelle.
 * Beeintraechtigt die App NICHT - alle Fehler werden still geloggt.
 */
(function() {
    'use strict';

    var MAX_ERRORS_PER_SESSION = 20;
    var DEBOUNCE_MS = 1000;
    var _errorCount = 0;
    var _lastError = '';
    var _lastErrorTime = 0;

    function getSupabaseClient() {
        if (typeof window.supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined') {
            return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return null;
    }

    async function getUserId() {
        try {
            var sb = getSupabaseClient();
            if (!sb) return null;
            var result = await sb.auth.getUser();
            return result.data?.user?.id || null;
        } catch (e) {
            return null;
        }
    }

    async function logError(message, stack) {
        // Rate-Limiting
        if (_errorCount >= MAX_ERRORS_PER_SESSION) return;

        // Duplikat-Check (gleicher Fehler innerhalb 1 Sekunde)
        var now = Date.now();
        if (message === _lastError && now - _lastErrorTime < DEBOUNCE_MS) return;
        _lastError = message;
        _lastErrorTime = now;
        _errorCount++;

        try {
            var sb = getSupabaseClient();
            if (!sb) return;

            var userId = await getUserId();

            await sb.from('error_logs').insert({
                user_id: userId,
                error_message: String(message).substring(0, 2000),
                stack_trace: stack ? String(stack).substring(0, 5000) : null,
                page_url: window.location.href,
                user_agent: navigator.userAgent
            });
        } catch (e) {
            // Still - niemals die App stoeren
        }
    }

    // Globale Fehler abfangen
    window.addEventListener('error', function(event) {
        var msg = event.message || 'Unknown error';
        var stack = event.error ? event.error.stack : (event.filename + ':' + event.lineno + ':' + event.colno);
        logError(msg, stack);
    });

    // Unhandled Promise Rejections abfangen
    window.addEventListener('unhandledrejection', function(event) {
        var msg = 'Unhandled Promise: ';
        if (event.reason) {
            msg += event.reason.message || String(event.reason);
        } else {
            msg += 'Unknown';
        }
        var stack = event.reason?.stack || null;
        logError(msg, stack);
    });

    // Console.error abfangen (optional, faengt auch manuelle Fehler)
    var _origConsoleError = console.error;
    console.error = function() {
        var args = Array.from(arguments);
        var msg = args.map(function(a) {
            if (typeof a === 'object') {
                try { return JSON.stringify(a); } catch(e) { return String(a); }
            }
            return String(a);
        }).join(' ');
        logError('console.error: ' + msg);
        _origConsoleError.apply(console, arguments);
    };
})();
