-- =============================================================
-- DSGVO profiles-Privacy - KORREKTE Umsetzung (11.06.2026)
-- Vorgeschichte: 20260611000003 (column-revoke) war wirkungslos, weil ein
-- table-level GRANT SELECT (aus 20260529000004_rollback_column_restriction)
-- column-level REVOKE uebersteuert. Und ein frueherer Versuch wurde gerollt,
-- weil my_profile (security_invoker) bei select('*') brach.
--
-- LOESUNG (beide Probleme zusammen):
--  1. my_profile-View auf security_definer + WHERE id=auth.uid() -> der User
--     liest seine EIGENE volle Zeile (inkl. sensible Spalten) ueber die View,
--     unabhaengig von den Tabellen-Grants. Nur die eigene Zeile (sicher).
--  2. table-level SELECT auf profiles entziehen, dann nur die 39 unkritischen
--     Spalten an anon/authenticated granten -> Fremd-Direktzugriff auf email,
--     Tokens, Ausweis-/Immatrikulations-Dokumente, Geburtsdatum, fcm_token
--     ist gesperrt. Fremd-Reads unkritischer Spalten (Username-Check) bleiben heil.
--  3. Admin liest alles ueber admin_profiles-View (security definer) + service_role.
-- Stand 2026-06-11
-- =============================================================

-- 1. my_profile als security_definer (eigene Zeile komplett, auch sensible Spalten)
DROP VIEW IF EXISTS public.my_profile;
CREATE VIEW public.my_profile
WITH (security_invoker = false) AS
SELECT * FROM public.profiles WHERE id = auth.uid();
GRANT SELECT ON public.my_profile TO authenticated;

-- 2. Direktzugriff auf profiles: table-SELECT weg, nur unkritische Spalten zurueck
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
    id, username, avatar_url, created_at, city, is_verified, is_student, role,
    bio, updated_at, is_student_verified, full_name, verification_status,
    university, study_field, semester, age, languages, interests,
    notification_settings, verification_method, verification_rejection_reason,
    verified_at, consent_given, consent_given_at, uni_email_verified, is_admin,
    is_banned, banned_at, instagram_handle, is_partner, partner_business_name,
    trusted_organizer, can_create_events, is_test, partner_can_jobs,
    partner_can_coupons, partner_can_events, current_chat_listing_id
) ON public.profiles TO anon, authenticated;
