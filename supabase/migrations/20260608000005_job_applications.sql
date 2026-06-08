-- =============================================================
-- Job-Bewerbungs-Tracking pro User
-- Bisher zaehlte job-detail nur ein Aggregat (increment_listing_apply) ohne
-- User-Bezug. Damit das Profil "Beworbene Jobs" zeigen kann, wird pro
-- eingeloggtem User + Job ein Datensatz angelegt.
-- Stand 2026-06-08
-- =============================================================

CREATE TABLE IF NOT EXISTS public.job_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    applied_at timestamptz DEFAULT now(),
    UNIQUE(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_user ON public.job_applications(user_id);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_applications_self_read" ON public.job_applications;
CREATE POLICY "job_applications_self_read" ON public.job_applications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "job_applications_self_insert" ON public.job_applications;
CREATE POLICY "job_applications_self_insert" ON public.job_applications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "job_applications_self_delete" ON public.job_applications;
CREATE POLICY "job_applications_self_delete" ON public.job_applications
    FOR DELETE USING (auth.uid() = user_id);
