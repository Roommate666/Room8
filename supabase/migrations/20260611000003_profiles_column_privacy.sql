-- =============================================================
-- DSGVO: Sensible profiles-Spalten nicht mehr fuer anon/authenticated lesbar
-- Audit-Befund: profiles ist USING(true) -> jeder konnte alle 113 User inkl.
-- email, uni_email_verification_token, fcm_token, date_of_birth,
-- verification_document_url, student_id_image_url auslesen (GET 206).
--
-- LOESUNG: Column-Level-Privacy statt Zeilen-RLS-Verschaerfung. Grund:
-- - Der www/-Code macht KEIN select('*') auf profiles und liest KEINE dieser
--   Spalten per SELECT (nur ein fcm_token-UPDATE). Verifiziert per grep.
-- - Fremd-Reads unkritischer Spalten (Username-Check etc.) bleiben heil ->
--   kein Build-Bruch-Risiko wie bei Zeilen-RLS (CLAUDE.md-Warnung umgangen).
-- - Admin-Vollzugriff laeuft ueber admin_profiles-View (security definer) +
--   service_role -> die behalten Zugriff.
-- Reversibel per GRANT falls ein Eigen-Flow eine Spalte doch braucht.
-- Stand 2026-06-11
-- =============================================================

REVOKE SELECT (
    email,
    edu_email,
    email_domain,
    uni_email,
    uni_email_verification_token,
    uni_email_token_created_at,
    verification_document_url,
    student_id_image_url,
    date_of_birth,
    fcm_token
) ON public.profiles FROM anon, authenticated;
