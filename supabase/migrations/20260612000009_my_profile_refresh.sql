-- my_profile-View neu aufbauen, damit sie ALLE aktuellen profiles-Spalten enthaelt.
--
-- Problem: die View wurde in 20260529000005 mit `select *` erstellt. Postgres expandiert
-- `*` EINMALIG beim Erstellen und friert die Spaltenliste ein -> spaeter hinzugefuegte
-- Spalten (avatar_config [0005-avatar], is_student_verified/enrollment_* [0006], usw.)
-- fehlten in der View. Folge: profile.html konnte avatar_config nicht lesen
-- ("column my_profile.avatar_config does not exist") -> Ziegen-Avatar blieb leer.
--
-- Fix: View droppen + mit frischem `select *` neu anlegen -> enthaelt jetzt alle Spalten.
-- security_invoker bleibt an -> RLS/where id=auth.uid() greifen wie zuvor.

drop view if exists public.my_profile;

create view public.my_profile
with (security_invoker = true) as
select *
from public.profiles
where id = auth.uid();

grant select on public.my_profile to authenticated;
