import { chromium } from 'playwright';
const dir = process.env.HOME + '/Desktop/UNIGOAT-STARTUPSUED';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto('file://' + dir + '/folien.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.pdf({ path: dir + '/UniGoat-Pitch-Folien.pdf', width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true });
console.log('Pitch-Folien.pdf gerendert');

await page.goto('file://' + dir + '/card.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.pdf({ path: dir + '/UniGoat-Teamcard-Matchcard.pdf', format: 'A4', printBackground: true });
console.log('Teamcard-Matchcard.pdf gerendert');

await browser.close();
