-- Migration: contact_messages RLS - anon INSERT erlauben
--
-- Problem: contact_messages hatte RLS aktiv, aber keine INSERT-Policy.
-- → Anonyme Submits aus faq.html schlugen still fehl, Trigger feuerte nie,
--   keine Admin-Alert-Mail kam an.
--
-- Loesung:
--   - INSERT: anon + authenticated erlaubt (jeder darf Kontakt schreiben)
--   - SELECT/UPDATE/DELETE: nur Admins
--
-- Spec: specs/push-and-email.md (Pipeline kontakt → trigger → mail)

alter table public.contact_messages enable row level security;

-- GRANT zusaetzlich zur Policy noetig (sonst 42501 trotz Policy)
grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;

-- alte Policies sicherheitshalber droppen (idempotent)
drop policy if exists "anon insert contact" on public.contact_messages;
drop policy if exists "auth insert contact" on public.contact_messages;
drop policy if exists "admin select contact" on public.contact_messages;
drop policy if exists "admin update contact" on public.contact_messages;
drop policy if exists "admin delete contact" on public.contact_messages;

-- INSERT: anon + authenticated
create policy "anon insert contact"
    on public.contact_messages
    for insert
    to anon, authenticated
    with check (true);

-- SELECT: nur Admins
create policy "admin select contact"
    on public.contact_messages
    for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
             where id = auth.uid() and is_admin = true
        )
    );

-- UPDATE: nur Admins (z.B. is_read setzen)
create policy "admin update contact"
    on public.contact_messages
    for update
    to authenticated
    using (
        exists (
            select 1 from public.profiles
             where id = auth.uid() and is_admin = true
        )
    );

-- DELETE: nur Admins
create policy "admin delete contact"
    on public.contact_messages
    for delete
    to authenticated
    using (
        exists (
            select 1 from public.profiles
             where id = auth.uid() and is_admin = true
        )
    );
