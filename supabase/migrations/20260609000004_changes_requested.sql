-- =============================================================
-- "Nachbesserung anfordern" fuer Partner-Einreichungen
-- Neuer Status changes_requested + Trigger-Mail an Einreicher mit der
-- Admin-Nachricht (z.B. "Bilder zu klein, bitte bessere nach").
-- Stand 2026-06-09
-- =============================================================

ALTER TABLE public.partner_submissions DROP CONSTRAINT IF EXISTS request_status_check;
ALTER TABLE public.partner_submissions ADD CONSTRAINT request_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'changes_requested'));

CREATE OR REPLACE FUNCTION public.notify_partner_submission_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_label text; v_name text; v_title text; v_msg text;
    v_link text := 'partner-dashboard.html'; v_url text;
BEGIN
    -- Relevante Wechsel: -> approved / rejected / changes_requested
    IF NEW.status = OLD.status OR NEW.status NOT IN ('approved', 'rejected', 'changes_requested') THEN
        RETURN NEW;
    END IF;

    v_label := CASE NEW.submission_type
        WHEN 'job' THEN 'Job' WHEN 'coupon' THEN 'Coupon' WHEN 'event' THEN 'Event' ELSE 'Eintrag' END;
    v_name := coalesce(nullif(NEW.title, ''), nullif(NEW.business_name, ''), v_label);

    IF NEW.status = 'approved' THEN
        v_title := '✅ ' || v_label || ' genehmigt';
        v_msg   := 'Dein ' || v_label || ' "' || v_name || '" ist jetzt live in der App.';
    ELSIF NEW.status = 'changes_requested' THEN
        v_title := '📝 ' || v_label || ': Bitte nachbessern';
        v_msg   := 'Fast geschafft! Bevor wir "' || v_name || '" veröffentlichen, brauchen wir noch eine Anpassung:'
                || case when coalesce(NEW.admin_notes, '') <> '' then '<br><br><strong>' || NEW.admin_notes || '</strong>' else '' end
                || '<br><br>Reich es danach einfach nochmal ein - danke dir!';
    ELSE
        v_title := '❌ ' || v_label || ' abgelehnt';
        v_msg   := 'Dein ' || v_label || ' "' || v_name || '" wurde nicht freigegeben.'
                || case when coalesce(NEW.admin_notes, '') <> '' then ' Hinweis: ' || NEW.admin_notes else '' end;
    END IF;

    -- 1. Eingeloggter Partner: In-App + Push
    IF NEW.submitter_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
        VALUES (NEW.submitter_id, 'partner_review', v_title, regexp_replace(v_msg, '<[^>]+>', ' ', 'g'), v_link, false);
        PERFORM public.notify_user_push(NEW.submitter_id, 'partner_review', v_title,
            regexp_replace(v_msg, '<[^>]+>', ' ', 'g'),
            jsonb_build_object('url', v_link, 'ref_id', 'psub_' || NEW.id::text));
    -- 2. Anon-Akquise: E-Mail an contact_email
    ELSIF coalesce(NEW.contact_email, '') <> '' THEN
        v_url := coalesce(current_setting('app.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
        PERFORM net.http_post(
            url := v_url, headers := public.app_internal_headers(),
            body := jsonb_build_object(
                'to', NEW.contact_email,
                'subject', v_title || ' - Room8',
                'html', '<h2>' || v_title || '</h2><p>' || v_msg || '</p>'
                     || '<p>Neu einreichen: <a href="https://www.room8.club">room8.club</a></p>'
            )
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_partner_submission_review failed: %', sqlerrm;
    RETURN NEW;
END;
$$;
