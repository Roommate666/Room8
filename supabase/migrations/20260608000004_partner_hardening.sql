-- =============================================================
-- Partner-Haertung (08.06.2026)
-- FIX 1: events-INSERT Permission-Gate. Bisher durfte jeder verifizierte
--        User (also auch ein Partner OHNE partner_can_events) direkt Events
--        anlegen und so den Submission-/Approval-Flow umgehen. Jetzt RESTRICTIVE:
--        Partner brauchen partner_can_events; Nicht-Partner + Admin unveraendert.
-- FIX 3: Admin-Benachrichtigung bei neuer Partner-Einreichung -> detaillierte
--        Mail an feste Admin-Adresse (admin@roommate.club) statt generischer
--        Sammel-Mail an alle Admin-Profile. send_admin_alert (AI-LOCK) bleibt
--        unangetastet; nur der partner_submissions-Trigger wird ersetzt.
-- Stand 2026-06-08
-- =============================================================

-- ---------- FIX 1: Events Permission-Gate ----------
DROP POLICY IF EXISTS events_partner_permission_gate ON public.events;
CREATE POLICY events_partner_permission_gate
ON public.events
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    -- Admin darf immer
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    -- Nicht-Partner: unveraendert (greift die bestehende verified-Gate-Policy)
    OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_partner = true)
    -- Partner: nur mit partner_can_events
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_partner = true AND p.partner_can_events = true)
);

-- ---------- FIX 3: Detaillierte Admin-Mail an admin@roommate.club ----------
CREATE OR REPLACE FUNCTION public.notify_admin_new_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_label text;
    v_name text;
    v_url text;
    v_submitter_info text;
BEGIN
    v_label := CASE NEW.submission_type
        WHEN 'job' THEN 'Job'
        WHEN 'coupon' THEN 'Coupon'
        WHEN 'event' THEN 'Event'
        ELSE 'Eintrag' END;

    v_name := coalesce(nullif(NEW.title, ''), nullif(NEW.business_name, ''), v_label);

    IF NEW.submitter_id IS NOT NULL THEN
        v_submitter_info := '<p>Eingeloggter Partner (ID: <code>' || NEW.submitter_id::text || '</code>)</p>';
    ELSE
        v_submitter_info := '<p>Akquise-Lead, Kontakt: <a href="mailto:' || coalesce(NEW.contact_email, '') || '">' || coalesce(NEW.contact_email, 'keine') || '</a></p>';
    END IF;

    v_url := coalesce(current_setting('app.supabase_url', true),
                      'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';

    PERFORM net.http_post(
        url     := v_url,
        headers := public.app_internal_headers(),
        body    := jsonb_build_object(
            'to',      'admin@roommate.club',
            'subject', 'Neue ' || v_label || '-Einreichung: ' || v_name,
            'html',    '<h2>Neue ' || v_label || '-Einreichung</h2>'
                    || '<p><strong>' || v_name || '</strong>' || coalesce(' (' || nullif(NEW.business_name, '') || ')', '') || '</p>'
                    || coalesce('<p>Stadt: ' || nullif(NEW.city, '') || '</p>', '')
                    || v_submitter_info
                    || '<p>Pruefen + freigeben: <a href="https://www.room8.club/admin.html">admin.html</a></p>'
        )
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admin_new_submission failed: %', sqlerrm;
    RETURN NEW;
END;
$$;

-- Alten generischen Admin-Alert-Trigger durch den detaillierten ersetzen (kein Doppel-Mail)
DROP TRIGGER IF EXISTS alert_admin_new_partner_submission ON public.partner_submissions;
DROP TRIGGER IF EXISTS trg_notify_admin_new_submission ON public.partner_submissions;
CREATE TRIGGER trg_notify_admin_new_submission
    AFTER INSERT ON public.partner_submissions
    FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_submission();
