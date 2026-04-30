-- Debug RPC: Policies einsehen (security definer, anon-callable)
-- Wird nach Debug wieder entfernt.
create or replace function public.debug_contact_policies()
returns table(
    policyname text,
    cmd text,
    roles text[],
    qual text,
    with_check text,
    permissive text
)
language sql
security definer
set search_path = public
as $$
    select policyname::text, cmd::text, roles::text[], qual::text, with_check::text, permissive::text
      from pg_policies
     where schemaname = 'public' and tablename = 'contact_messages';
$$;
grant execute on function public.debug_contact_policies() to anon, authenticated;

-- Auch RLS-Status pruefen
create or replace function public.debug_contact_status()
returns table(rls_enabled boolean, rls_forced boolean)
language sql
security definer
set search_path = public
as $$
    select c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'contact_messages';
$$;
grant execute on function public.debug_contact_status() to anon, authenticated;
