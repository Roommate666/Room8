-- my_profile: von security_invoker zurueck auf Owner-Rechte (definer-Semantik).
--
-- 0009 hat die View mit security_invoker=true neu gebaut. Damit braucht die aufrufende
-- Rolle (authenticated) direktes SELECT-Recht auf public.profiles -> das ist NICHT
-- gegranted (Zugriff lief bisher ueber die View mit Owner-Rechten), daher jetzt
-- "permission denied for table profiles" und das Profil laed gar nicht mehr.
--
-- Fix: View ohne security_invoker (= Owner-Rechte, definer-Semantik) neu bauen.
-- Der WHERE id = auth.uid()-Filter bleibt die Sicherheitsgrenze -> jeder sieht nur die
-- EIGENE Zeile (gleiches Muster wie public_profiles). Enthaelt weiter alle Spalten (select *).

drop view if exists public.my_profile;

create view public.my_profile as
select *
from public.profiles
where id = auth.uid();

grant select on public.my_profile to authenticated;
