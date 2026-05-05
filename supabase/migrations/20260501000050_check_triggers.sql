-- Diagnose: gibt's noch einen Trigger fuer Listings/Events City-Push?
-- Wenn nicht, neu attachen.

-- Re-attach Trigger fuer notify_new_listing_city falls weg
drop trigger if exists trg_notify_new_listing_city on public.listings;
create trigger trg_notify_new_listing_city
    after insert on public.listings
    for each row execute function public.notify_new_listing_city();

-- Event-City-Push Trigger
drop trigger if exists trg_notify_new_event_city on public.events;
create trigger trg_notify_new_event_city
    after insert on public.events
    for each row execute function public.notify_new_event_city();

-- Coupon City-Push Trigger
do $$
begin
    if exists (select 1 from information_schema.routines where routine_schema='public' and routine_name='notify_new_coupon_city') then
        execute 'drop trigger if exists trg_notify_new_coupon_city on public.coupons';
        execute 'create trigger trg_notify_new_coupon_city after insert on public.coupons for each row execute function public.notify_new_coupon_city()';
    end if;
end $$;
