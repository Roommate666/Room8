-- =============================================================
-- Coupon-Signups: Selbst-Anmeldung statt QR-Einloesung
-- Fuer koordinierte Aktionen (z.B. Latte-Art-Kurs Casa-Caffè):
-- Student meldet sich selbst an (kein Partner-Scan). Bei jeder Anmeldung
-- geht eine Mail an signup_notify_email mit Kontakt des Studenten, sodass
-- das Team die ersten N kontaktieren + Plaetze koordinieren kann.
-- signup_limit begrenzt die Gesamt-Anmeldungen (z.B. 10).
-- Stand 2026-06-08
-- =============================================================

-- Coupon-Felder fuer den Anmelde-Modus
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS signup_notify_email text;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS signup_limit int;

CREATE TABLE IF NOT EXISTS public.coupon_signups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_signups_coupon ON public.coupon_signups(coupon_id);

ALTER TABLE public.coupon_signups ENABLE ROW LEVEL SECURITY;

-- Eigene Anmeldungen lesen
DROP POLICY IF EXISTS "coupon_signups_self_read" ON public.coupon_signups;
CREATE POLICY "coupon_signups_self_read" ON public.coupon_signups
    FOR SELECT USING (auth.uid() = user_id);

-- Selbst anmelden
DROP POLICY IF EXISTS "coupon_signups_self_insert" ON public.coupon_signups;
CREATE POLICY "coupon_signups_self_insert" ON public.coupon_signups
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Eigene Anmeldung zuruecknehmen
DROP POLICY IF EXISTS "coupon_signups_self_delete" ON public.coupon_signups;
CREATE POLICY "coupon_signups_self_delete" ON public.coupon_signups
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================================
-- Limit-Check (BEFORE INSERT): nur solange unter signup_limit
-- =============================================================
CREATE OR REPLACE FUNCTION public.enforce_coupon_signup_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit int;
    v_count int;
BEGIN
    -- Serialisieren pro Coupon (Race-Schutz fuer die letzten Plaetze)
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.coupon_id::text, 0));

    SELECT signup_limit INTO v_limit FROM public.coupons WHERE id = NEW.coupon_id;

    IF v_limit IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.coupon_signups WHERE coupon_id = NEW.coupon_id;
        IF v_count >= v_limit THEN
            RAISE EXCEPTION 'SIGNUP_LIMIT_REACHED' USING errcode = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_coupon_signup_limit ON public.coupon_signups;
CREATE TRIGGER trg_enforce_coupon_signup_limit
    BEFORE INSERT ON public.coupon_signups
    FOR EACH ROW EXECUTE FUNCTION public.enforce_coupon_signup_limit();

-- =============================================================
-- Notify (AFTER INSERT): Mail an signup_notify_email mit Kontakt
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_coupon_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notify text;
    v_title text;
    v_limit int;
    v_count int;
    v_name text;
    v_email text;
    v_url text;
BEGIN
    SELECT signup_notify_email, title, signup_limit
      INTO v_notify, v_title, v_limit
      FROM public.coupons WHERE id = NEW.coupon_id;

    -- Kein Notify-Ziel gesetzt -> nichts tun
    IF v_notify IS NULL OR v_notify = '' THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(full_name, username, 'Unbekannt'), email
      INTO v_name, v_email
      FROM public.profiles WHERE id = NEW.user_id;

    SELECT count(*) INTO v_count FROM public.coupon_signups WHERE coupon_id = NEW.coupon_id;

    v_url := coalesce(current_setting('app.supabase_url', true),
                      'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';

    PERFORM net.http_post(
        url     := v_url,
        headers := public.app_internal_headers(),
        body    := jsonb_build_object(
            'to',      v_notify,
            'subject', 'Neue Anmeldung: ' || coalesce(v_title, 'Coupon') || ' (' || v_count || '/' || coalesce(v_limit, 0) || ')',
            'html',    '<h2>Neue Kurs-Anmeldung</h2>'
                    || '<p><strong>' || coalesce(v_name, 'Student') || '</strong> hat sich angemeldet.</p>'
                    || '<p>E-Mail: <a href="mailto:' || coalesce(v_email, '') || '">' || coalesce(v_email, 'keine') || '</a></p>'
                    || '<p>Aktion: ' || coalesce(v_title, '') || '</p>'
                    || '<p>Anmeldung ' || v_count || ' von ' || coalesce(v_limit::text, 'unbegrenzt') || '</p>'
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_coupon_signup ON public.coupon_signups;
CREATE TRIGGER trg_notify_coupon_signup
    AFTER INSERT ON public.coupon_signups
    FOR EACH ROW EXECUTE FUNCTION public.notify_coupon_signup();
