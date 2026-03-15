// ==========================================
// SESSION CACHE - Performance Optimization
// Cached auth.getUser() und Profildaten
// ==========================================

(function() {
    var CACHE_TTL = 5 * 60 * 1000; // 5 Minuten

    window.SessionCache = {
        // Cached getUser() - spart Netzwerk-Requests
        getUser: async function() {
            var cached = sessionStorage.getItem('_cached_user');
            var cachedAt = sessionStorage.getItem('_cached_user_at');

            if (cached && cachedAt && (Date.now() - parseInt(cachedAt)) < CACHE_TTL) {
                return JSON.parse(cached);
            }

            // Frisch vom Server holen
            if (!window.sb) return null;
            var result = await window.sb.auth.getUser();
            if (result.data && result.data.user) {
                sessionStorage.setItem('_cached_user', JSON.stringify(result.data.user));
                sessionStorage.setItem('_cached_user_at', String(Date.now()));
                return result.data.user;
            }
            // Kein User = nicht eingeloggt, Cache leeren
            SessionCache.clear();
            return null;
        },

        // Cached Profil-Daten
        getProfile: async function(userId) {
            var cached = sessionStorage.getItem('_cached_profile');
            var cachedAt = sessionStorage.getItem('_cached_profile_at');

            if (cached && cachedAt && (Date.now() - parseInt(cachedAt)) < CACHE_TTL) {
                var profile = JSON.parse(cached);
                if (profile.id === userId) return profile;
            }

            if (!window.sb || !userId) return null;
            var result = await window.sb.from('profiles').select('*').eq('id', userId).single();
            if (result.data) {
                sessionStorage.setItem('_cached_profile', JSON.stringify(result.data));
                sessionStorage.setItem('_cached_profile_at', String(Date.now()));
                return result.data;
            }
            return null;
        },

        // Cache leeren (bei Logout)
        clear: function() {
            sessionStorage.removeItem('_cached_user');
            sessionStorage.removeItem('_cached_user_at');
            sessionStorage.removeItem('_cached_profile');
            sessionStorage.removeItem('_cached_profile_at');
        },

        // Cache invalidieren (nach Profil-Update etc.)
        invalidateProfile: function() {
            sessionStorage.removeItem('_cached_profile');
            sessionStorage.removeItem('_cached_profile_at');
        }
    };
})();
