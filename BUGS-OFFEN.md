# Room8 — Offene Bugs, Security-Issues & Feature-Gaps

**Stand:** 04.05.2026 — nach Bug-Detective + Security-Audit + Live-Test
**Quellen:** Sub-Agent Reports `a40f99cbe5f663c43` (Bug-Hunt) + `a4798b09a9e20d6e8` (Security)

---

## SICHERHEIT — KRITISCH (sofort)

### S1. Firebase Service-Account-JSON war im Git committet — RESOLVED 04.05.
- **Datei:** `room8-d1867-firebase-adminsdk-fbsvc-454157b46d.json`
- **Beweis:** Commit `f1da27c` (Key drin), `21d7b08` (Key entfernt, History bleibt)
- **Status:** Der Key gehoert zu altem Projekt `room8-d1867` — dieses Projekt EXISTIERT NICHT MEHR. Aktuelle App nutzt `room8-18fc9`. Verifiziert via Firebase Console (Yusuf hat nur 1 Projekt).
- **Auswirkung:** Key ist wertlos, kein Auth gegen totes Projekt moeglich.
- **Aktion:** Lokale Datei geloescht (war .gitignored). Optional: Git-History Cleanup via filter-repo (Polish, nicht kritisch).

### S2. Keystore-Passwort hardcoded in build.gradle
- **Pfad:** `android/app/build.gradle:17,19` — `'Albayrak8Para$'`
- **Auswirkung:** Wer Repo-Lesezugriff hat + die `room8-release.jks` bekommt: kann Fake-Updates der App signieren
- **Fix:** In `~/.gradle/gradle.properties` als `RELEASE_STORE_PASSWORD=...` auslagern, in `build.gradle` mit `project.findProperty(...)` lesen. Datei ist user-scoped, nicht im Repo.

### S3. send-email Edge Function = Open SMTP Relay
- **Pfad:** `supabase/functions/send-email/index.ts` (deployed mit `--no-verify-jwt`)
- **Auswirkung:** Jeder Anonyme kann ueber `noreply@room8.club` beliebige Mails an beliebige Adressen senden. Phishing-Vector. Resend-Account wird gesperrt sobald jemand das ausnutzt.
- **Fix:** Shared-Secret-Header (`x-internal-token` aus `Deno.env`), Empfaenger-Whitelist (nur User-IDs aus `auth.users`), Rate-Limit pro IP

### S4. send-push Edge Function = Push-Spam-Vector
- **Pfad:** `supabase/functions/send-push/index.ts` (deployed mit `--no-verify-jwt`)
- **Auswirkung:** Anon kann beliebigen User pushen, dessen UUID er kennt. UUIDs leaken ueber public-profile, events, listings.
- **Fix:** Shared-Secret-Header ODER JWT-Verify: `auth.uid() == userId` ODER nur Service-Role-Calls erlauben

### S5. Storage-Bucket `event-images/partner-uploads/*` = anon Upload ohne Limits
- **Migration:** `20260502000020_partner_submissions_media.sql:19-26`
- **Policy:** `partner_uploads_anon_insert` erlaubt anon INSERT
- **Auswirkung:** CSAM-Hosting-Risiko, Malware-Hosting, Quota-Abuse
- **Fix:** Auth requirieren (anon raus) ODER hCaptcha-Token validieren; Bucket-File-Size-Limit + allowed_mime_types in Bucket-Config
- **Status (04.05.):** event-images Bucket Listing-Policy entfernt + Size/MIME-Limits gesetzt durch Yusuf via Dashboard. anon-INSERT-Policy bleibt fuer Partner-Forms, hCaptcha-Validierung weiter offen.

### S13. enrollment-certificates Bucket = JEDER Authenticated kann ALLE lesen — RESOLVED 04.05.
- **Migration:** `20260221030000_storage_enrollment_policies.sql:18`
- **Policy:** `Authenticated users can read enrollment certificates` mit USING (bucket_id='enrollment-certificates')
- **Auswirkung:** JEDER eingeloggte User konnte alle Immatrikulationsbescheinigungen runterladen (Klarname + Uni + Matrikelnr + Geburtsdatum) → DSGVO-GAU
- **Fix:** Migration `20260504000004_harden_enrollment_certificates.sql` deployed. Owner liest eigene Datei (beide Pfad-Muster), Admin liest alles, sonst niemand. UPDATE/DELETE-Policies ergaenzt.
- **Status:** GEFIXT, Migration applied 04.05. ohne Errors.

---

## SICHERHEIT — MID

