-- Studierende duerfen ihre eigene Hochschule (university) am Profil setzen.
--
-- Hintergrund: public.profiles hat SPALTENWEISE UPDATE-Grants fuer die Rolle
-- authenticated (username, full_name, city, ...). Die Spalte `university` war bisher
-- NICHT enthalten (sie wurde nur vom Enrollment-Scan per Service-Role gesetzt).
-- Dadurch schlug jedes Profil-Update, das `university` enthaelt, mit
-- "permission denied for table profiles" (SQLSTATE 42501) fehl.
--
-- Jetzt wird die Uni im Pflicht-Onboarding (complete-profile.html) vom Studierenden
-- selbst gewaehlt (fuer das Uni-Highscore-Board). Dafuer braucht authenticated das
-- Spalten-UPDATE-Recht auf university. RLS (eigene Zeile) bleibt die Sicherheitsgrenze.

grant update (university) on public.profiles to authenticated;
