-- Phase 4 Bug-Fix: photo_type Spalte fehlt auf coupon_photos + listing_photos
-- damit wir Logo vs Cover unterscheiden koennen.

alter table public.coupon_photos
    add column if not exists photo_type text;

alter table public.coupon_photos
    drop constraint if exists coupon_photos_photo_type_check;
alter table public.coupon_photos
    add constraint coupon_photos_photo_type_check
    check (photo_type is null or photo_type in ('logo', 'cover', 'gallery'));

alter table public.listing_photos
    add column if not exists photo_type text;

alter table public.listing_photos
    drop constraint if exists listing_photos_photo_type_check;
alter table public.listing_photos
    add constraint listing_photos_photo_type_check
    check (photo_type is null or photo_type in ('logo', 'cover', 'gallery'));
