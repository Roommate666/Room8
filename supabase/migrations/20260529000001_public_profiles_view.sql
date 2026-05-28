-- View public_profiles: oeffentlich anzeigbare Profilfelder fuer das Anzeigen
-- FREMDER Profile (Inserent, Chat-Partner, public-profile, Reviews, Blockliste).
--
-- Hintergrund: profiles hat aktuell die SELECT-Policy "authenticated_read_profiles"
-- mit USING (true) -> jeder eingeloggte User kann ALLE Spalten ALLER Profile lesen,
-- inkl. email, edu_email, uni_email, uni_email_verification_token, fcm_token,
-- enrollment_certificate_url, verification_document_url, student_id_image_url,
-- is_admin. Das ist ein DSGVO-Datenleck.
--
-- Plan (3 Stufen):
--   1. Diese View bereitstellen (NUR unkritische Anzeige-Spalten) -- additiv.
--   2. Die ~6 App-Stellen, die FREMDE Profile lesen, auf diese View umstellen.
--   3. profiles-SELECT-Policy auf (auth.uid() = id OR is_admin) verschaerfen.
--
-- security_invoker = false: Die View laeuft mit den Rechten des Owners und umgeht
-- damit die (in Stufe 3 strenge) RLS der profiles-Tabelle, sodass weiterhin die
-- oeffentlichen Felder ALLER Profile angezeigt werden koennen. Das ist sicher,
-- weil diese View AUSSCHLIESSLICH unkritische Spalten enthaelt.
--
-- ACHTUNG: Hier NIEMALS email/edu_email/uni_email/*_token/*_url/is_admin/
-- is_banned/fcm_token/verification_*/date_of_birth/role/consent_* aufnehmen.

-- Es existiert bereits eine aeltere, von der App NICHT genutzte public_profiles-View
-- mit abweichender Spalten-Reihenfolge. create-or-replace kann Spalten nicht
-- umordnen (Fehler 42P16), daher gezielt droppen und neu erstellen.
-- Ohne CASCADE: sollte wider Erwarten doch ein Objekt abhaengen, bricht die
-- Migration sichtbar ab, statt still etwas mitzuloeschen.
drop view if exists public.public_profiles;

create view public.public_profiles
with (security_invoker = false) as
select
  id,
  username,
  full_name,
  avatar_url,
  bio,
  city,
  university,
  study_field,
  semester,
  age,
  languages,
  interests,
  instagram_handle,
  is_verified,
  is_student,
  is_student_verified,
  is_partner,
  partner_business_name,
  created_at
from public.profiles;

-- Nur eingeloggte Nutzer duerfen die View lesen (App ist login-gated).
-- anon bewusst NICHT gewaehrt; bei kuenftigem "Browsen ohne Login" gezielt ergaenzen.
grant select on public.public_profiles to authenticated;
