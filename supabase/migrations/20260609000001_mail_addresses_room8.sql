-- =============================================================
-- Mail-Adressen auf einheitliche room8.club-Domain umstellen
-- Partner-Einreichungen -> partner@room8.club (war admin@roommate.club)
-- (Event/Coupon-Signup-Ziel steht pro Eintrag in signup_notify_email,
--  wird separat per UPDATE auf admin@room8.club gesetzt.)
-- Stand 2026-06-09
-- =============================================================

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
        WHEN 'job' THEN 'Job' WHEN 'coupon' THEN 'Coupon' WHEN 'event' THEN 'Event' ELSE 'Eintrag' END;
    v_name := coalesce(nullif(NEW.title, ''), nullif(NEW.business_name, ''), v_label);
    IF NEW.submitter_id IS NOT NULL THEN
        v_submitter_info := '<p>Eingeloggter Partner (ID: <code>' || NEW.submitter_id::text || '</code>)</p>';
    ELSE
        v_submitter_info := '<p>Akquise-Lead, Kontakt: <a href="mailto:' || coalesce(NEW.contact_email, '') || '">' || coalesce(NEW.contact_email, 'keine') || '</a></p>';
    END IF;
    v_url := coalesce(current_setting('app.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
    PERFORM net.http_post(
        url := v_url, headers := public.app_internal_headers(),
        body := jsonb_build_object(
            'to', 'partner@room8.club',
            'subject', 'Neue ' || v_label || '-Einreichung: ' || v_name,
            'html', '<h2>Neue ' || v_label || '-Einreichung</h2>'
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
