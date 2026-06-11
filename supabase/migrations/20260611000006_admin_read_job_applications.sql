-- =============================================================
-- ADMIN-READ auf job_applications (11.06.2026)
-- WICHTIG-Liste (d) aus Pre-Launch-Audit:
--   Bewerbungen waren nur fuer den Job-Owner (Partner-Dashboard)
--   lesbar. Admins hatten KEINEN Read -> keine Aufsicht/Support.
-- Fix: additive (PERMISSIVE) SELECT-Policy via is_caller_admin()
--   (SECURITY DEFINER Helper aus 20260611000002). ORt mit der
--   bestehenden job_applications_owner_read-Policy.
-- =============================================================

DROP POLICY IF EXISTS "job_applications_admin_read" ON public.job_applications;
CREATE POLICY "job_applications_admin_read" ON public.job_applications
    FOR SELECT USING (public.is_caller_admin());
