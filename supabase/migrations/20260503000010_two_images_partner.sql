-- Phase 4: Logo + Cover-Bild fuer alle Partner-Submissions.
-- partner_submissions hat schon cover_image_path. Wir adden logo_image_path.
-- Events bekommt auch logo_image_path (cover_image_path existiert schon).
-- Listings (Jobs) hat schon company_logo_url. Cover landet in listing_photos.

alter table public.partner_submissions
    add column if not exists logo_image_path text;

alter table public.events
    add column if not exists logo_image_path text;
