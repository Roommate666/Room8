-- ROLLBACK von 20260529000003 (Spalten-Restriktion).
--
-- Problem: PostgREST expandiert select('*') auf ALLE Spalten. Mit der Spalten-
-- Restriktion fuehrt jedes select('*') auf profiles zu "permission denied".
-- Die ausgelieferte native App v2.1.9 nutzt session-cache.js mit
-- select('*').eq('id', userId) auf 45 Seiten (getUser-Cache) -- das wuerde die
-- App an fundamentaler Stelle brechen, und die native App ist nicht per Deploy
-- aktualisierbar (Apple-Review laeuft).
--
-- Daher: table-level SELECT wiederherstellen (voller Lesezugriff wie zuvor).
-- Der eigentliche Schutz (Spalten- ODER Zeilen-Restriktion) wird erst angewendet,
-- wenn eine App-Version live ist, die kein select('*') mehr auf profiles macht,
-- sondern die Views my_profile / public_profiles nutzt.
--
-- Die Views public_profiles (Mig 0001) und admin_profiles (Mig 0002) sowie die
-- bereits umgestellten FREMD-Reads bleiben bestehen -- sie sind die Vorbereitung
-- fuer den finalen Schutz nach dem App-Update.

grant select on public.profiles to authenticated;
