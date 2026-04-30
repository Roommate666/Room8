-- Cleanup: alle Debug-RPCs aus heutiger Session entfernen.
-- Sie waren grant to anon → potenzieller Missbrauch (admin-mail spam, log-leak).

drop function if exists public.debug_contact_policies();
drop function if exists public.debug_contact_status();
drop function if exists public.debug_contact_columns();
drop function if exists public.debug_recent_notifications();
drop function if exists public.debug_recent_http();
drop function if exists public.debug_admin_recipients();
drop function if exists public.debug_trigger_admin_alert(text);

-- FORCE RLS auf contact_messages wieder einschalten
-- (war in Mig 23 testweise aus, FORCE betrifft nur table-owner inserts → harmlos
--  aber wir wollen prod-clean)
alter table public.contact_messages force row level security;