### S6. profiles SELECT('*') leakt email/fcm_token/is_admin
- **Pfad:** `www/public-profile.html:524-527`
- **Auswirkung:** Eingeloggte User koennen via DevTools Email + FCM-Token + is_admin-Flag fremder Profile lesen
- **Fix:** Whitelist-SELECT (nur sichere Spalten) ODER View `public_profiles` mit safe-Spalten

### S7. event_interests Public-Read = Stalking-Vector
- **Migration:** `20260428000000_events_feature.sql:107`
- **Issue:** `USING (true)` — jeder anon kann (event_id, user_id) Liste lesen
- **Auswirkung:** Privacy-Leak — wer fuer welche Events Interesse zeigt
- **Fix:** `USING (auth.uid() IS NOT NULL)` mind., besser nur fuer eigene + Organizer

### S8. Admin-Auth nur clientseitig — RESOLVED 04.05.
- **Pfad (alt):** `www/admin.html:489,506`, `www/job-create.html:152`, `www/coupon-create.html:241`, `www/settings.html:323`
- **Issue:** `if (user.email !== ADMIN_EMAIL)` Redirect-Bypass via JS-Disable
- **Fix:** Alle 4 Frontend-Stellen + `get-signed-url` Edge Function (S11) auf `profiles.is_admin` umgestellt. `ADMIN_EMAIL`-Konstante restlos entfernt. DB-RLS war schon mit is_admin gehaertet.
- **Status:** GEFIXT, Web deployed auf room8.club. Edge Function get-signed-url redeployed.

### S9. fcm_token kann von fremden Usern auf null gesetzt werden — RESOLVED 04.05.
- **Pfad (alt):** `www/push-logic.js:179-183`
- **Issue:** Direct-UPDATE `update({fcm_token: null}).eq('fcm_token', token).neq('id', user.id)` exploitable bei bekanntem Token
- **Fix:** Migration `20260504000005_fcm_token_register_rpc.sql` haerten via `register_fcm_token(text)` SECURITY DEFINER RPC. push-logic.js auf `sb.rpc('register_fcm_token', ...)` umgestellt. Cross-User-Clear bleibt erhalten aber jetzt im auditable code-path.
- **Bonus:** `clear_own_fcm_token()` RPC fuer Logout-Flow ergaenzt.
- **Status:** GEFIXT, Migration applied + Web deployed.

### S10. submit_contact_message ohne Rate-Limit — RESOLVED 04.05.
- **Migration (alt):** `20260428000025_contact_submit_rpc.sql:10-44`
- **Issue:** Anon kann RPC unbegrenzt aufrufen → Resend-Quota-Kill
- **Fix:** Migration `20260504000006_contact_message_rate_limit.sql` mit 3 Stufen:
  - Max 3 Submissions pro Email pro Stunde
  - Max 30 pro Email pro Tag
  - Max 60 GLOBAL pro Stunde (Random-Mail-Bot-Schutz)
- **Status:** GEFIXT, live verifiziert (Versuch 4 mit gleicher Mail ergibt P0001 "Zu viele Anfragen"). hCaptcha-Layer offen falls Bots mit random Mails durchkommen.

### S11. get-signed-url checkt Email statt is_admin — RESOLVED 04.05.
- **Pfad (alt):** `supabase/functions/get-signed-url/index.ts:10,46`
- **Fix:** Email-Konstante geloescht, jetzt `select is_admin from profiles where id = user.id`. Service-Role-Client wiederverwendet.
- **Status:** GEFIXT, Edge Function redeployed.

### N1. Multi-Device fcm_tokens — RESOLVED 04.05.
- **Pfad (alt):** `profiles.fcm_token` single column → letztes Login-Device gewinnt, User mit iOS+Android bekommt Push nur auf einem
- **Fix:** Migration `20260504000007_multi_device_fcm_tokens.sql` mit:
  - `fcm_tokens(user_id, token UNIQUE, platform, device_id, last_seen_at)` Tabelle
  - Backfill aus existing `profiles.fcm_token`
  - `register_fcm_token(text, text)` 2-arg mit Platform-Detection
  - `clear_own_fcm_token(text)` token-spezifisch (Logout-Flow)
  - `get_user_fcm_tokens(uuid)` Service-Role-Helper für Edge Function
- `send-push` Edge Function fan-out an alle aktiven Tokens (≤60 Tage). Bei UNREGISTERED nur den einen Token loeschen, nicht alle des Users.
- `push-logic.js` mit Capacitor-Platform-Detection ('android'/'ios'/'web')
- **Status:** GEFIXT, Live verifiziert. Sobald Yusuf auf BEIDEN Devices die App neu öffnet, kommen Pushes auf beide gleichzeitig.

