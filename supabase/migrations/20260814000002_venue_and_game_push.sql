-- ============================================================
-- Coupon venue_type (Restaurant/Laden/Supermarkt/Freizeit)
-- + Spiel-Push-Toggle (game_push) fuer die Einstellungen-Seite
-- ============================================================

-- Kategorie-Typ pro Coupon (steuert das Kategorie-Badge auf der Detailseite)
alter table public.coupons
    add column if not exists venue_type text;

-- Spiel-Benachrichtigungen an/aus (Einstellungen -> Spiel)
alter table public.notification_settings
    add column if not exists game_push boolean default true;

-- venue_type der 5 Live-Coupons setzen
update public.coupons set venue_type='restaurant' where id='300e13da-a854-4da6-b7f6-9e133078b43f'; -- Damaskus Mond
update public.coupons set venue_type='freizeit'   where id='28d3fda3-d4bf-493f-b819-3fd8f8bbfa6f'; -- Face Off Arena
update public.coupons set venue_type='laden'      where id='d399fab9-78bc-4da8-bd78-c250f2048649'; -- Fleischgut Celik
update public.coupons set venue_type='restaurant' where id='92786a95-c495-47cf-be26-bfb285c10261'; -- Super Smash
update public.coupons set venue_type='supermarkt' where id='0f99d2cc-13a7-487d-88dc-01ac6ec8293d'; -- Delfo
