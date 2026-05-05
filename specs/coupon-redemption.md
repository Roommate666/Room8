# Coupon-Einloese-System

## Ueberblick
Partner scannt QR (oder tippt Code) eines Users → RPC verifiziert + bucht Redemption.

## Tabellen

### coupons (relevant)
- `usage_limit_per_user int default null` — NULL=unlimited, 1=1x pro User, 2,3,... entsprechend
- `max_redemptions int` — Gesamt-Limit ueber alle User (optional)
- `current_redemptions int` — Counter (wird **nur** von `redeem_coupon` hochgezaehlt)
- `is_active boolean` — wenn false: dauerhaft inaktiv
- `valid_until date` — wenn < today: COUPON_EXPIRED
- `user_id uuid` — Coupon-Ersteller (Yumita-Admin oder Partner)
- `partner_user_id uuid` — zugewiesener Partner (kann scannen)

### coupon_redemptions
- `coupon_id, user_id` — wer hat eingeloest
- `verification_code text` — 8-stellig HEX, Partner zeigt es im UI als Bestaetigung
- `redeemed_by_partner_id uuid` — Partner der gescannt hat (nullable bei alten Eintraegen)
- `redeemed_at timestamptz`

## Auth-Flow

1. Partner ist mit Room8-Account eingeloggt
2. User oeffnet `coupon-detail.html` → "Einloesen"-Button → Modal mit QR
3. QR-Inhalt (klartext, kein Token noetig in Phase 1):
   ```
   room8:redeem:<coupon_id>:<user_id>
   ```
4. Partner-App scannt QR auf `partner-scan.html`
5. Partner-App ruft `redeem_coupon(coupon_id, user_id)` auf
6. RPC validiert (siehe unten), zaehlt hoch, gibt verification_code zurueck
7. Partner zeigt Code-Toast: "Erfolgreich eingeloest: ABCD1234"

## RPC redeem_coupon

**Signatur:**
```sql
redeem_coupon(p_coupon_id uuid, p_user_id uuid) returns jsonb
```

**Auth:** `auth.uid()` muss `coupons.user_id` ODER `coupons.partner_user_id` sein.

**Returns:**
- `{ ok: true, redemption_id, verification_code, coupon_title, business_name, discount_value }`
- `{ ok: false, error: 'COUPON_NOT_FOUND' | 'NOT_PARTNER' | 'COUPON_INACTIVE' | 'COUPON_EXPIRED' | 'COUPON_MAX_REACHED' | 'ALREADY_REDEEMED' | 'NOT_AUTHENTICATED' }`

**Race-Schutz:** `pg_advisory_xact_lock(hashtextextended(coupon_id||':'||user_id, 0))`. Innerhalb derselben Transaktion serialisiert.

**Trigger als zweiter Wall:** `trg_enforce_coupon_redemption_limit` blockt direkten INSERT bei limit-Verletzung mit `COUPON_LIMIT_REACHED`.

## RLS

- `coupon_redemptions` SELECT: User sieht eigene, Partner sieht alle Redemptions seiner Coupons
- INSERT: NUR via `redeem_coupon` (security definer) — keine Direct-Inserts
- UPDATE/DELETE: niemand (immutable audit)

## Frontend-Pflichten

### coupon-detail.html (User-Sicht)
- "Einloesen"-Button oeffnet QR-Modal
- QR-Payload: `room8:redeem:<coupon_id>:<user_id>` (Klartext)
- Code-Kopieren-Funktion bleibt erhalten (Fallback fuer Online-Codes), aber **darf NICHT** mehr `increment_coupon_redemptions` rufen → Counter waere falsch

### partner-scan.html (NEU, Partner-Sicht)
- html5-qrcode Library
- Scan → parse `room8:redeem:<uuid>:<uuid>` → `sb.rpc('redeem_coupon', { p_coupon_id, p_user_id })`
- Toast bei Erfolg/Fehler
- Manueller Fallback: User-ID + Coupon-ID Eingabefelder (Schweizer-Sackmesser)

### partner-dashboard.html
- Pro Coupon-Karte: "QR scannen"-Button → `partner-scan.html?coupon=<id>`
- Header-Counter: heute X eingeloest (View `v_partner_redemptions_today`)

## Realtime (LIVE seit 06.05.)
- `coupon_redemptions` ist in `supabase_realtime` publication (Mig 4)
- coupon-detail.html oeffnet beim QR-Modal-Open eine Realtime-Subscription auf `coupon_redemptions` mit Filter `user_id=eq.<own>`
- Beim INSERT-Event (Partner-Scan): Frontend switcht Modal-View von "QR + warte"-Card auf gruene Erfolgs-Card mit verification_code, coupon_title, timestamp
- Cleanup beim Modal-Close: `sb.removeChannel()`
- RLS schuetzt — User sieht nur eigene Redemptions per Realtime
- Vibration `[60,40,80]` als haptisches Feedback wenn unterstuetzt

## Camera-Permission (Android)
- AndroidManifest.xml: `android.permission.CAMERA` deklariert
- `uses-feature android.hardware.camera` mit `required="false"` (App startet auch ohne Kamera)
- Frontend triggert Permission via `getUserMedia({video:{facingMode:'environment'}})` als Probe vor html5-qrcode-Start
- Bei `NotAllowedError`/`PermissionDeniedError`: User bekommt Anleitung "Einstellungen → Apps → Room8 → Berechtigungen → Kamera"
- Scanner startet NICHT auto, sondern erst beim User-Tap auf "📷 Kamera starten"-Button (System-Dialog erfordert User-Gesture)

## Lib-Dateien (lokal)
- `www/lib/qrcode.min.js` — qrcodejs 1.0.0 (User-QR-Generation)
- `www/lib/html5-qrcode.min.js` — html5-qrcode 2.3.8 (Partner-Scanner)
- Beide in `sw.js` STATIC_ASSETS (Offline-Cache, v32)
- Capacitor WebView (file://) blockt fremde CDN-Skripte → Lib lokal Pflicht

## Security-Audit (06.05.)
- ANON kann `coupon_redemptions` nicht lesen (RLS verifiziert: leeres Array)
- ANON kann `coupons` nicht via PostgREST mutieren (RLS verifiziert: PATCH/DELETE silent gefiltert)
- `redeem_coupon` RPC bei `auth.uid()=null` → `NOT_AUTHENTICATED`
- Echter JWT-Test bestanden (T2-T6 mit redbull-Account)

## Phase-2 TODO (nicht jetzt)
- Signed Tokens (HMAC mit Vault-Secret + TTL 5min) im QR-Payload
- Edge Function `sign-coupon-token` zum Token-Erzeugen
- RPC erweitern um Token-Validierung
- → Erst wenn Pilotphase laeuft und Missbrauch beobachtet wird

## Migrations
- `20260505000003_coupon_redemption_system.sql` — Hauptmigration
- `20260505000004_realtime_coupon_redemptions.sql` — Realtime publication

## AI-LOCK
- `redeem_coupon` RPC: NICHT ohne User-OK aendern (Pilotkunden-Blocker, Race-Conditions)
- `enforce_coupon_redemption_limit` Trigger: NICHT entfernen (zweiter Wall)
- RLS-Policies auf `coupon_redemptions`: NICHT lockern
