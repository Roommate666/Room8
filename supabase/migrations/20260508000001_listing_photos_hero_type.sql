-- listing_photos.photo_type erweitern um 'hero' fuer Job-Hero-Banner
-- (Card+Detail in jobs.html / job-detail.html lesen photo_type='hero')

alter table public.listing_photos drop constraint if exists listing_photos_photo_type_check;

alter table public.listing_photos add constraint listing_photos_photo_type_check
  check (
    photo_type is null
    or photo_type in ('logo', 'hero', 'gallery', 'thumbnail', 'cover', 'main')
  );
