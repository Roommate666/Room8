-- Diagnose: gibt's mehrere Versionen von notify_new_listing_city?
create or replace view public.diag_function_versions as
select proname, pronargs, pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname like 'notify_new%' or proname = 'notify_user_push';

grant select on public.diag_function_versions to authenticated, service_role;
