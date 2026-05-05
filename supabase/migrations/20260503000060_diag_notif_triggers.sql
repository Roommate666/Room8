create or replace view public.diag_notifications_triggers as
select tgname as trigger_name,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.notifications'::regclass
  and not tgisinternal;

grant select on public.diag_notifications_triggers to authenticated, service_role;
