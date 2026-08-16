// verify-i18n.js - 5-Sprachen-Support fuer den Verifizierungs-Flow (DE/EN/TR/FR/ES).
// Uebersetzt per Text-Abgleich (Schluessel = deutscher Originaltext) + Sprach-Umschalter oben rechts.
// Auf verify-options.html / verify-uni-email.html / verify-scan.html einbinden.
(function () {
  var LANGS = ['de', 'en', 'tr', 'fr', 'es'];
  var LABELS = { de: 'DE', en: 'EN', tr: 'TR', fr: 'FR', es: 'ES' };

  // Schluessel = exakter deutscher Text (getrimmt). Wert = Uebersetzungen.
  var T = {
    'Studenten-Status': { en: 'Student status', tr: 'Öğrenci durumu', fr: 'Statut étudiant', es: 'Estado de estudiante' },
    'Studierenden-Verifizierung': { en: 'Student verification', tr: 'Öğrenci doğrulaması', fr: 'Vérification étudiante', es: 'Verificación de estudiante' },
    'Fast geschafft!': { en: 'Almost there!', tr: 'Neredeyse tamam!', fr: 'Presque fini !', es: '¡Ya casi!' },
    'Verifizier dich als Student und schalt Rabatte, Nebenjobs und Events in deiner Stadt frei. Dauert 1 Minute.': {
      en: 'Verify as a student and unlock discounts, part-time jobs and events in your city. Takes 1 minute.',
      tr: 'Öğrenci olarak doğrulan ve şehrindeki indirimleri, yarı zamanlı işleri ve etkinlikleri aç. 1 dakika sürer.',
      fr: "Vérifie ton statut étudiant et débloque réductions, jobs et événements dans ta ville. 1 minute.",
      es: 'Verifícate como estudiante y desbloquea descuentos, trabajos y eventos en tu ciudad. Tarda 1 minuto.' },
    '💡 Am schnellsten geht es mit deiner Uni-Mail.': {
      en: '💡 Fastest with your university email.', tr: '💡 En hızlısı üniversite e-postanla.',
      fr: '💡 Le plus rapide avec ton e-mail universitaire.', es: '💡 Lo más rápido con tu correo universitario.' },
    'Schnell': { en: 'Fast', tr: 'Hızlı', fr: 'Rapide', es: 'Rápido' },
    'Uni-Mail': { en: 'Uni email', tr: 'Üniversite e-postası', fr: 'E-mail universitaire', es: 'Correo universitario' },
    'Immatrikulation': { en: 'Enrollment', tr: 'Kayıt belgesi', fr: 'Inscription', es: 'Matrícula' },
    'Deine Uni-Mail-Adresse': { en: 'Your university email', tr: 'Üniversite e-posta adresin', fr: 'Ton e-mail universitaire', es: 'Tu correo universitario' },
    'Code anfordern': { en: 'Request code', tr: 'Kod iste', fr: 'Demander le code', es: 'Pedir código' },
    'Code aus der Mail (6 Ziffern)': { en: 'Code from the email (6 digits)', tr: "E-postadaki kod (6 rakam)", fr: "Code de l'e-mail (6 chiffres)", es: 'Código del correo (6 dígitos)' },
    'Bestätigen': { en: 'Confirm', tr: 'Onayla', fr: 'Confirmer', es: 'Confirmar' },
    'Code erneut senden': { en: 'Resend code', tr: 'Kodu tekrar gönder', fr: 'Renvoyer le code', es: 'Reenviar código' },
    'Immatrikulationsbescheinigung scannen': { en: 'Scan your enrollment certificate', tr: 'Kayıt belgeni tara', fr: "Scanne ton certificat d'inscription", es: 'Escanea tu certificado de matrícula' },
    'Dokument einreichen': { en: 'Submit document', tr: 'Belgeyi gönder', fr: 'Envoyer le document', es: 'Enviar documento' },
    'Bescheinigung prüfen': { en: 'Check certificate', tr: 'Belgeyi kontrol et', fr: 'Vérifier le certificat', es: 'Comprobar certificado' },
    'Anderes Bild wählen': { en: 'Choose another image', tr: 'Başka görsel seç', fr: 'Choisir une autre image', es: 'Elegir otra imagen' },
    'Kamera oder Datei · JPG, PNG, WebP': { en: 'Camera or file · JPG, PNG, WebP', tr: 'Kamera veya dosya · JPG, PNG, WebP', fr: 'Caméra ou fichier · JPG, PNG, WebP', es: 'Cámara o archivo · JPG, PNG, WebP' },
    'Einreichung erfolgreich!': { en: 'Submitted successfully!', tr: 'Başarıyla gönderildi!', fr: 'Envoyé avec succès !', es: '¡Enviado con éxito!' },
    'Zurück zum Profil': { en: 'Back to profile', tr: 'Profile dön', fr: 'Retour au profil', es: 'Volver al perfil' },
    'Erneut verifizieren': { en: 'Verify again', tr: 'Tekrar doğrula', fr: 'Vérifier à nouveau', es: 'Verificar de nuevo' },
    'Erneut versuchen': { en: 'Try again', tr: 'Tekrar dene', fr: 'Réessayer', es: 'Intentar de nuevo' },
    'Verifizierung zurücksetzen': { en: 'Reset verification', tr: 'Doğrulamayı sıfırla', fr: 'Réinitialiser la vérification', es: 'Restablecer verificación' },
    'sofort verifiziert': { en: 'verified instantly', tr: 'anında doğrulanır', fr: 'vérifié immédiatement', es: 'verificado al instante' },
    '1–3 Werktage': { en: '1–3 business days', tr: '1–3 iş günü', fr: '1–3 jours ouvrés', es: '1–3 días hábiles' },
    'Datenschutz:': { en: 'Privacy:', tr: 'Gizlilik:', fr: 'Confidentialité :', es: 'Privacidad:' },
    'E-Mail wird verifiziert...': { en: 'Verifying email…', tr: 'E-posta doğrulanıyor…', fr: "Vérification de l'e-mail…", es: 'Verificando correo…' },
    'Bitte warte, wir prüfen deinen Verifizierungstoken.': { en: 'Please wait, we are checking your verification token.', tr: 'Lütfen bekle, doğrulama kodunu kontrol ediyoruz.', fr: 'Patiente, nous vérifions ton jeton.', es: 'Espera, estamos comprobando tu token.' },
    'Verifizierung fehlgeschlagen': { en: 'Verification failed', tr: 'Doğrulama başarısız', fr: 'Échec de la vérification', es: 'Verificación fallida' },
    'E-Mail verifiziert!': { en: 'Email verified!', tr: 'E-posta doğrulandı!', fr: 'E-mail vérifié !', es: '¡Correo verificado!' },
    'Der Link ist möglicherweise ungültig oder abgelaufen.': { en: 'The link may be invalid or expired.', tr: 'Bağlantı geçersiz veya süresi dolmuş olabilir.', fr: 'Le lien est peut-être invalide ou expiré.', es: 'El enlace puede no ser válido o haber caducado.' },
    'Kein Verifizierungstoken in der URL gefunden.': { en: 'No verification token found in the URL.', tr: 'URL’de doğrulama kodu bulunamadı.', fr: 'Aucun jeton de vérification trouvé dans l’URL.', es: 'No se encontró un token de verificación en la URL.' },
    'Fehler:': { en: 'Error:', tr: 'Hata:', fr: 'Erreur :', es: 'Error:' },
    '❌ Fehler:': { en: '❌ Error:', tr: '❌ Hata:', fr: '❌ Erreur :', es: '❌ Error:' },
    '✅ Erfolgreich!': { en: '✅ Success!', tr: '✅ Başarılı!', fr: '✅ Réussi !', es: '✅ ¡Correcto!' },
    'Erfolgreich!': { en: 'Success!', tr: 'Başarılı!', fr: 'Réussi !', es: '¡Correcto!' },
    'Der Verifizierungslink ist ungültig oder bereits abgelaufen. Bitte fordere einen neuen Link an.': { en: 'The verification link is invalid or has expired. Please request a new link.', tr: 'Doğrulama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir bağlantı iste.', fr: 'Le lien de vérification est invalide ou expiré. Demande un nouveau lien.', es: 'El enlace de verificación no es válido o ha caducado. Solicita uno nuevo.' }
  };

  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function getLang() {
    try { var s = localStorage.getItem('ug_lang'); if (s && LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    var n = (navigator.language || 'de').slice(0, 2).toLowerCase();
    return LANGS.indexOf(n) >= 0 ? n : 'de';
  }
  function translate(lang) {
    if (lang === 'de') return;
    // Text-Elemente (nur reiner Text, keine Kind-Elemente)
    var els = document.querySelectorAll('h1,h2,h3,h4,p,button,label,span,a,div,small');
    els.forEach(function (el) {
      if (el.childElementCount !== 0) return;
      var key = norm(el.textContent);
      if (T[key] && T[key][lang]) el.textContent = T[key][lang];
    });
    // Platzhalter
    document.querySelectorAll('[placeholder]').forEach(function (el) {
      var key = norm(el.getAttribute('placeholder'));
      if (T[key] && T[key][lang]) el.setAttribute('placeholder', T[key][lang]);
    });
    // Textknoten (faengt auch Text INNERHALB von Markup, z.B. nach <strong>/<br>)
    try {
      var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var tn, changes = [];
      while ((tn = tw.nextNode())) {
        var k = norm(tn.nodeValue);
        if (k && T[k] && T[k][lang]) changes.push([tn, T[k][lang]]);
      }
      changes.forEach(function (c) { c[0].nodeValue = c[1]; });
    } catch (e) {}
  }
  function buildSwitcher(current) {
    if (document.getElementById('vi-switch')) return; // nur einmal
    var wrap = document.createElement('div');
    wrap.id = 'vi-switch';
    wrap.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 8px);right:10px;z-index:99999;';
    var sel = document.createElement('select');
    sel.style.cssText = 'border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:6px 8px;font-weight:800;font-size:13px;background:#fff;color:#15181C;box-shadow:0 2px 8px rgba(0,0,0,.12);cursor:pointer;';
    LANGS.forEach(function (l) {
      var o = document.createElement('option'); o.value = l; o.textContent = LABELS[l];
      if (l === current) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      try { localStorage.setItem('ug_lang', sel.value); } catch (e) {}
      location.reload();
    });
    wrap.appendChild(sel);
    document.body.appendChild(wrap);
  }
  function run() {
    var lang = getLang();
    translate(lang);
    buildSwitcher(lang);
    try { document.documentElement.setAttribute('lang', lang); } catch (e) {}
    // Dynamisch nachgeladene Meldungen (JS setzt Erfolg/Fehler nach dem Token-Check) mituebersetzen.
    if (lang !== 'de' && window.MutationObserver && !window.__viObs) {
      window.__viObs = new MutationObserver(function () { translate(lang); });
      try { window.__viObs.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    }
  }
  window.applyVerifyI18n = function () { translate(getLang()); };
  // Robust: mehrfach ausloesen (DOMContentLoaded + load + kurze Delays), damit auch
  // dynamisch (nach fetch) gesetzte Meldungen und der Umschalter sicher erscheinen.
  function boot() { try { run(); } catch (e) {} }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('load', boot);
  [300, 900, 2000].forEach(function (ms) { setTimeout(boot, ms); });
})();
