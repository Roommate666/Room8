// =============================================================
// Room8 Saves - Universelles Speichern fuer Coupons / Jobs / Events
// Nutzt Tabelle saved_items (Mig 20260608000001).
// API:
//   Room8Saves.load()                 -> laedt alle gespeicherten IDs des Users (Promise)
//   Room8Saves.isSaved(type, id)      -> bool (synchron, aus geladenem Cache)
//   Room8Saves.toggle(type, id)       -> speichert/entfernt (Promise<bool> = neuer Zustand)
//   Room8Saves.makeButton(type, id)   -> liefert ein <button>-Element mit Bookmark-Icon
//   Room8Saves.wire(btn, type, id)    -> verdrahtet existierenden Button + setzt Initialzustand
//   Room8Saves.listByType(type)       -> Array von item_ids fuer einen Typ (aus Cache)
// =============================================================
(function () {
    var cache = null; // Set von "type:id"
    var loadPromise = null;

    function getClient() {
        if (window.sb) return window.sb;
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            return window.sb;
        }
        return null;
    }

    function key(type, id) { return type + ':' + id; }

    async function getUserId() {
        var sb = getClient();
        if (!sb) return null;
        try {
            var res = await sb.auth.getSession();
            return res && res.data && res.data.session ? res.data.session.user.id : null;
        } catch (e) { return null; }
    }

    async function load() {
        if (loadPromise) return loadPromise;
        loadPromise = (async function () {
            cache = new Set();
            var sb = getClient();
            var uid = await getUserId();
            if (!sb || !uid) return cache;
            try {
                var res = await sb.from('saved_items').select('item_type,item_id').eq('user_id', uid);
                if (res.data) {
                    res.data.forEach(function (row) { cache.add(key(row.item_type, row.item_id)); });
                }
            } catch (e) { /* offline / nicht eingeloggt -> leerer Cache */ }
            return cache;
        })();
        return loadPromise;
    }

    function isSaved(type, id) {
        return !!(cache && cache.has(key(type, String(id))));
    }

    function listByType(type) {
        if (!cache) return [];
        var out = [];
        cache.forEach(function (k) {
            var idx = k.indexOf(':');
            if (k.slice(0, idx) === type) out.push(k.slice(idx + 1));
        });
        return out;
    }

    async function toggle(type, id) {
        var sb = getClient();
        var uid = await getUserId();
        if (!sb || !uid) {
            // Nicht eingeloggt -> zum Login
            var msg = (window.Room8i18n && Room8i18n.t) ? Room8i18n.t('saves_login_required') : 'Bitte einloggen, um zu speichern.';
            if (window.Room8UI && Room8UI.toast) Room8UI.toast(msg);
            else alert(msg);
            return false;
        }
        if (!cache) await load();
        id = String(id);
        var currently = isSaved(type, id);
        try {
            if (currently) {
                await sb.from('saved_items').delete().eq('user_id', uid).eq('item_type', type).eq('item_id', id);
                cache.delete(key(type, id));
                return false;
            } else {
                await sb.from('saved_items').insert({ user_id: uid, item_type: type, item_id: id });
                cache.add(key(type, id));
                return true;
            }
        } catch (e) {
            return currently; // Zustand unveraendert bei Fehler
        }
    }

    function iconSvg(filled) {
        // Bookmark-Icon (gefuellt / Outline)
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none') +
            '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    }

    function applyState(btn, filled) {
        btn.innerHTML = iconSvg(filled);
        btn.setAttribute('aria-pressed', filled ? 'true' : 'false');
        var label = (window.Room8i18n && Room8i18n.t)
            ? Room8i18n.t(filled ? 'saves_saved' : 'saves_save')
            : (filled ? 'Gespeichert' : 'Speichern');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.classList.toggle('is-saved', filled);
    }

    function wire(btn, type, id) {
        if (!btn) return;
        id = String(id);
        applyState(btn, isSaved(type, id));
        btn.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            btn.disabled = true;
            var nowSaved = await toggle(type, id);
            applyState(btn, nowSaved);
            btn.disabled = false;
        });
    }

    function makeButton(type, id) {
        var btn = document.createElement('button');
        btn.className = 'save-btn';
        btn.type = 'button';
        wire(btn, type, id);
        return btn;
    }

    window.Room8Saves = {
        load: load,
        isSaved: isSaved,
        toggle: toggle,
        wire: wire,
        makeButton: makeButton,
        listByType: listByType
    };
})();
