// Wiederverwendbare Schritt-fuer-Schritt Wizard-Engine fuer Inserat-Formulare.
// Erwartet im HTML: #wizardWrap (display:none), #wizardProgressFill, #wizardStepCount,
// #wizardBadge, #wizardTitle, #wizardViewport, #wizardBack, #wizardNext, #wizardPublish,
// und einen #oldFormBody der das urspruengliche Formular umschliesst.
//
// Nutzung pro Seite:  Wizard.start(STEPS)   wobei STEPS = [{ t, b:'required'|'optional', req:[ids], box:[selektoren], last }]
// box-Selektoren: '#group-x' / '#xSection' / '.form-group'-Container werden direkt gemoved,
//                 '#feldId' wird ueber das umschliessende .form-group gemoved.

(function () {
    var UM = String.fromCharCode(252), AE = String.fromCharCode(228), OE = String.fromCharCode(246); // ue, ae, oe
    var W = { steps: [], step: 0, on: false };

    // CSS einmalig injizieren (keine seiten-spezifische CSS noetig)
    var css = '#wizardProgressBar{height:6px;background:#E5E7EB;border-radius:999px;overflow:hidden;margin-bottom:1rem}' +
        '#wizardProgressFill{height:100%;width:0;background:#4F46E5;border-radius:999px;transition:width .3s ease}' +
        '#wizardHead{display:flex;align-items:center;gap:.6rem;margin-bottom:.25rem}' +
        '#wizardStepCount{font-size:.8rem;font-weight:600;color:#6B7280;letter-spacing:.02em}' +
        '.wbadge-required,.wbadge-optional{font-size:.72rem;font-weight:700;padding:.15rem .55rem;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}' +
        '.wbadge-required{background:#FEE2E2;color:#B91C1C}.wbadge-optional{background:#ECFDF5;color:#047857}' +
        '#wizardTitle{font-size:1.35rem;font-weight:700;color:#111827;margin-bottom:1.1rem}' +
        '#wizardViewport{min-height:100px}' +
        '#wizardNav{display:flex;gap:.75rem;margin-top:1.5rem}' +
        '#wizardNav button{flex:1;padding:.95rem;border-radius:12px;font-weight:600;font-size:1rem;cursor:pointer;border:none}' +
        '#wizardBack{background:#F3F4F6;color:#374151}#wizardBack:disabled{opacity:.4;cursor:not-allowed}' +
        '#wizardNext{background:#4F46E5;color:#fff}#wizardPublish{background:#10B981;color:#fff}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    function el(id) { return document.getElementById(id); }

    function boxOf(sel) {
        var node = document.querySelector(sel);
        if (!node) return null;
        if (node.classList.contains('form-group')) return node;
        if (node.id && (/^group-/.test(node.id) || /-group$/.test(node.id) || /Section$/.test(node.id) || /Wrap$/.test(node.id))) return node;
        return node.closest('.form-group') || node;
    }

    function render() {
        var viewport = el('wizardViewport');
        var oldBody = el('oldFormBody');
        while (viewport.firstChild) oldBody.appendChild(viewport.firstChild);
        var step = W.steps[W.step];
        step.box.forEach(function (sel) {
            var box = boxOf(sel);
            if (box) viewport.appendChild(box);
        });
        el('wizardTitle').textContent = step.t;
        el('wizardStepCount').textContent = 'Schritt ' + (W.step + 1) + ' von ' + W.steps.length;
        var badge = el('wizardBadge');
        var req = step.b === 'required';
        badge.textContent = req ? 'Pflicht' : 'Optional';
        badge.className = req ? 'wbadge-required' : 'wbadge-optional';
        el('wizardProgressFill').style.width = ((W.step + 1) / W.steps.length * 100) + '%';
        el('wizardBack').disabled = (W.step === 0);
        el('wizardNext').style.display = step.last ? 'none' : '';
        el('wizardPublish').style.display = step.last ? '' : 'none';
        viewport.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function validate() {
        var step = W.steps[W.step];
        var ids = step.req || [];
        for (var i = 0; i < ids.length; i++) {
            var node = el(ids[i]);
            if (node && !String(node.value || '').trim()) {
                if (window.Room8UI) Room8UI.warning('Bitte dieses Pflichtfeld ausf' + UM + 'llen.');
                node.focus();
                return false;
            }
        }
        if (typeof step.validate === 'function' && !step.validate()) return false;
        return true;
    }

    W.start = function (steps) {
        W.steps = steps;
        W.step = 0;
        W.on = true;
        el('oldFormBody').style.display = 'none';
        el('wizardWrap').style.display = 'block';
        // Alle Pflicht-Attribute raus -> versteckte required-Felder blockieren den Submit nicht
        document.querySelectorAll('#oldFormBody [required]').forEach(function (node) { node.required = false; });
        render();
    };
    W.next = function () { if (validate() && W.step < W.steps.length - 1) { W.step++; render(); } };
    W.back = function () { if (W.step > 0) { W.step--; render(); } };
    W.isOn = function () { return W.on; };
    W.gotoLast = function () { W.step = W.steps.length - 1; render(); };
    // Publish: vor dem Form-Submit den letzten Schritt validieren
    W.tryPublish = function (ev) {
        if (!validate()) { if (ev) ev.preventDefault(); return false; }
        return true;
    };
    // Moduswechsel via sauberem Reload (?mode=)
    W.switchMode = function (m, current) {
        if (m === current) return;
        var qs = '?mode=' + m;
        var ed = new URLSearchParams(window.location.search).get('edit');
        if (ed) qs += '&edit=' + ed;
        window.location.href = window.location.pathname + qs;
    };

    window.Wizard = W;
})();
