// =============================================================
// Room8 City-Filter - Auto-Filter auf die Wohnstadt des Users
// Bei Registrierung ist Stadt Pflicht (complete-profile). Coupons/Jobs/
// Events werden automatisch auf diese Stadt vorgefiltert. Toggle-Chip
// erlaubt Wechsel auf "Alle Staedte". Fallback: wenn 0 Treffer in der
// Stadt -> automatisch alle zeigen (sonst leere App fuer Rand-Staedte).
// API:
//   Room8City.load()                 -> laedt Wohnstadt (Promise<string|null>)
//   Room8City.getCity()              -> Wohnstadt (oder null)
//   Room8City.isActive()             -> Filter aktiv? (bool)
//   Room8City.setActive(bool)
//   Room8City.matches(itemCity)      -> passt Item zur Wohnstadt? (bool)
//   Room8City.renderChip(el, onToggle) -> Toggle-Chip rendern
// =============================================================
(function () {
    var myCity = null;
    var active = false;
    var loaded = false;
    var loadPromise = null;

    function getClient() {
        if (window.sb) return window.sb;
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            return window.sb;
        }
        return null;
    }

    function norm(c) {
        if (!c) return '';
        if (window.normalizeCity) { try { return String(window.normalizeCity(c)).toLowerCase().trim(); } catch (e) {} }
        return String(c).toLowerCase().trim();
    }

    function load() {
        if (loadPromise) return loadPromise;
        loadPromise = (async function () {
            var sb = getClient();
            if (!sb) { loaded = true; return null; }
            try {
                var sess = await sb.auth.getSession();
                if (sess && sess.data && sess.data.session) {
                    var res = await sb.from('my_profile').select('city').maybeSingle();
                    if (res.data && res.data.city) {
                        myCity = res.data.city;
                        active = true; // Default: auf Wohnstadt vorgefiltert
                    }
                }
            } catch (e) { /* nicht eingeloggt -> kein Stadt-Filter */ }
            loaded = true;
            return myCity;
        })();
        return loadPromise;
    }

    function matches(itemCity) {
        if (!active || !myCity) return true; // Filter aus -> alles passt
        return norm(itemCity) === norm(myCity);
    }

    function chipLabel() {
        if (active && myCity) return '📍 ' + myCity;
        return '🌍 ' + ((window.Room8i18n && Room8i18n.t) ? Room8i18n.t('city_all') : 'Alle Staedte');
    }

    function renderChip(el, onToggle) {
        if (!el) return;
        // Kein Profil/keine Stadt -> Chip ausblenden
        if (!myCity) { el.style.display = 'none'; return; }
        el.style.display = 'inline-flex';
        el.className = 'city-chip' + (active ? ' active' : '');
        el.textContent = chipLabel();
        el.onclick = function () {
            active = !active;
            el.className = 'city-chip' + (active ? ' active' : '');
            el.textContent = chipLabel();
            if (typeof onToggle === 'function') onToggle(active);
        };
    }

    window.Room8City = {
        load: load,
        getCity: function () { return myCity; },
        isActive: function () { return active; },
        setActive: function (v) { active = !!v; },
        matches: matches,
        renderChip: renderChip
    };
})();
