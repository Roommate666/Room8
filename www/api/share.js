// Vercel Serverless Function: Server-Side OG-Vorschau fuer geteilte Inserate.
// WhatsApp/Instagram/Telegram-Crawler fuehren kein JS aus -> wir rendern die
// Vorschau-Karte (Titel, Bild, Preis) hier server-seitig + leiten echte Browser
// per meta-refresh zur App-Detailseite weiter.
//
// Aufruf: /api/share?id=<listing-id>  (huebsch via Rewrite: /s/<id>)

const SUPABASE_URL = 'https://tvnvmogaqmduzcycmvby.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bnZtb2dhcW1kdXpjeWNtdmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTA4MTksImV4cCI6MjA3MDUyNjgxOX0.MuLv9AdclVVZYZpUFv6Bc2Jn1Z9cmmcarHwBHlHkvZw';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const TYPE_LABEL = {
  wg_room: 'WG-Zimmer', entire_apartment: 'Wohnung', studio: 'Studio',
  house: 'Haus', shared_room: 'Geteiltes Zimmer',
};

module.exports = async (req, res) => {
  const id = (req.query && req.query.id) || '';
  const appUrl = 'https://www.room8.club/detail.html' + (id ? '?id=' + encodeURIComponent(id) : '');

  let title = 'Room8 - Studenten-Wohnungen & Marktplatz';
  let desc = 'Finde dein WG-Zimmer, deine Wohnung oder verkaufe Sachen - alles fuer Studenten.';
  let image = 'https://www.room8.club/icons/og-default.jpg';

  try {
    if (id) {
      const url = SUPABASE_URL + '/rest/v1/listings?id=eq.' + encodeURIComponent(id) +
        '&is_active=eq.true&select=title,description,city,monthly_rent,price,type,room_type,listing_photos(storage_path)';
      const r = await fetch(url, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
      const rows = await r.json();
      const l = Array.isArray(rows) && rows[0];
      if (l) {
        const typ = TYPE_LABEL[l.room_type] || (l.type === 'wohnung' ? 'Wohnung' : 'Angebot');
        const price = l.monthly_rent ? (l.monthly_rent + ' EUR/Monat') : (l.price ? (l.price + ' EUR') : '');
        title = (l.title || typ) + (l.city ? ' - ' + l.city : '');
        desc = [typ, l.city, price].filter(Boolean).join(' - ');
        if (l.description) desc = String(l.description).slice(0, 160);
        const ph = l.listing_photos && l.listing_photos[0] && l.listing_photos[0].storage_path;
        if (ph) image = SUPABASE_URL + '/storage/v1/object/public/listing-images/' + ph;
      }
    }
  } catch (e) { /* Fallback-Werte bleiben */ }

  const html = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(title) + '</title>' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(image) + '">' +
    '<meta property="og:url" content="' + esc(appUrl) + '">' +
    '<meta property="og:site_name" content="Room8">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '">' +
    '<meta name="twitter:image" content="' + esc(image) + '">' +
    '<meta http-equiv="refresh" content="0; url=' + esc(appUrl) + '">' +
    '<link rel="canonical" href="' + esc(appUrl) + '">' +
    '</head><body style="font-family:system-ui;text-align:center;padding:3rem;">' +
    '<p>Weiterleitung zu Room8 ...</p>' +
    '<p><a href="' + esc(appUrl) + '">Hier klicken, falls es nicht automatisch geht</a></p>' +
    '</body></html>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(html);
};
