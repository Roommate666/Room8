/* UniGoat Toast: schoene, glasige Kurz-Meldung. window.ugToast(msg, type)
   type: 'success' (default, gruen) | 'error' | 'warn'. Auto-Fade. */
(function () {
  'use strict';
  function ugToast(msg, type) {
    try {
      var wrap = document.getElementById('ug-toast-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'ug-toast-wrap';
        wrap.style.cssText = 'position:fixed;left:0;right:0;top:calc(env(safe-area-inset-top) + 12px);z-index:100000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 14px;';
        document.body.appendChild(wrap);
      }
      var green = (type !== 'error' && type !== 'warn');
      var el = document.createElement('div');
      el.style.cssText = 'pointer-events:auto;max-width:420px;display:flex;align-items:center;gap:10px;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;font-weight:700;font-size:14.5px;line-height:1.35;' +
        'color:' + (green ? '#0c5c3f' : '#7a1f1f') + ';background:rgba(255,255,255,.72);' +
        'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
        'border:1px solid ' + (green ? 'rgba(27,158,95,.35)' : 'rgba(200,60,60,.35)') + ';border-radius:16px;padding:13px 18px;' +
        'box-shadow:0 12px 34px rgba(0,0,0,.16);opacity:0;transform:translateY(-10px) scale(.98);transition:opacity .28s ease,transform .28s cubic-bezier(.2,.9,.3,1);';
      el.innerHTML = '<span style="font-size:17px">' + (green ? '✅' : '⚠️') + '</span><span>' + String(msg == null ? '' : msg) + '</span>';
      wrap.appendChild(el);
      requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'none'; });
      setTimeout(function () {
        el.style.opacity = '0'; el.style.transform = 'translateY(-10px) scale(.98)';
        setTimeout(function () { el.remove(); }, 300);
      }, type === 'error' ? 3600 : 2400);
    } catch (e) {}
  }
  window.ugToast = ugToast;
})();
