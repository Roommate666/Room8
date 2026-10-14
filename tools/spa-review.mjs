// Automatischer SPA-Durchlauf: Login + jede Route screenshotten, Console-Fehler + Mojibake pruefen.
// Nur LESEND - keine Aktionen die Daten aendern (kein Einloesen/Duell).
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://unigoat-spa.pages.dev';
const EMAIL = 'redbull-demo@unigoat.de';
const PASS = 'RedBull2026!';
const OUT = '/tmp/spa-review';
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = ['hub','coupons','rang','profil','friends','notifications','settings','avatar','verify','jobs','events'];
// 'jobs'/'events' bewusst mitgetestet: sollen jetzt auf Hub zurueckfallen (Alt-Muell entfernt)

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, locale:'de-DE' });
const page = await ctx.newPage();

const errors = [];
page.on('console', m => { if (m.type()==='error') errors.push({at:'?', text:m.text()}); });
page.on('pageerror', e => errors.push({at:'?', text:'PAGEERROR '+e.message}));

// Mojibake / kaputte Zeichen im sichtbaren Text
const MOJIBAKE = /Ã.|Â.|â€| Â|�/;

function scanText(t){
  const hits = [];
  if (MOJIBAKE.test(t)) hits.push('MOJIBAKE gefunden');
  // offensichtlich falsche ae/oe/ue in typischen deutschen UI-Woertern
  const bad = t.match(/\b(fuer|ueber|Naehe|einloesen|Loesung|zurueck|Gutschrift|naechst\w*|Praemie|verfuegbar|schliessen|Uebersicht|waehl\w*|Konto\w*|Praeferenz\w*|Bestaetig\w*|Loeschen|Aendern|erhaeltlich|Muenchen)\b/gi);
  if (bad) hits.push('falsche Umlaute: '+[...new Set(bad)].join(', '));
  return hits;
}

const report = [];

// --- Login ---
await page.goto(BASE+'/login.html', { waitUntil:'networkidle' });
await page.fill('#loginEmail', EMAIL);
await page.fill('#loginPassword', PASS);
await page.click('#loginBtn');
await page.waitForTimeout(4000);
report.push({ step:'login', url:page.url() });

// Erste Coupon-ID holen (fuer Detail-View), ueber die SPA-Route
let couponId = null;
try {
  await page.goto(BASE+'/#coupons', { waitUntil:'networkidle' });
  await page.waitForTimeout(2500);
  couponId = await page.evaluate(() => {
    const a = document.querySelector('a[href^="#coupon?id="]');
    return a ? a.getAttribute('href').split('id=')[1] : null;
  });
} catch(e){}
if (couponId) ROUTES.push('coupon?id='+couponId);

// --- Jede Route ---
for (const r of ROUTES){
  const before = errors.length;
  const safeName = r.replace(/[^a-z0-9]/gi,'_');
  try {
    await page.goto(BASE+'/#'+r, { waitUntil:'networkidle', timeout:20000 });
    await page.waitForTimeout(2200);
    const info = await page.evaluate(() => {
      const v = document.getElementById('view');
      const txt = (v?v.innerText:document.body.innerText)||'';
      return {
        text: txt,
        len: txt.trim().length,
        empty: /Ansicht nicht gefunden|schiefgelaufen|wird gerade auf die neue App umgebaut/.test(txt),
        title: (v && v.querySelector('.masthead')||{}).innerText || ''
      };
    });
    await page.screenshot({ path:`${OUT}/${safeName}.png`, fullPage:true });
    const newErrs = errors.slice(before).map(e=>e.text);
    report.push({ route:r, len:info.len, empty:info.empty, title:(info.title||'').slice(0,40),
      textScan:scanText(info.text), errors:newErrs });
  } catch(e){
    report.push({ route:r, fatal:e.message });
  }
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report,null,2));

// Kompakte Konsolen-Ausgabe
console.log('=== SPA REVIEW ===');
for (const e of report){
  if (e.step) { console.log(`LOGIN -> ${e.url}`); continue; }
  if (e.fatal){ console.log(`[FATAL] ${e.route}: ${e.fatal}`); continue; }
  const flags = [];
  if (e.empty) flags.push('LEER/STUB');
  if (e.len < 40) flags.push('WENIG-TEXT('+e.len+')');
  if (e.textScan.length) flags.push('TEXT:'+e.textScan.join('|'));
  const realErr = (e.errors||[]).filter(x=>!/mime|Content-Type|favicon|manifest|sentry\.io|Failed to load resource.*sentry/i.test(x));
  if (realErr.length) flags.push('JSERR:'+realErr.slice(0,3).join(' // '));
  console.log(`${e.route.padEnd(16)} ${flags.length?flags.join('  '):'ok'}`);
}
console.log('\nScreenshots:', OUT);