### N1-Trap. Supabase-CLI v2.90+ deploys Edge Functions MIT JWT-Verify by default
- Pipeline war kurz tot weil pg_net.http_post nur x-internal-secret schickt, kein Authorization Bearer
- **Future-Action:** IMMER `--no-verify-jwt` Flag bei `supabase functions deploy` für `send-push`, `send-email`, `get-signed-url`
- In CLAUDE.md verewigt unter Build-Befehlen

### B22. MIUI/Xiaomi Push-Sichtbarkeit — RESOLVED 04.05.
- **Pfad (alt):** `android/app/src/main/java/club/room8/app/Room8MessagingService.java`
- **Issue:** Channel `room8_default` mit `mLockscreenVisibility=-1000` + `IMPORTANCE_HIGH` → MIUI hat Banner unterdrueckt, auf Lockscreen unsichtbar
- **Fix:** Channel rotiert auf `room8_v2` mit `IMPORTANCE_MAX` + `setLockscreenVisibility(VISIBILITY_PUBLIC)` + `setCategory(CATEGORY_MESSAGE)`. Alter Channel via `deleteNotificationChannel("room8_default")` beim ersten Start geloescht.
- **VersionCode:** 36 → 37, VersionName: 2.1.0 → 2.1.1
- **Status:** GEFIXT, APK gebaut (`app-release.apk`, signed) + auf Yusufs Xiaomi installiert + Live-Push verifiziert (Banner + Badge sichtbar).

### S12. push_token in localStorage unverschluesselt — RESOLVED 04.05.
- **Pfad (alt):** `www/push-logic.js:197`
- **Issue:** XSS-auslesbar, mit S4 (vor Fix) Push-Spam-Targeting
- **Fix:** `localStorage.setItem('push_token', token)` entfernt. Token nur noch in DB (via register_fcm_token RPC). `push_enabled` Boolean-Flag bleibt (kein Token).
- **Status:** GEFIXT, Web deployed.

---

## BUGS — KRITISCH (Funktionalitaet kaputt)

### B1. upload.html: Verifikations-Pipeline tot durch Tippfehler
- **Pfad:** `www/upload.html:134`
- **Issue:** `supabase.from('profiles').update(...)` — `supabase` ist die UMD-Lib, nicht der Client. Sollte `sb.from(...)` sein.
- **Auswirkung:** User laedt Imma-Bescheinigung hoch → Verifizierungs-URL wird NIE in profiles geschrieben → Account bleibt ewig unverifiziert
- **Fix:** `sb` statt `supabase`

### B2. job-create.html Auth-Check ohne return = effektiv kein Block
- **Pfad:** `www/job-create.html:160`
- **Issue:** `if (!user || user.email !== ADMIN_EMAIL) { navigateTo('dashboard.html'); }` — fehlendes `return`. Submit-Handler laeuft weiter
- **Auswirkung:** Auth-Bypass — Schutz haengt nur an RLS. Wenn RLS schwach: jeder User legt Jobs an
- **Fix:** `return null;` nach navigateTo

### B3. coupons.html — XSS in mehreren Feldern
- **Pfad:** `www/coupons.html:558-560,578,593`
- **Issue:** `opening_hours`, `website`, `instagram`, `discount_value`, `discount_code` ungescaped in innerHTML
- **Auswirkung:** Stored-XSS via Partner-Submission. Partner schreibt `<img src=x onerror=alert(...)>` → bei jedem User der Coupons oeffnet ausgefuehrt
- **Fix:** alle durch `escapeHtml(...)`. discount_code via data-attribute + Listener

### B4. jobs.html — XSS in title, company_name, city, salary
- **Pfad:** `www/jobs.html:577-580,557`
- **Issue:** Mehrere User-facing Felder ungescaped, escapeHtml ist im File aber wird nicht genutzt
- **Auswirkung:** Stored-XSS via Partner-Job-Submission
- **Fix:** alle Felder durch escapeHtml()

### B5. chat.html sendMessage = keine Race-Protection
- **Pfad:** `www/chat.html:829-914`
- **Issue:** Kein `isSending`-Flag. Bei schnellem Enter mehrfach: 2-3 Inserts
- **Auswirkung:** Doppelt/dreifach gesendete Nachrichten. tempMsg + Realtime-Echo = Duplikate in UI
- **Fix:** `if (isSending) return; isSending = true; try{...} finally{isSending=false}`

