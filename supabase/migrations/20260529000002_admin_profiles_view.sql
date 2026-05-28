-- View admin_profiles: voller Profil-Zugriff (ALLE Spalten) AUSSCHLIESSLICH fuer Admins.
--
-- Hintergrund: Die naechste Migration (20260529000003) entzieht der authenticated-Rolle
-- das SELECT-Recht auf sensible profiles-Spalten (email, edu_email, uni_email,
-- *_token, fcm_token, *_url-Dokumente, date_of_birth). Das Admin-Panel
-- (Verifizierungs-Pruefung) braucht diese Spalten aber. Diese View liefert sie -
-- aber nur, wenn der aufrufende Nutzer selbst Admin ist.
--
-- security_invoker = false: Die View laeuft mit Owner-Rechten und umgeht die
-- Spalten-/Zeilen-Restriktionen der profiles-Tabelle. Der Zugriffsschutz steckt
-- in der WHERE-EXISTS-Klausel: nur wenn das eigene Profil is_admin=true hat,
-- liefert die View Zeilen - sonst leer. auth.uid() bleibt der echte Aufrufer.

create or replace view public.admin_profiles
with (security_invoker = false) as
select p.*
from public.profiles p
where exists (
  select 1 from public.profiles me
  where me.id = auth.uid() and me.is_admin = true
);

grant select on public.admin_profiles to authenticated;
