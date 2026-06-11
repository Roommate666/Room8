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

// Konfiguration je Inhaltstyp: Tabelle, Detailseite, Bild-Bucket.
const TYPES = {
  listing: { table: 'listings', page: 'detail.html', bucket: 'listing-images' },
  coupon:  { table: 'coupons',  page: 'coupon-detail.html', bucket: null },
  event:   { table: 'events',   page: 'event-detail.html',  bucket: 'event-images' },
};

module.exports = async (req, res) => {
  const id = (req.query && req.query.id) || '';
  const t = (req.query && req.query.t) || 'listing';
  const cfg = TYPES[t] || TYPES.listing;
  const appUrl = 'https://www.room8.club/' + cfg.page + (id ? '?id=' + encodeURIComponent(id) : '');

  let title = 'Room8 - Studenten-Wohnungen & Marktplatz';
  let desc = 'Finde dein WG-Zimmer, deine Wohnung oder verkaufe Sachen - alles für Studenten.';
  let image = 'https://www.room8.club/icons/og-default.jpg';

  try {
    if (id) {
      let select = 'title,description,city';
      if (t === 'listing') select += ',monthly_rent,price,type,room_type,listing_photos(storage_path)';
      else if (t === 'coupon') select += ',business_name,discount_value';
      else if (t === 'event') select += ',cover_image_path,start_at,price,organizer_name';
      const url = SUPABASE_URL + '/rest/v1/' + cfg.table + '?id=eq.' + encodeURIComponent(id) + '&select=' + select;
      const r = await fetch(url, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
      const rows = await r.json();
      const l = Array.isArray(rows) && rows[0];
      if (l) {
        if (t === 'listing' && l.type === 'wohnung') {
          // Wohnungen NIE oeffentlich preview-bar (Untervermietungs-Schutz fuer Studenten).
          // Generische Karte + Redirect in die App (Login), keine Wohnungs-Details/Fotos.
          title = 'Room8 - Studenten-Wohnungen';
          desc = 'WG-Zimmer und Wohnungen für Studenten. Sichtbar nur für eingeloggte, verifizierte Studenten in der App.';
        } else if (t === 'listing') {
          const typ = TYPE_LABEL[l.room_type] || 'Angebot';
          const price = l.monthly_rent ? (l.monthly_rent + ' EUR/Monat') : (l.price ? (l.price + ' EUR') : '');
          title = (l.title || typ) + (l.city ? ' - ' + l.city : '');
          desc = l.description ? String(l.description).slice(0, 160) : [typ, l.city, price].filter(Boolean).join(' - ');
          const ph = l.listing_photos && l.listing_photos[0] && l.listing_photos[0].storage_path;
          if (ph) image = SUPABASE_URL + '/storage/v1/object/public/listing-images/' + ph;
        } else if (t === 'coupon') {
          title = (l.title || 'Deal') + (l.business_name ? ' - ' + l.business_name : '');
          desc = l.description ? String(l.description).slice(0, 160) : ([l.discount_value, l.city].filter(Boolean).join(' - '));
        } else if (t === 'event') {
          title = (l.title || 'Event') + (l.city ? ' - ' + l.city : '');
          desc = l.description ? String(l.description).slice(0, 160) : ([l.organizer_name, l.city].filter(Boolean).join(' - '));
          if (l.cover_image_path) image = SUPABASE_URL + '/storage/v1/object/public/event-images/' + l.cover_image_path;
        }
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
