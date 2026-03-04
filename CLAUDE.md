# Room8 App - Studenten-Plattform

## Sprache & Arbeitsweise
- Auf Deutsch antworten, Code-Kommentare Deutsch (ae/oe/ue statt Umlaute)
- Kein Framework - reines HTML/CSS/JS mit Capacitor
- Dateien in Root UND www/ muessen synchron gehalten werden
- Nach Aenderungen: `cd www && npx vercel --prod --yes` fuer Web-Deploy
- Yusuf arbeitet auf Windows UND Mac parallel (USB-Stick Sync)

## Tech-Stack
- Capacitor 7.x (Android + iOS + Web)
- Supabase Backend (tvnvmogaqmduzcycmvby.supabase.co)
- Firebase Cloud Messaging (FCM v1, Projekt room8-d1867)
- Vercel (www.room8.club)
- Bilingual DE/EN (translations.js + Room8i18n.t())

## App-Info
- Package: club.room8.app
- Android: v1.6.1 (versionCode 34)
- Signing Key: C:\Dev\keys\room8-release.jks

## Wichtige Dateien
- config.js - Supabase URL + Keys + Navigation Config
- translations.js - Alle DE/EN Uebersetzungen (2666 Zeilen)
- navigation.js - Bottom Tab Bar
- push-logic.js - Push Notification Service (FCM Token)
- room8-ui.js + room8-utils.js - Shared UI + Utilities
- supabaseClient.js - Supabase Client Init

## Android
- android/app/src/main/java/club/room8/app/MainActivity.java - Push URL Handler
- android/app/src/main/java/club/room8/app/Room8MessagingService.java - FCM Service
- android/app/src/main/java/club/room8/app/BadgePlugin.java - App Badge

## Supabase Edge Functions
- send-push/ - FCM Push Notifications senden
- send-notification/ - In-App Notifications
- get-signed-url/ - Storage URLs generieren

## Build-Befehle
```bash
# Web deploy
cd www && npx vercel --prod --yes

# Android Debug
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
cd android && ./gradlew assembleDebug

# Android Release
cd android && ./gradlew bundleRelease

# APK installieren
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Supabase Migration
npx supabase db push
```

## Features (Seiten)
- Wohnungen (wohnungen.html, wohnung.html, upload.html)
- Marktplatz (gegenstaende.html, gegenstand.html)
- Jobs (jobs.html, job-create.html, job-detail.html)
- Coupons (coupons.html, coupon-create.html, coupon-detail.html)
- Chat (nachrichten.html, chat.html) - getrennt pro Inserat via listing_id
- Profil, Verifizierung, Admin, Partner-Bereich
- Push Notifications (FCM v1 API)

## Bekannte Eigenheiten
- Push-Token: PushService.saveTokenToSupabase() im registration Handler
- Email-Duplikat: user.identities leer = bereits registriert
- Chat-Trennung: loadMessages/subscribeToMessages filtern nach listing_id
- Android Background Push: Firebase 'url' Key als Fallback
- iOS fcmToken: Custom Event nur 1x beim App-Start
- RLS: anon key kann profiles nicht abfragen
