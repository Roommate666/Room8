// =============================================================
// UniGoat City-Filter - echter Staedte-Waehler (Dropdown / nativer iOS-Picker)
// Statt nur "meine Stadt <-> alle" kann man jetzt jede Stadt mit Inhalt waehlen.
// Default: Wohnstadt des Users vorausgewaehlt. Hat eine Seite nur 1 Stadt
// (oder keine) -> Waehler wird ausgeblendet (kein Mehrwert).
// API (rueckwaertskompatibel):
//   Room8City.load()                             -> Wohnstadt laden (Promise)
//   Room8City.getCity()                          -> Wohnstadt (oder null)
//   Room8City.getSelected()                      -> aktuell gewaehlte Stadt (null = Alle)
//   Room8City.setCity(c)                         -> Stadt setzen (null = Alle)
//   Room8City.isActive()                         -> ist eine Stadt gewaehlt? (bool)
//   Room8City.setActive(bool)                    -> false = Alle; true = Wohnstadt
//   Room8City.matches(itemCity)                  -> passt Item zur Auswahl?
//   Room8City.setAvailableCities(arr)            -> verfuegbare Staedte setzen
//   Room8City.renderChip(el, onChange, cities?)  -> <select> rendern (cities optional)
// =============================================================
(function () {
    var myCity = null;
    var selectedCity = null;        // null = Alle Staedte
    var availableCities = [];       // distinkte Staedte mit Inhalt
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

    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function t(key, fb) { return (window.Room8i18n && Room8i18n.t) ? Room8i18n.t(key) : fb; }

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
                        selectedCity = myCity; // Default: auf Wohnstadt vorgewaehlt
                    }
                }
            } catch (e) { /* nicht eingeloggt -> kein Vorfilter */ }
            loaded = true;
            return myCity;
        })();
        return loadPromise;
    }

    function setAvailableCities(arr) {
        var seen = {}, list = [];
        (arr || []).forEach(function (c) {
            if (!c) return;
            var k = norm(c);
            if (!seen[k]) { seen[k] = 1; list.push(c); }
        });
        list.sort(function (a, b) { return String(a).localeCompare(String(b), 'de'); });
        availableCities = list;
    }

    function matches(itemCity) {
        if (!selectedCity) return true;       // Alle Staedte
        return norm(itemCity) === norm(selectedCity);
    }

    function renderChip(el, onChange, cities) {
        if (!el) return;
        if (cities) setAvailableCities(cities);
        var list = availableCities;
        // Nur 0-1 Stadt -> Waehler bringt nichts -> ausblenden
        if (!list || list.length < 1) { el.style.display = 'none'; return; }
        // gewaehlte Stadt validieren (falls nicht mehr in der Liste)
        var keys = list.map(norm);
        if (selectedCity && keys.indexOf(norm(selectedCity)) === -1) selectedCity = null;

        el.style.display = '';
        el.className = 'city-select';
        var html = '<option value="__all__">🌍 ' + esc(t('city_all', 'Alle Staedte')) + '</option>';
        list.forEach(function (c) {
            var sel = (selectedCity && norm(c) === norm(selectedCity)) ? ' selected' : '';
            html += '<option value="' + esc(c) + '"' + sel + '>📍 ' + esc(c) + '</option>';
        });
        el.innerHTML = html;
        el.value = selectedCity ? selectedCity : '__all__';
        el.onchange = function () {
            selectedCity = (el.value === '__all__') ? null : el.value;
            if (typeof onChange === 'function') onChange();
        };
    }

    window.Room8City = {
        load: load,
        getCity: function () { return myCity; },
        getSelected: function () { return selectedCity; },
        setCity: function (c) { selectedCity = c || null; },
        isActive: function () { return !!selectedCity; },
        setActive: function (v) { selectedCity = v ? (myCity || selectedCity) : null; },
        matches: matches,
        setAvailableCities: setAvailableCities,
        renderChip: renderChip,          // rendert jetzt ein <select>
        renderSelector: renderChip       // Alias
    };
})();