### B6. Partner-Dashboard "Laedt..." (GEFIXT 04.05.)
- room8-utils.js wurde nicht geladen → Room8.escapeHtml = undefined
- **Status:** GEFIXT, Release-APK 36 (v2.1.0) installiert, Yusuf bestaetigt

---

## BUGS — MID

### B7. chat.html Bild-XSS via Apostroph — RESOLVED 04.05.
- **Pfad:** `www/chat.html`
- **Fix:** `escapeHtml` ergaenzt um `"'`. `sanitizeImageUrl` nutzt jetzt `encodeURI` statt nur escapeHtml.

### B8. nachrichten.html — CSS-Injection via avatar_url — RESOLVED 04.05.
- **Pfad:** `www/nachrichten.html`
- **Fix:** `escapeHtml` ergaenzt um `"'`. Neue `sanitizeUrl()` Funktion blockt `javascript:`/`data:text`/`vbscript:` und encoded URL. `partnerId`/`listingId` in Link via `encodeURIComponent`.

### B9. profile.html onerror-Inhalt manipulierbar — RESOLVED 04.05.
- **Pfad:** `www/profile.html`
- **Fix:** `createListingCard` komplett auf `createElement` umgestellt. Verschachtelte onerror-Strings entfernt. URL-Sanitize per `safeImg()`. IDs via `encodeURIComponent`.

### B10. complete-profile.html username-Race
- **Pfad:** `www/complete-profile.html:160-161`
- **Issue:** lastAvailable kann durch parallelen Live-Check verfaelscht werden
- **Fix:** Im Submit atomar `select count` machen

### B11. admin.html — kaputte Row killt User-Liste
- **Pfad:** `www/admin.html:1179`
- **Issue:** `${u.id.substring(0,8)}...` ohne Null-Check
- **Fix:** `${(u.id||'').substring(0,8)}`

### B12. admin.html — mailto Attribute-Break
- **Pfad:** `www/admin.html:660,674,1182`
- **Issue:** `escapeHtml` laesst `"` durch
- **Fix:** escapeHtml um `"'` erweitern

---

## BUGS — LOW / Polish

### B13. partner-event.html fehlt sentry-init.js + room8-utils.js
- Verstoesst gegen CLAUDE.md "ALLERERSTE Zeile"-Regel
- **Fix:** beide Scripts einbinden

### B14. job-create.html — Filename ungescaped
- **Pfad:** `www/job-create.html:171-174` Self-XSS
- **Fix:** escapeHtml(file.name)

### B15. notification-settings push_enabled-Drift
- localStorage-Wert sync't nicht mit OS-Permission
- **Fix:** Beim Init `PushService.checkPermission()` parallel lesen

### B16. chat.html Channel-Leak
- `sb.channel('chat-live-...')` wird nie unsubscribed
- **Fix:** pagehide Listener + sb.removeChannel

### B17. listing-details.html / wohnung.html img.src in template-string
- **Fix:** appendChild + img.src statt Template

### B18. nachrichten.html err.message ungescaped
- **Fix:** escapeHtml

### B19. console.log mit FCM-Token-Prefix
- **Pfad:** `www/push-logic.js:57,262`
- **Fix:** Token-Logging entfernen

### B20. Anon-Key dupliziert in 6 Dateien
- Tippfehler-Variante existiert bereits (`MuLv9AdclVZZ` statt `MuLv9AdclVVZ`)
- **Fix:** Single Source of Truth in config.js

### B21. Vercel-Headers fehlen
- Keine CSP, X-Frame-Options, HSTS, Permissions-Policy
- **Fix:** vercel.json Headers-Block

---

## FEATURE-GAPS (siehe room8-coupon-system-roadmap.md)

### F1. Coupon-Einloese-System fehlt komplett
- Kein QR, kein Scanner, kein 1x-Limit, kein unlimited-Flag, keine `coupon_redemptions` Tabelle
- **Pilotkunden-Blocker:** Kunde 1 (1x), Kunde 2 (unlimited)
- **Aufwand:** ~4-6h

### F2. Partner-Coupon-Scanner-Page fehlt
- `/partner-scan.html` nicht vorhanden
- **Aufwand:** ~2h

### F3. Job-Bewerbungs-Inbox fehlt
- Bewerbungen laufen nur extern (Email/URL), kein internes Tracking
- **Aufwand:** ~3-4h

### F4. User koennen Submissions nicht editieren/zurueckziehen
- **Aufwand:** ~30min Withdraw, ~2h Edit

