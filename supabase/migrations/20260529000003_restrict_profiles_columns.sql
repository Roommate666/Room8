-- Spalten-Schutz fuer profiles (Stufe 3b): entzieht der authenticated-Rolle das
-- SELECT-Recht auf sensible Spalten. Das schliesst das Kern-Datenleck (bisher
-- konnte jeder eingeloggte User per profiles.select('*') alle Emails, Push-Token,
-- Verify-Token und Dokument-URLs aller Nutzer auslesen).
--
-- Bewusst Spalten-Level (nicht Row-Policy-Verschaerfung): Die ausgelieferte native
-- App v2.1.9 liest fremde Profile noch direkt aus profiles fuer Anzeige-Zwecke
-- (Chat-Partner-Name, Inserent). Eine Row-Verschaerfung wuerde diese App brechen.
-- Spalten-Level laesst Anzeige-Felder + Flags lesbar (App laeuft), sperrt aber die
-- personenbezogen sensiblen Spalten sofort.
--
-- Admin-Zugriff auf die gesperrten Spalten laeuft ueber View admin_profiles (Mig 0002).
-- Edge Functions/Trigger nutzen service_role und sind von column-grants nicht betroffen.
-- Die Views public_profiles + admin_profiles laufen security_definer (Owner-Rechte)
-- und sind ebenfalls nicht betroffen.
--
-- GESPERRT (10): email, edu_email, uni_email, uni_email_verification_token,
--   uni_email_token_created_at, fcm_token, enrollment_certificate_url,
--   verification_document_url, student_id_image_url, date_of_birth.
-- Die Row-Policy authenticated_read_profiles (USING true) bleibt unveraendert;
-- UPDATE/INSERT/DELETE-Rechte bleiben unveraendert (nur SELECT wird eingeschraenkt).

revoke select on public.profiles from authenticated;

grant select (
  id, username, avatar_url, created_at, city, is_verified, is_student,
  role, bio, updated_at, is_student_verified, full_name, verification_status,
  university, study_field, semester, age, languages, interests,
  notification_settings, email_domain, verification_method,
  verification_rejection_reason, verified_at, consent_given, consent_given_at,
  uni_email_verified, is_admin, is_banned, banned_at, instagram_handle,
  is_partner, partner_business_name, trusted_organizer, can_create_events,
  is_test, partner_can_jobs, partner_can_coupons, partner_can_events,
  current_chat_listing_id
) on public.profiles to authenticated;
