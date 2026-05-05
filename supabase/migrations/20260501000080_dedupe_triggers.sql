-- Es gibt mehrere city-push Trigger auf listings/events/coupons (von verschiedenen
-- Migrationen). Resultat: jedes Insert feuert 2-3x Push. Cleanup: alle bekannten
-- Trigger droppen, dann EXAKT EINEN pro Tabelle re-attachen.

-- LISTINGS: alle Varianten droppen
drop trigger if exists trg_notify_new_listing_city on public.listings;
drop trigger if exists notify_new_listing_city_trigger on public.listings;
drop trigger if exists notify_new_listing_city on public.listings;
drop trigger if exists trigger_notify_new_listing on public.listings;

create trigger trg_notify_new_listing_city
    after insert on public.listings
    for each row execute function public.notify_new_listing_city();

-- EVENTS
drop trigger if exists trg_notify_new_event_city on public.events;
drop trigger if exists notify_new_event_city_trigger on public.events;
drop trigger if exists notify_new_event_city on public.events;

create trigger trg_notify_new_event_city
    after insert on public.events
    for each row execute function public.notify_new_event_city();

-- COUPONS
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='coupons') then
        execute 'drop trigger if exists trg_notify_new_coupon_city on public.coupons';
        execute 'drop trigger if exists notify_new_coupon_city_trigger on public.coupons';
        execute 'drop trigger if exists notify_new_coupon_city on public.coupons';

        if exists (select 1 from information_schema.routines where routine_schema='public' and routine_name='notify_new_coupon_city') then
            execute 'create trigger trg_notify_new_coupon_city after insert on public.coupons for each row execute function public.notify_new_coupon_city()';
        end if;
    end if;
end $$;

-- JOBS (falls separate Tabelle)
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='jobs') then
        execute 'drop trigger if exists trg_notify_new_job_city on public.jobs';
        execute 'drop trigger if exists notify_new_job_city_trigger on public.jobs';
        execute 'drop trigger if exists notify_new_job_city on public.jobs';

        if exists (select 1 from information_schema.routines where routine_schema='public' and routine_name='notify_new_job_city') then
            execute 'create trigger trg_notify_new_job_city after insert on public.jobs for each row execute function public.notify_new_job_city()';
        end if;
    end if;
end $$;
