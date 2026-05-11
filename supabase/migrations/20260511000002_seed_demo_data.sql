-- Demo-Daten fuer Uni-Praesentation (17.-21.05.2026)
-- Trigger werden temporaer disabled damit kein Push-Spam an Augsburg-User
-- (Oguzhan, Rosalie, Ogi, etc.) waehrend des Bulk-Inserts.

begin;

-- ============================================
-- Trigger disablen (KEIN Push-Spam waehrend Seed)
-- ============================================
alter table public.listings disable trigger trg_notify_new_listing_city;
alter table public.events   disable trigger trg_notify_new_event_city;
alter table public.coupons  disable trigger trg_notify_new_coupon_city;

-- ============================================
-- Owner-Konstanten (existing users)
-- ============================================
do $$
declare
    icloud   uuid := '6f7e17b9-3ca8-42f1-90fd-326173fe3de0';  -- Redbull (Yusuf iPhone, is_admin)
    paypal   uuid := '900b8392-8334-4fcb-969e-fc2c289996a5';  -- Test (Yusuf Android)
    lisa     uuid := 'a3771fad-9fa0-48f1-bd8a-dc19f150ca75';  -- Lisa Mueller (Demo-Studentin)
    cafe     uuid := '387c7cca-03de-4caf-bf32-d4ed57579498';  -- Cafe Anna (Demo-Partner)
    valid14  timestamptz := now() + interval '14 days';
    valid30  timestamptz := now() + interval '30 days';
begin

-- ============================================
-- WOHNUNGEN (5)
-- ============================================
insert into public.listings (owner_id, type, listing_mode, title, description, city, district, monthly_rent, room_type, available_from, furnished, is_active, is_test) values
(icloud, 'wohnung', 'offer', 'Sonnige WG in Lechviertel', 'Helles Zimmer in 3er-WG, 5 Min zur Uni-Stadtteil-Tram. Voll moebliert, Wohnkueche mit Balkon, ruhige Mitbewohner (alle Studis).', 'Augsburg', 'Lechviertel', 420, 'wg_room', now() + interval '14 days', true, true, false),
(paypal, 'wohnung', 'offer', '2-Zi Apartment mit Balkon Pfersee', 'Frisch sanierte 50qm, eigener Balkon Suedseite, 10 Min Innenstadt mit Tram. Tiefgarage gegen Aufpreis.', 'Augsburg', 'Pfersee', 720, 'apartment', now() + interval '30 days', true, true, false),
(lisa, 'wohnung', 'offer', '1-Zi Studio Hochzoll-Sued', 'Modernes Studio fuer Studis, Pantrykueche, eigenes Bad. Ruhige Wohngegend, Aldi um die Ecke.', 'Augsburg', 'Hochzoll', 480, 'studio', now() + interval '7 days', true, true, false),
(lisa, 'wohnung', 'offer', 'WG-Zimmer Innenstadt — direkt am Rathausplatz', '4er-WG mit grossem Wohnzimmer, Maxstrasse 200m, alle Studis. Zimmer 16qm, gemeinsame Kueche und Bad.', 'Augsburg', 'Innenstadt', 480, 'wg_room', now() + interval '21 days', true, true, false),
(icloud, 'wohnung', 'offer', '3-Zi Maisonette Goeggingen', '85qm Maisonette ueber 2 Etagen, Galerie, eigener Eingang. Ideal fuer Paerchen oder kleine WG. Stellplatz.', 'Augsburg', 'Goeggingen', 1050, 'apartment', now() + interval '45 days', false, true, false);

-- ============================================
-- MARKTPLATZ (4)
-- ============================================
insert into public.listings (owner_id, type, listing_mode, title, description, city, price, is_active, is_test) values
(paypal, 'gegenstand', 'offer', 'IKEA Schreibtisch Bekant + Stuhl Markus', 'Kombi-Angebot: Schreibtisch 160x80 weiss, Markus-Stuhl schwarz. Top Zustand. Selbstabholung Pfersee.', 'Augsburg', 180, true, false),
(icloud, 'gegenstand', 'offer', 'MacBook Air M1 256GB Space Grey', 'Bj. 2022, 8GB RAM, Akku 91% Kapazitaet. Mit Originalverpackung und Rechnung. Nichtraucherhaushalt.', 'Augsburg', 720, true, false),
(lisa, 'gegenstand', 'offer', 'Vintage Couch dunkelgruen — 3-Sitzer', 'Wunderschoene Samt-Couch, gepflegt, kaum sichtbare Gebrauchsspuren. Massive Holzfuesse. Foto auf Anfrage.', 'Augsburg', 250, true, false),
(paypal, 'gegenstand', 'offer', 'E-Bike Cube Touring — wenig gefahren', 'Bj. 2024, 2 Akkus inkl., neue Reifen, Schwalbe-Schloss dabei. Wartungsheft komplett.', 'Augsburg', 1490, true, false);

