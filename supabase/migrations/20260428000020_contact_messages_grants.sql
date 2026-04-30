-- Migration: contact_messages GRANTs (Nachzug zu 19)
-- Migration 19 hatte nur Policies, GRANT fehlte → 42501 blieb.

grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;
