-- View my_profile: das EIGENE, vollstaendige Profil des eingeloggten Users.
--
-- Hintergrund: profile.html und session-cache.js machen select('*').eq('id', userId)
-- auf profiles, um das eigene Profil (inkl. sensibler Felder wie email, fcm_token,
-- Verify-Token) in den Session-Cache zu laden. Das ist legitim -- der User darf
-- sein eigenes Profil komplett sehen.
--
-- Problem: Solange dieser Code direkt select('*') auf der Tabelle profiles macht,
-- kann die profiles-SELECT-Policy nicht auf (auth.uid() = id OR is_admin)
-- verschaerft werden, ohne dass ein Spalten-Grant die Sache verkompliziert.
-- Diese View kapselt den Eigen-Read: select('*') auf my_profile statt auf profiles.
--
-- security_invoker = true: Die View laeuft mit den Rechten des Aufrufers. Zusammen
-- mit WHERE id = auth.uid() gibt sie GENAU die eine eigene Zeile zurueck -- und
-- funktioniert sowohl unter der aktuellen Policy (USING true) als auch nach der
-- geplanten Verschaerfung (USING auth.uid() = id OR is_admin), weil der eigene
-- Read in beiden Faellen erlaubt bleibt.
--
-- Ablauf (finaler Schutz): sobald eine App-Version live ist, die fuer Eigen-Reads
-- my_profile und fuer Fremd-Reads public_profiles nutzt (kein select('*') auf
-- profiles mehr), kann Mig 0003 (Spalten-Restriktion) ODER eine Row-Policy-
-- Verschaerfung gefahrlos angewendet werden.

drop view if exists public.my_profile;

create view public.my_profile
with (security_invoker = true) as
select *
from public.profiles
where id = auth.uid();

grant select on public.my_profile to authenticated;
