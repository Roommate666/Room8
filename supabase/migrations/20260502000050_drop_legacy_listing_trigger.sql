-- Final cleanup: alter Trigger 'trigger_notify_new_listing_city' wurde im
-- vorherigen dedupe NICHT gedroppt (Name-Variante uebersehen).
-- Resultat: 2 Trigger feuern auf jeden listing INSERT -> doppelte Push.

drop trigger if exists trigger_notify_new_listing_city on public.listings;
drop trigger if exists trigger_notify_new_event_city on public.events;
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='coupons') then
        execute 'drop trigger if exists trigger_notify_new_coupon_city on public.coupons';
    end if;
end $$;

-- Verifizierung: nach diesem Migration sollte pro Tabelle nur noch
-- EIN City-Push-Trigger existieren (trg_notify_*).
