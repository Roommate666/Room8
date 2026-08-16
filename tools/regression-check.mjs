// Regressions-Check: loggt sich als Demo ein, besucht alle Kernseiten,
// prueft 0 JS-Fehler + dass Schluessel-Elemente da sind. Exit 1 bei Fehler.
// Nutzung: node tools/regression-check.mjs [BASE_URL]   (default: unigoat.pages.dev)
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://unigoat.pages.dev';
const EMAIL = 'redbull-demo@unigoat.de', PASS = 'RedBull2026!';

// Seite -> mind. ein Schluessel-Element das existieren MUSS (Beleg dass Seite lebt)
const CHECKS = [
  { url: '/coupons.html',        must: '#q',            name: 'Coupons' },
  { url: '/game/index.html',     must: '#btnHigh',      name: 'Game' },
  { url: '/challenge.html',      must: '#podium',       name: 'Rang/Challenge' },
  { url: '/profile.html',        must: '#tierA',        name: 'Profil' },
  { url: '/einstellungen.html',  must: '#tgGame',       name: 'Einstellungen' },
  { url: '/benachrichtigungen.html', must: '#feed',     name: 'Benachrichtigungen' },
  { url: '/verify-options.html', must: '#uniEmail',     name: 'Verifizierung' },
  { url: '/support.html',        must: 'body',          name: 'Support' },
];

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

let fails = [];
const jsErrors = [];
page.on('pageerror', e => jsErrors.push(String(e).slice(0, 120)));

// Login
try {
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.fill('#loginEmail', EMAIL);
  await page.fill('#loginPassword', PASS);
  await page.click('#loginBtn');
  await page.waitForTimeout(4000);
  if (page.url().includes('login')) fails.push('LOGIN: kein Redirect (Login evtl. kaputt)');
  else console.log('  ✓ Login OK ->', page.url().replace(BASE, ''));
} catch (e) { fails.push('LOGIN: ' + String(e).slice(0, 100)); }

// Seiten pruefen
for (const c of CHECKS) {
  jsErrors.length = 0;
  try {
    await page.goto(BASE + c.url, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1500);
    const el = await page.$(c.must);
    if (!el) fails.push(`${c.name}: Element ${c.must} FEHLT`);
    else if (jsErrors.length) fails.push(`${c.name}: JS-Fehler -> ${jsErrors[0]}`);
    else console.log(`  ✓ ${c.name}`);
  } catch (e) { fails.push(`${c.name}: ${String(e).slice(0, 100)}`); }
}

await browser.close();
console.log('');
if (fails.length) {
  console.log('❌ REGRESSION FEHLGESCHLAGEN (' + fails.length + '):');
  fails.forEach(f => console.log('   - ' + f));
  process.exit(1);
} else {
  console.log('✅ Alle Kernseiten OK auf ' + BASE);
  process.exit(0);
}
