-- my_profile-View erneut neu bauen, damit sie die in 0013 hinzugefuegte Spalte `coins`
-- (und ggf. weitere) enthaelt. Grund: `select *` friert die Spaltenliste beim Erstellen
-- ein -> nach jedem Spalten-Add muss die View neu gebaut werden (bekannte Falle, vgl. 0010).
-- Owner-Rechte (KEIN security_invoker) + where id=auth.uid() = Sicherheitsgrenze.

drop view if exists public.my_profile;

create view public.my_profile as
select *
from public.profiles
where id = auth.uid();

grant select on public.my_profile to authenticated;
