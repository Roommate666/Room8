-- coupon_photos.photo_type um 'menu' erweitern (fuer Menue-/Angebots-Fotos).
-- Bisher nur logo/cover/gallery erlaubt -> Insert mit 'menu' scheiterte (23514).
alter table public.coupon_photos
    drop constraint if exists coupon_photos_photo_type_check;

alter table public.coupon_photos
    add constraint coupon_photos_photo_type_check
    check (photo_type is null or photo_type in
        ('logo','cover','gallery','hero','thumbnail','main','menu'));
