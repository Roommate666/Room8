#!/usr/bin/env node
// Apple Sign In with Apple JWT Client Secret Generator
// Erzeugt einen JWT der als "Client Secret" in Supabase Apple OAuth Provider eingetragen wird.
// Apple verlangt JWT max 6 Monate gueltig (15777000 Sekunden).
//
// Aufruf: node tools/generate-apple-jwt.js
//
// AUSGABE: JWT-String fuer Supabase Dashboard -> Auth -> Providers -> Apple -> Secret Key
//
// PFLICHT-ENV (alle gesetzt unten direkt im Script da Werte stabil):
//   TEAM_ID, KEY_ID, SERVICE_ID, P8_PATH

const jwt = require('jsonwebtoken');
const fs = require('fs');

const TEAM_ID    = 'LZ4LV4JQ24';
const KEY_ID     = '5B4WYB92Z7';
const SERVICE_ID = 'club.room8.app.web';
const P8_PATH    = '/Users/yusufcash/Dev/keys/AuthKey_5B4WYB92Z7.p8';

const privateKey = fs.readFileSync(P8_PATH, 'utf8');

const now    = Math.floor(Date.now() / 1000);
const expiry = now + (180 * 24 * 60 * 60); // 180 Tage = ca. 6 Monate

const token = jwt.sign(
    {
        iss: TEAM_ID,
        iat: now,
        exp: expiry,
        aud: 'https://appleid.apple.com',
        sub: SERVICE_ID
    },
    privateKey,
    {
        algorithm: 'ES256',
        header: {
            alg: 'ES256',
            kid: KEY_ID
        }
    }
);

console.log('');
console.log('=== Apple Client Secret JWT ===');
console.log(token);
console.log('');
console.log('=== Metadaten ===');
console.log(`Team ID:    ${TEAM_ID}`);
console.log(`Key ID:     ${KEY_ID}`);
console.log(`Service ID: ${SERVICE_ID}`);
console.log(`Issued:     ${new Date(now * 1000).toISOString()}`);
console.log(`Expires:    ${new Date(expiry * 1000).toISOString()} (in 180 Tagen)`);
console.log('');
console.log('=== Naechste Schritte ===');
console.log('1. Supabase Dashboard -> Authentication -> Providers -> Apple');
console.log('2. Client IDs:  club.room8.app.web,club.room8.app');
console.log('   (Service ID fuer Web als ERSTE, Bundle ID fuer iOS als FALLBACK)');
console.log('3. Secret Key (for OAuth): den JWT oben einfuegen');
console.log('4. Save -> 1-2 Min warten -> Apple Login testen');
console.log('5. Reminder: Vor 06.11.2026 JWT erneuern (180-Tage-Limit)');
