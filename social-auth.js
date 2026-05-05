// Native Apple/Google Sign-In fuer Capacitor + Web-Fallback
// Nutzung: signInWithGoogle() / signInWithApple() — danach automatisch Profile-Check
(function () {
  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  function getSb() {
    return window.sb || window.supabase;
  }

  async function googleNative() {
    var GoogleAuth = window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleAuth;
    if (!GoogleAuth) throw new Error('GoogleAuth-Plugin nicht verfuegbar');
    try { await GoogleAuth.initialize(); } catch (e) { /* may be auto-init */ }
    var res = await GoogleAuth.signIn();
    return {
      idToken: res.authentication && res.authentication.idToken,
      profile: {
        email: res.email || '',
        full_name: ((res.givenName || '') + ' ' + (res.familyName || '')).trim() || res.name || '',
        avatar: res.imageUrl || ''
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
      redirectURI: 'https://room8.club/auth/callback',
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
    if (!sb) { window.location.href = 'dashboard.html'; return; }
    var prof = null;
    try {
      var resp = await sb.from('profiles').select('id, username, full_name, city, is_partner').eq('id', user.id).maybeSingle();
      prof = resp.data || null;
    } catch (e) { /* RLS/network — assume needs completion */ }

    var needsCompletion =
      !prof ||
      !prof.username ||
      /^user[_-]?[0-9a-f]{4,}/i.test(prof.username) ||
      !prof.full_name;

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
    } else if (prof && prof.is_partner) {
      window.location.href = 'partner-dashboard.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  }

  window.signInWithGoogle = async function () {
    var sb = getSb();
    if (!sb) throw new Error('Supabase-Client nicht initialisiert');
    if (isNative) {
      var g = await googleNative();
      if (!g.idToken) throw new Error('Google: kein idToken erhalten');
      var resp = await sb.auth.signInWithIdToken({ provider: 'google', token: g.idToken });
      if (resp.error) throw resp.error;
      await routeAfterLogin(resp.data.user, g.profile);
    } else {
      var resp2 = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/dashboard.html' }
      });
      if (resp2.error) throw resp2.error;
    }
  };

  window.signInWithApple = async function () {
    var sb = getSb();
    if (!sb) throw new Error('Supabase-Client nicht initialisiert');
    if (isNative) {
      var a = await appleNative();
      if (!a.idToken) throw new Error('Apple: kein identityToken erhalten');
      var resp = await sb.auth.signInWithIdToken({ provider: 'apple', token: a.idToken, nonce: a.nonce });
      if (resp.error) throw resp.error;
      await routeAfterLogin(resp.data.user, a.profile);
    } else {
      var resp2 = await sb.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: window.location.origin + '/dashboard.html' }
      });
      if (resp2.error) throw resp2.error;
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
