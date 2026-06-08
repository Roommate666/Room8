-- =============================================================
-- Event-Anmelde-Benachrichtigung
-- Wenn ein Event signup_notify_email gesetzt hat, geht bei jeder
-- Anmeldung (event_interests.status = 'going') eine Mail an diese
-- Adresse mit dem Kontakt des Studenten. Fuer koordinierte Kurse
-- (z.B. Latte-Art-Kurs Casa-Caffè): Team sieht Interessenten + pickt
-- die Teilnehmer pro Samstag.
-- Stand 2026-06-08
-- =============================================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS signup_notify_email text;

CREATE OR REPLACE FUNCTION public.notify_event_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notify text;
    v_title text;
    v_count int;
    v_name text;
    v_email text;
    v_url text;
BEGIN
    -- Nur bei "going" benachrichtigen (interested/not_going ignorieren)
    IF NEW.status IS DISTINCT FROM 'going' THEN
        RETURN NEW;
    END IF;

    SELECT signup_notify_email, title INTO v_notify, v_title
      FROM public.events WHERE id = NEW.event_id;

    IF v_notify IS NULL OR v_notify = '' THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(full_name, username, 'Unbekannt'), email
      INTO v_name, v_email
      FROM public.profiles WHERE id = NEW.user_id;

    SELECT count(*) INTO v_count
      FROM public.event_interests WHERE event_id = NEW.event_id AND status = 'going';

    v_url := coalesce(current_setting('app.supabase_url', true),
                      'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';

    PERFORM net.http_post(
        url     := v_url,
        headers := public.app_internal_headers(),
        body    := jsonb_build_object(
            'to',      v_notify,
            'subject', 'Neue Anmeldung: ' || coalesce(v_title, 'Event') || ' (' || v_count || ')',
            'html',    '<h2>Neue Anmeldung</h2>'
                    || '<p><strong>' || coalesce(v_name, 'Student') || '</strong> hat sich angemeldet.</p>'
                    || '<p>E-Mail: <a href="mailto:' || coalesce(v_email, '') || '">' || coalesce(v_email, 'keine') || '</a></p>'
                    || '<p>Event: ' || coalesce(v_title, '') || '</p>'
                    || '<p>Anmeldungen gesamt: ' || v_count || '</p>'
        )
    );

    RETURN NEW;
END;
$$;

-- Feuert bei Insert UND bei Update auf 'going' (User der von interested -> going wechselt)
DROP TRIGGER IF EXISTS trg_notify_event_signup ON public.event_interests;
CREATE TRIGGER trg_notify_event_signup
    AFTER INSERT OR UPDATE OF status ON public.event_interests
    FOR EACH ROW EXECUTE FUNCTION public.notify_event_signup();