-- ============================================
-- JOBS (3)
-- ============================================
insert into public.listings (owner_id, type, listing_mode, title, description, city, is_active, is_test) values
(icloud, 'job', 'offer', 'Werkstudent UI/UX Design (m/w/d) — Hybrid', '15-20h/Woche, 18 EUR/h, Remote 2 Tage moeglich. Figma + Webdesign. Start ab sofort.', 'Augsburg', true, false),
(paypal, 'job', 'offer', 'Aushilfe Service — Cafe Hochzoll', '10h/Woche, Wochenenden, 14 EUR/h + Trinkgeld. Erfahrung nicht noetig, Einarbeitung vor Ort.', 'Augsburg', true, false),
(lisa, 'job', 'offer', 'Promoter (m/w/d) Open-Air Festival Augsburg', '3 Tage Wochenende Juli, 200 EUR/Tag + Festival-Ticket inkl. Bewerbung mit kurzer Vorstellung.', 'Augsburg', true, false);

-- ============================================
-- EVENTS (3)
-- ============================================
insert into public.events (organizer_id, title, description, city, location, start_at, status, is_test) values
(icloud, 'Erstsemester-Party Murphy''s', 'Lockerer Studi-Abend mit DJ. Eintritt 5 EUR, mit Studi-Ausweis 3 EUR. Happy Hour bis 22 Uhr.', 'Augsburg', 'Murphy''s Law Augsburg, Maxstrasse 12', now() + interval '6 days', 'active', false),
(icloud, 'Pub Quiz Tuerkenkopf', 'Quiznight in 4er-Teams. Gewinn: eine Runde Bier fuer alle. Anmeldung am Tresen ab 19 Uhr.', 'Augsburg', 'Cafe Tuerkenkopf, Ulrichsplatz', now() + interval '4 days', 'active', false),
(lisa, 'Karaoke-Night Sing Sing', 'Studi-Karaoke, jede Stimme willkommen. 1+1 Drinks fuer Studis ab 21 Uhr. Eintritt frei.', 'Augsburg', 'Sing Sing Bar, Bahnhofstr.', now() + interval '8 days', 'active', false);

-- ============================================
-- COUPONS (4) — von Cafe Anna + iCloud als Partner
-- ============================================
insert into public.coupons (user_id, partner_user_id, title, description, city, business_name, discount_code, discount_value, category, valid_until, usage_limit_per_user, is_active, status, is_test) values
(cafe,   cafe,   'Free Coffee bei Cafe Anna', '1x Filterkaffee gratis zu jedem Fruehstueck (Mo-Fr). Studi-Ausweis zeigen.', 'Augsburg', 'Cafe Anna Augsburg', 'STUDI-COFFEE', 100, 'food', valid30, 4, true, 'active', false),
(icloud, icloud, '20% bei Stueckgut Augsburg', 'Auf das gesamte Fruehstuecksmenue Mo-Fr. Mit Studi-Ausweis. Nicht kombinierbar.', 'Augsburg', 'Stueckgut Cafe', 'STUDI20', 20, 'food', valid14, 1, true, 'active', false),
(icloud, icloud, '2-fuer-1 Burger bei Hans im Glueck', 'Mo-Do ab 18 Uhr, fuer Studis. Bei Vorlage des Studi-Ausweises.', 'Augsburg', 'Hans im Glueck Augsburg', 'BUDDYBURGER', 50, 'food', valid30, 2, true, 'active', false),
(cafe,   cafe,   '15% New Yorker City Galerie', 'Auf das gesamte Sortiment, donnerstags. Studi-Ausweis zeigen.', 'Augsburg', 'New Yorker City Galerie', 'STUDI15', 15, 'fashion', valid30, 3, true, 'active', false);

end $$;

-- ============================================
-- Trigger wieder enablen
-- ============================================
alter table public.listings enable trigger trg_notify_new_listing_city;
alter table public.events   enable trigger trg_notify_new_event_city;
alter table public.coupons  enable trigger trg_notify_new_coupon_city;

commit;
