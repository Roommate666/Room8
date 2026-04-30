-- Test: Force RLS abschalten (FORCE blockt auch Owner/security-definer Inserts)
alter table public.contact_messages no force row level security;
