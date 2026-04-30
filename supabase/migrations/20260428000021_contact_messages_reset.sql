-- Migration: contact_messages - alle Policies wegwerfen + sauber neu
-- Vermutung: alte RESTRICTIVE Policy blockt trotz neuer permissive Policy

-- Alle Policies dynamisch droppen
do $$
declare
    pol record;
begin
    for pol in
        select policyname
          from pg_policies
         where schemaname = 'public'
           and tablename = 'contact_messages'
    loop
        execute format('drop policy if exists %I on public.contact_messages', pol.policyname);
    end loop;
end$$;

-- RLS sicher an
alter table public.contact_messages enable row level security;
alter table public.contact_messages force row level security;

-- GRANT
grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;

-- INSERT: anon + authenticated
create policy "ct_insert_any"
    on public.contact_messages
    as permissive
    for insert
    to anon, authenticated
    with check (true);

-- SELECT: nur Admins
create policy "ct_select_admin"
    on public.contact_messages
    as permissive
    for select
    to authenticated
    using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );

-- UPDATE: nur Admins
create policy "ct_update_admin"
    on public.contact_messages
    as permissive
    for update
    to authenticated
    using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    )
    with check (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );

-- DELETE: nur Admins
create policy "ct_delete_admin"
    on public.contact_messages
    as permissive
    for delete
    to authenticated
    using (
        exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
    );
