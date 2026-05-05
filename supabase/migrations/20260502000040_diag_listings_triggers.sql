-- Diagnose: alle Triggers auf listings auflisten
-- (wir koennen pg_trigger nicht via REST abfragen, also via View)

create or replace view public.diag_listings_triggers as
select tgname as trigger_name,
       tgenabled as enabled,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.listings'::regclass
  and not tgisinternal;

grant select on public.diag_listings_triggers to authenticated, service_role;