### F5. Login-UX: Google/Apple-User landen evtl. auf Email-Tab
- Kein Hinweis "Du hast dich mit Google angemeldet"
- **Aufwand:** ~1h

### F6. Push-Emojis Encoding ungetestet
- FCM mit UTF-8-Emojis Live-Test steht aus

### F7. DE/EN Sprach-Trennung ungetestet
- 2666 translations.js-Zeilen, Toggle nie systematisch durchgespielt

### F8. Email-Versand live-Verifikation steht aus
- Code reviewed, aber keine echte Mail in Inbox bestaetigt diese Session

---

## GEFIXT 03.05./04.05.2026

- [x] Hardware-Back schloss App (MainActivity.java onBackPressed)
- [x] Google Sign-In Android (Web Client ID + Supabase Audience)
- [x] admin.html photo_type fehlte
- [x] Mode-Switcher in profile.html
- [x] Profile-Back-Button immer sichtbar
- [x] Mobile-Nav kompakt
- [x] APK MIUI Install (Release-Build)
- [x] Partner-Dashboard Laedt-Bug (room8-utils.js)

## GEFIXT Phase 1 (04.05.2026)

- [x] **S1** Firebase-Key wertlos: zugehoeriges Projekt `room8-d1867` existiert nicht mehr (Yusuf hat nur 1 Projekt: `room8-18fc9`). Lokale Datei geloescht.
- [x] **S2** Keystore-Passwort aus build.gradle raus → ~/.gradle/gradle.properties (user-scoped)
- [x] **B1** upload.html `supabase.from` → `sb.from` (Verifizierungs-Pipeline live)
- [x] **B2** job-create.html fehlendes return + Submit-Guard
- [x] **B3** coupons.html: escapeHtml in opening_hours/website/instagram/discount_value, discount_code via data-attribute + addEventListener (kein onclick-String mehr), `'` jetzt auch escaped
- [x] **B4** jobs.html: room8-utils.js Import + esc()-Wrapper auf alle Felder, encodeURI auf Storage-URLs

## GEFIXT Phase 2 (04.05.2026) — DEPLOY-PFLICHTIG

- [x] **S3** send-email Open Relay → `verifyInternalSecret()` Helper, Header `x-internal-secret` Pflicht
- [x] **S4** send-push Spam-Vector → selber Schutz wie S3
- [x] **S6** public-profile.html `select(*)` → Whitelist (kein email/fcm_token/is_admin Leak mehr)
- [x] **S7** event_interests `USING (true)` → self-or-organizer-read; Public-Counter via `count_event_interests(event_id)` RPC

**Neue Files:**
- `supabase/functions/_shared/auth.ts` (Helper)
- `supabase/migrations/20260504000001_secure_edge_function_calls.sql` (notify_user_push + send_admin_alert mit Header)
- `supabase/migrations/20260504000002_harden_event_interests_rls.sql`

**Yusuf-Aufgabe vor Deploy (sonst gehen Push/Email NICHT mehr durch):**

1. Random-Secret generieren:
   ```
   openssl rand -hex 32
   ```
2. Supabase Dashboard → Project Settings → Edge Functions → Secrets:
   - `INTERNAL_FUNCTION_SECRET = <secret aus Schritt 1>`
3. Supabase Dashboard → Project Settings → Vault → "Add new secret":
   - Name: `internal_secret`
   - Value: <derselbe Secret wie in Schritt 1>
   - (ALTER DATABASE geht in Supabase Cloud nicht — Vault ist die offizielle Loesung)
4. Edge Functions deployen:
   ```
   supabase functions deploy send-email
   supabase functions deploy send-push
   ```
5. Migrations applien:
   ```
   npx supabase db push
   ```
6. Web deployen:
   ```
   cd www && npx vercel --prod --yes
   ```

**Yusuf-Aufgabe S5 (separat):**

Supabase Dashboard → Storage → Bucket `event-images` → "Bucket Settings":
- File-Size-Limit: **5 MB**
- Allowed MIME types: **image/jpeg, image/png, image/webp**

(Verhindert dass anon Uploads beliebige Files unter deiner Domain hosten.)

---

## Top-3-Empfehlung (was wirklich brennt)

1. **JETZT:** Firebase Service-Account rotieren (S1) + Keystore-Passwort raus (S2) — irreparabler Schaden moeglich
2. **DIESE WOCHE:** send-email + send-push absichern (S3, S4) — Open Relay = Account-Kill
3. **DIESE WOCHE:** XSS in coupons.html + jobs.html (B3, B4) + Verifikations-Pipeline-Bug (B1) — User-facing kaputt
