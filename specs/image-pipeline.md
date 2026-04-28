# Image-Pipeline (Compression + Transform + Cache)

**Stand:** 2026-04-28
**Status:** PRODUCTION-LIVE

## Was es tut

3-Stage Image-Pipeline für Performance:
1. **Beim Upload:** Browser-side Compression (1600px max, JPEG q82) — iPhone 5 MB → ~500 KB
2. **Beim Anzeigen:** Supabase Image Transformation (server-side resize zu z.B. 280x210, WebP, q70)
3. **Bei Re-Visit:** Service Worker cacht Storage-URLs (instant aus Disk-Cache)

## Files in scope

| File | Zweck |
|---|---|
| `www/room8-utils.js` | `getOptimizedImageUrl`, `compressImage`, Convenience-Helper |
| `www/sw.js` | Service Worker mit Stale-While-Revalidate für Storage-Bilder |
| `www/gegenstaende.html`, `wohnungen.html`, `coupons.html`, `listing-details.html`, `events.html`, `event-detail.html` | Konsumenten der Helper |
| `www/wohnung.html`, `gegenstand.html`, `coupon-create.html`, `job-create.html`, `event-create.html` | Upload-Pages mit compressImage |

## Pflicht-Patterns

### 1. Supabase Image Transformation MUSS aktiv sein

Storage > Settings > "Enable image transformation" Toggle = ON.
Sonst greift der Fallback in `getOptimizedImageUrl` (gibt Original-URL zurück) → keine Speed-Verbesserung.

### 2. `getOptimizedImageUrl(bucket, path, opts)`

```js
Room8.getOptimizedImageUrl('listing-images', path, {
    width: 240,
    height: 240,
    quality: 70,
    resize: 'cover'
})
```

Empfohlene Größen:
- Marktplatz-Card (110px display): 240×240
- Wohnungen-Card (120px display): 280×210
- Detail-Slider: 900px width
- Detail-Fullscreen: 1600px width
- Event-Cover (16:9): 600×340 in Liste, 1200 in Detail
- Avatar: 120×120

### 3. `<img>` Pflicht-Attribute

```html
<img src="..." alt="..." width="X" height="Y" loading="lazy" decoding="async">
```

- `width`/`height` verhindert Layout-Shift (CLS)
- `loading="lazy"` lädt erst bei Scroll
- `decoding="async"` verhindert Main-Thread-Block
- Erstes Bild im Detail-Slider: `loading="eager"` (LCP-relevant)

### 4. Browser-side Compression beim Upload

```js
const fileToUpload = (window.Room8 && Room8.compressImage)
    ? await Room8.compressImage(file, { maxDim: 1600, quality: 0.82 })
    : file;
await sb.storage.from('listing-images').upload(path, fileToUpload);
```

Storage-Pfad immer `.jpg` (auch wenn original .png/.heic), weil compressImage zu JPEG konvertiert. Whitelist im Upload-Handler: `jpg/jpeg/png/webp/gif`. **NIEMALS SVG erlauben** — XSS-Risiko (SVG kann `<script>` enthalten).

### 5. Service Worker Cache-Strategie

`sw.js` hat 2 Caches:
- `room8-static-v26` für lokale Assets (CSS, JS, HTML)
- `room8-images-v1` für Supabase Storage Bilder (stale-while-revalidate)

**Regel:** API-Calls (REST, RPC, Auth, Realtime) werden NIE gecacht. Nur Pfade mit `/storage/v1/render/image/` oder `/storage/v1/object/public/` landen im Image-Cache.

## Tests die NIEMALS brechen dürfen

```bash
# Test 1: getOptimizedImageUrl liefert Transform-URL
curl -s "https://tvnvmogaqmduzcycmvby.supabase.co/storage/v1/render/image/public/listing-images/test.jpg?width=240" -I | head -3

# Test 2: Service Worker registriert sich auf room8.club
# Browser DevTools → Application → Service Workers → "activated and is running"

# Test 3: Repeat-Visit lädt Bilder aus Cache
# Browser DevTools → Network → Reload mit DevTools offen
# Storage-Image-Requests sollten "(disk cache)" oder "from ServiceWorker" zeigen
```

## Was nicht angefasst werden darf

| Element | Warum |
|---|---|
| Image-Transform-Toggle in Supabase | Pipeline tot ohne |
| SVG-Block im Upload-Handler | XSS-Schutz |
| `decoding="async" loading="lazy"` | Performance-CLS |
| Service Worker `IMAGE_CACHE` Logik | Repeat-Visit-Speed |
| `compressImage` SVG-Skip + 200KB-Threshold | Schon-klein-genug-Optimierung |
