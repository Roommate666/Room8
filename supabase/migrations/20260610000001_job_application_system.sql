-- =============================================================
-- Echtes In-App-Bewerbungssystem fuer Jobs
-- VORHER: "Bewerben" oeffnete nur mailto:/externe URL, job_applications
--   war ein reiner {user_id, listing_id}-Marker. Der Partner erfuhr NICHTS.
-- JETZT: Student fuellt Name/Email/Tel/Anschreiben aus + laedt optional
--   einen Lebenslauf (PDF) hoch. Die Bewerbung landet komplett in
--   job_applications, der Job-Owner sieht sie im Partner-Dashboard und
--   bekommt eine Mail. CV liegt im privaten resumes-Bucket, Partner-Zugriff
--   nur ueber Edge Function get-resume-url (Owner-/Admin-Check).
-- Stand 2026-06-10
-- =============================================================

-- 1. Bewerbungs-Daten an job_applications
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applicant_name  text;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applicant_email text;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applicant_phone text;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS cover_letter    text;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_path     text;

-- 2. Partner darf Bewerbungen fuer SEINE Jobs lesen (zusaetzlich zur self-read)
DROP POLICY IF EXISTS "job_applications_owner_read" ON public.job_applications;
CREATE POLICY "job_applications_owner_read" ON public.job_applications
    FOR SELECT USING (
        listing_id IN (SELECT id FROM public.listings WHERE owner_id = auth.uid())
    );

-- 3. Privater Bucket fuer Lebenslaeufe (NICHT public — CVs sind sensibel)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Upload: eingeloggter User nur in seinen eigenen Ordner resumes/<uid>/...
DROP POLICY IF EXISTS "resumes_self_upload" ON storage.objects;
CREATE POLICY "resumes_self_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Lesen: nur eigener CV (Partner-Zugriff laeuft ueber Edge Function mit service-role)
DROP POLICY IF EXISTS "resumes_self_read" ON storage.objects;
CREATE POLICY "resumes_self_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'resumes'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 4. Trigger: bei neuer Bewerbung -> Mail an Job-Owner (application_email,
--    Fallback Owner-Email) + In-App-Notification falls Owner eingeloggter Partner
CREATE OR REPLACE FUNCTION public.notify_job_application()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_job        record;
    v_owner_mail text;
    v_to         text;
    v_url        text;
    v_letter     text;
BEGIN
    SELECT l.title, l.owner_id, l.application_email
      INTO v_job
      FROM public.listings l
     WHERE l.id = NEW.listing_id;

    IF v_job IS NULL THEN RETURN NEW; END IF;

    SELECT email INTO v_owner_mail FROM auth.users WHERE id = v_job.owner_id;
    v_to := coalesce(nullif(v_job.application_email, ''), v_owner_mail);

    -- In-App-Notification fuer eingeloggten Partner
    IF v_job.owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
        VALUES (v_job.owner_id, 'job_application',
                '📨 Neue Bewerbung',
                coalesce(NEW.applicant_name, 'Jemand') || ' hat sich auf "' || coalesce(v_job.title, 'deinen Job') || '" beworben.',
                'partner-dashboard.html', false);
        PERFORM public.notify_user_push(v_job.owner_id, 'job_application',
            '📨 Neue Bewerbung',
            coalesce(NEW.applicant_name, 'Jemand') || ' hat sich auf "' || coalesce(v_job.title, 'deinen Job') || '" beworben.',
            jsonb_build_object('url', 'partner-dashboard.html', 'ref_id', 'japp_' || NEW.id::text));
    END IF;

    -- Mail an den Job-Owner mit den Bewerber-Daten
    IF coalesce(v_to, '') <> '' THEN
        v_letter := coalesce(NEW.cover_letter, '');
        v_url := coalesce(current_setting('app.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
        PERFORM net.http_post(
            url := v_url,
            headers := public.app_internal_headers(),
            body := jsonb_build_object(
                'to', v_to,
                'subject', 'Neue Bewerbung: ' || coalesce(v_job.title, 'Job') || ' - Room8',
                'html',
                    '<h2>Neue Bewerbung ueber Room8</h2>'
                  || '<p>Du hast eine neue Bewerbung auf <strong>' || coalesce(v_job.title, 'deinen Job') || '</strong> erhalten.</p>'
                  || '<table style="border-collapse:collapse;margin:12px 0;">'
                  || '<tr><td style="padding:4px 10px;color:#6b7280;">Name</td><td style="padding:4px 10px;"><strong>' || coalesce(NEW.applicant_name, '-') || '</strong></td></tr>'
                  || '<tr><td style="padding:4px 10px;color:#6b7280;">E-Mail</td><td style="padding:4px 10px;"><a href="mailto:' || coalesce(NEW.applicant_email, '') || '">' || coalesce(NEW.applicant_email, '-') || '</a></td></tr>'
                  || '<tr><td style="padding:4px 10px;color:#6b7280;">Telefon</td><td style="padding:4px 10px;">' || coalesce(NEW.applicant_phone, '-') || '</td></tr>'
                  || '</table>'
                  || case when v_letter <> '' then '<p style="color:#6b7280;margin-bottom:4px;">Anschreiben:</p><blockquote style="border-left:3px solid #f59e0b;padding-left:12px;color:#374151;white-space:pre-wrap;">' || v_letter || '</blockquote>' else '' end
                  || case when coalesce(NEW.resume_path, '') <> '' then '<p>📎 Lebenslauf liegt bei der Bewerbung — im <a href="https://www.room8.club/partner-dashboard.html">Partner-Dashboard</a> ansehen.</p>' else '<p>Vollstaendige Bewerbung im <a href="https://www.room8.club/partner-dashboard.html">Partner-Dashboard</a>.</p>' end
            )
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_job_application failed: %', sqlerrm;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_job_application ON public.job_applications;
CREATE TRIGGER trg_notify_job_application
    AFTER INSERT ON public.job_applications
    FOR EACH ROW EXECUTE FUNCTION public.notify_job_application();
