// Native Apple/Google Sign-In fuer Capacitor + Web-Fallback
// Nutzung: signInWithApple() / signInWithGoogle() — danach automatisch Profile-Check
// Google: @capgo/capacitor-social-login (seit 15.05.2026, ersetzt totes codetrix-Plugin)
// Apple : @capacitor-community/apple-sign-in (unveraendert)
(function () {
  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var googleInitDone = false;

  function getSb() {
    return window.sb || window.supabase;
  }

  function platformName() {
    try {
      if (window.Capacitor && window.Capacitor.getPlatform) return window.Capacitor.getPlatform();
    } catch (e) {}
    return isNative ? 'native' : 'web';
  }

  // Erkennt User-Abbruch (Dialog geschlossen/abgebrochen) anhand typischer
  // Fehlertexte/Codes von Google (iOS: -5 / 12501 Android, popup_closed Web)
  // und Apple (1001 = ASAuthorizationErrorCanceled). Abbruch ist KEIN Fehler.
  function isUserCancel(err) {
    if (!err) return false;
    var msg = ((err && err.message) || String(err) || '').toLowerCase();
    var code = String((err && (err.code != null ? err.code : err.errorCode)) || '').toLowerCase();
    var hay = msg + ' ' + code;
    return (
      hay.indexOf('cancel') !== -1 ||     // canceled / cancelled / the user canceled
      hay.indexOf('abbruch') !== -1 ||
      hay.indexOf('dismiss') !== -1 ||
      hay.indexOf('popup_closed') !== -1 ||
      hay.indexOf('closed') !== -1 ||
      hay.indexOf('-5') !== -1 ||         // Google iOS: user canceled
      hay.indexOf('12501') !== -1 ||      // Google Android: SIGN_IN_CANCELLED
      hay.indexOf('1001') !== -1          // Apple: ASAuthorizationError.canceled
    );
  }

  // Zentrales Fehler-Logging: schreibt echte Fehler nach Sentry (mit Kontext),
  // Abbrueche werden still ignoriert. Defensive: Room8Sentry evtl. noch nicht da.
  function logAuthError(err, ctx) {
    try {
      if (isUserCancel(err)) return; // Abbruch = kein Fehler, nicht loggen
      var context = ctx || {};
      context.platform = platformName();
      var tags = { provider: context.provider || '', step: context.step || '', platform: context.platform };
      if (window.Room8Sentry && typeof window.Room8Sentry.captureException === 'function') {
        window.Room8Sentry.captureException(err, { tags: tags, extra: context });
      } else if (window.Room8Sentry && typeof window.Room8Sentry.captureMessage === 'function') {
        window.Room8Sentry.captureMessage('[auth] ' + (context.provider || '') + '/' + (context.step || '') + ': ' + ((err && err.message) || String(err)));
      }
    } catch (e) { /* Logging darf den Login-Flow nie brechen */ }
  }

  // Export: Button-Handler nutzen das, um Abbruch sauber von echtem Fehler zu trennen.
  window.Room8Auth = window.Room8Auth || {};
  window.Room8Auth.isUserCancel = isUserCancel;
  window.Room8Auth.logError = logAuthError;

  async function googleInitOnce() {
    if (googleInitDone) return;
    var SocialLogin = window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
    if (!SocialLogin) throw new Error('SocialLogin-Plugin nicht verfuegbar');
    // Provider muss explizit beim initialize uebergeben werden — Plugin liest
    // capacitor.config.json NICHT zur Laufzeit (sondern nur build-time fuer Pods).
    await SocialLogin.initialize({
      google: {
        iOSClientId: '193353507606-sqa3763hp6mp67l7lv38puohmdjocovn.apps.googleusercontent.com',
        iOSServerClientId: '193353507606-qjq74nuka2a15qbankvfshqaqukhaead.apps.googleusercontent.com',
        // Android braucht den webClientId (Web/Server-Client, type 3) — ohne ihn schlaegt Google-Login auf Android (Samsung etc.) fehl
        webClientId: '193353507606-qjq74nuka2a15qbankvfshqaqukhaead.apps.googleusercontent.com',
        mode: 'online'
      }
    });
    // WICHTIG: googleInitDone erst NACH erfolgreichem await setzen. Wirft initialize,
    // bleibt das Flag false -> ein erneuter Login-Versuch ruft initialize noch einmal auf.
    googleInitDone = true;
  }

  async function googleNative() {
    var SocialLogin = window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
    if (!SocialLogin) throw new Error('SocialLogin-Plugin nicht verfuegbar');
    await googleInitOnce();
    var res = await SocialLogin.login({
      provider: 'google',
      options: { scopes: ['email', 'profile'] }
    });
    var r = (res && res.result) || {};
    var p = r.profile || {};
    var name = '';
    if (p.givenName || p.familyName) {
      name = ((p.givenName || '') + ' ' + (p.familyName || '')).trim();
    } else if (p.name) {
      name = p.name;
    }
    return {
      idToken: r.idToken,
      profile: {
        email: p.email || '',
        full_name: name,
        avatar: p.imageUrl || p.pictureUrl || ''
      }
    };
  }

  async function sha256Hex(s) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  async function appleNative() {
    var AppleSignIn = window.Capacitor.Plugins && window.Capacitor.Plugins.SignInWithApple;
    if (!AppleSignIn) throw new Error('SignInWithApple-Plugin nicht verfuegbar');
    // Raw nonce -> wir geben den HASH an Apple (Apple legt ihn so im JWT ab)
    // Supabase bekommt den RAW nonce (hasht selbst und vergleicht).
    var rawNonce = Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
    var hashedNonce = await sha256Hex(rawNonce);
    var res = await AppleSignIn.authorize({
      clientId: 'club.room8.app',
      redirectURI: 'https://unigoat.de/auth/callback',
      scopes: 'email name',
      state: '12345',
      nonce: hashedNonce
    });
    var r = res.response || {};
    var name = '';
    if (r.givenName || r.familyName) name = ((r.givenName || '') + ' ' + (r.familyName || '')).trim();
    return {
      idToken: r.identityToken,
      nonce: rawNonce,
      profile: { email: r.email || '', full_name: name, avatar: '' }
    };
  }

  // Profile-Check nach Login: wenn unvollstaendig -> complete-profile.html
  async function routeAfterLogin(user, oauthProfile) {
    var sb = getSb();
    if (!sb) { window.location.href = 'app.html'; return; }
    var prof = null;
    try {
      var resp = await sb.from('profiles').select('id, username, full_name, city').eq('id', user.id).maybeSingle();
      prof = resp.data || null;
      // Supabase gibt Fehler via resp.error zurueck (wirft nicht) -> explizit melden,
      // Flow laeuft trotzdem weiter in den complete-profile-Fallback.
      if (resp.error) logAuthError(resp.error, { step: 'route', detail: 'profiles-select' });
    } catch (e) {
      // RLS/network — Flow nimmt needsCompletion an, Fehler trotzdem sichtbar machen
      logAuthError(e, { step: 'route', detail: 'profiles-select-threw' });
    }

    var needsCompletion =
      !prof ||
      !prof.username ||
      /^user[_-]?[0-9a-f]{4,}/i.test(prof.username) ||
      !prof.full_name ||
      !prof.city;   // Stadt ist Pflicht -> sonst keine Stadt-Push (Wachstums-Loop)

    if (needsCompletion) {
      if (oauthProfile) {
        try {
          sessionStorage.setItem('oauth_prefill', JSON.stringify({
            full_name: oauthProfile.full_name || '',
            email: oauthProfile.email || user.email || '',
            avatar: oauthProfile.avatar || ''
          }));
        } catch (e) {}
      }
      window.location.href = 'complete-profile.html';
    } else {
      // Nach Login direkt in die App-Shell (app.html)
      window.location.href = 'app.html';
    }
  }

  window.signInWithGoogle = async function () {
    var sb = getSb();
    if (!sb) {
      var noSb = new Error('Supabase-Client nicht initialisiert');
      logAuthError(noSb, { provider: 'google', step: 'init' });
      throw noSb;
    }
    if (isNative) {
      var g;
      try {
        // googleNative() deckt init (googleInitOnce) + SocialLogin.login ab.
        g = await googleNative();
      } catch (loginErr) {
        logAuthError(loginErr, { provider: 'google', step: 'login' });
        throw loginErr;
      }
      if (!g.idToken) {
        var noTok = new Error('Google: kein idToken erhalten');
        logAuthError(noTok, { provider: 'google', step: 'idToken', hasProfile: !!(g && g.profile) });
        throw noTok;
      }
      var resp = await sb.auth.signInWithIdToken({ provider: 'google', token: g.idToken });
      if (resp.error) {
        logAuthError(resp.error, { provider: 'google', step: 'signInWithIdToken' });
        throw resp.error;
      }
      try {
        await routeAfterLogin(resp.data.user, g.profile);
      } catch (routeErr) {
        logAuthError(routeErr, { provider: 'google', step: 'route' });
        throw routeErr;
      }
    } else {
      var resp2 = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/dashboard.html' }
      });
      if (resp2.error) {
        logAuthError(resp2.error, { provider: 'google', step: 'signInWithOAuth' });
        throw resp2.error;
      }
    }
  };

  window.signInWithApple = async function () {
    var sb = getSb();
    if (!sb) {
      var noSb = new Error('Supabase-Client nicht initialisiert');
      logAuthError(noSb, { provider: 'apple', step: 'init' });
      throw noSb;
    }
    if (isNative) {
      var a;
      try {
        a = await appleNative();
      } catch (loginErr) {
        logAuthError(loginErr, { provider: 'apple', step: 'login' });
        throw loginErr;
      }
      if (!a.idToken) {
        var noTok = new Error('Apple: kein identityToken erhalten');
        logAuthError(noTok, { provider: 'apple', step: 'idToken' });
        throw noTok;
      }
      var resp = await sb.auth.signInWithIdToken({ provider: 'apple', token: a.idToken, nonce: a.nonce });
      if (resp.error) {
        logAuthError(resp.error, { provider: 'apple', step: 'signInWithIdToken' });
        throw resp.error;
      }
      try {
        await routeAfterLogin(resp.data.user, a.profile);
      } catch (routeErr) {
        logAuthError(routeErr, { provider: 'apple', step: 'route' });
        throw routeErr;
      }
    } else {
      var resp2 = await sb.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: window.location.origin + '/dashboard.html' }
      });
      if (resp2.error) {
        logAuthError(resp2.error, { provider: 'apple', step: 'signInWithOAuth' });
        throw resp2.error;
      }
    }
  };

  // Hilfsfunktion fuer dashboard.html (Web-OAuth-Rueckkehr): pruefe Profile, redirect ggf.
  window.checkProfileCompletion = async function () {
    var sb = getSb();
    if (!sb) return;
    var u = await sb.auth.getUser();
    if (!u || !u.data || !u.data.user) return;
    var user = u.data.user;
    var resp = await sb.from('profiles').select('username, full_name').eq('id', user.id).maybeSingle();
    var prof = resp.data;
    var meta = user.user_metadata || {};
    var needs = !prof || !prof.username || /^user[_-]?[0-9a-f]{4,}/i.test(prof.username) || !prof.full_name;
    if (needs) {
      try {
        sessionStorage.setItem('oauth_prefill', JSON.stringify({
          full_name: meta.full_name || meta.name || '',
          email: user.email || '',
          avatar: meta.avatar_url || meta.picture || ''
        }));
      } catch (e) {}
      window.location.href = 'complete-profile.html';
    }
  };
})();
