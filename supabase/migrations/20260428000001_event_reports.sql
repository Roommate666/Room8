-- =============================================================
-- Event Reports: User koennen problematische Events melden
-- Bei >=3 Reports: Auto-Hide (status -> draft) bis Admin-Review
-- Stand 2026-04-28
-- =============================================================

CREATE TABLE IF NOT EXISTS public.event_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reason text NOT NULL,
    details text,
    handled boolean DEFAULT false,
    handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    handled_at timestamptz,
    created_at timestamptz DEFAULT now(),
    UNIQUE(event_id, reporter_id),
    CONSTRAINT event_reports_reason_check CHECK (reason IN ('spam', 'illegal', 'hate', 'fake', 'duplicate', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_event_reports_event ON public.event_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_handled ON public.event_reports(handled) WHERE handled = false;

ALTER TABLE public.event_reports ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- RLS POLICIES
-- =============================================================

-- Reporter darf eigenen Report einsenden
DROP POLICY IF EXISTS "event_reports_self_insert" ON public.event_reports;
CREATE POLICY "event_reports_self_insert" ON public.event_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Reporter darf nur eigenen Report sehen (kein Browsing fremder Reports)
DROP POLICY IF EXISTS "event_reports_self_read" ON public.event_reports;
CREATE POLICY "event_reports_self_read" ON public.event_reports
    FOR SELECT USING (auth.uid() = reporter_id);

-- Admin sieht und bearbeitet alle Reports
DROP POLICY IF EXISTS "event_reports_admin_all" ON public.event_reports;
CREATE POLICY "event_reports_admin_all" ON public.event_reports
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- =============================================================
-- TRIGGER: Auto-Hide bei >=3 Reports
-- Setzt status auf 'draft' damit Event nicht mehr oeffentlich sichtbar ist
-- bis Admin reviewen + entweder freigeben (zurueck auf 'active')
-- oder loeschen (cancelled)
-- =============================================================
CREATE OR REPLACE FUNCTION public.auto_hide_reported_events()
RETURNS TRIGGER AS $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.event_reports
    WHERE event_id = NEW.event_id;

    IF v_count >= 3 THEN
        -- Bypassed RLS via SECURITY DEFINER (function owner = postgres)
        UPDATE public.events
        SET status = 'draft'
        WHERE id = NEW.event_id
        AND status = 'active';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_event_reports_auto_hide ON public.event_reports;
CREATE TRIGGER trg_event_reports_auto_hide
    AFTER INSERT ON public.event_reports
    FOR EACH ROW EXECUTE FUNCTION public.auto_hide_reported_events();

-- =============================================================
-- RPC: Report einreichen (Convenience + Anti-Manipulation)
-- =============================================================
CREATE OR REPLACE FUNCTION public.report_event(
    event_id_input uuid,
    reason_input text,
    details_input text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_user_id uuid;
    v_existing_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- Pruefen ob User schon gemeldet hat
    SELECT id INTO v_existing_id
    FROM public.event_reports
    WHERE event_id = event_id_input AND reporter_id = v_user_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'already_reported');
    END IF;

    -- Event existiert?
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = event_id_input) THEN
        RETURN json_build_object('success', false, 'error', 'event_not_found');
    END IF;

    -- Eigene Events kann man nicht melden
    IF EXISTS (SELECT 1 FROM public.events WHERE id = event_id_input AND organizer_id = v_user_id) THEN
        RETURN json_build_object('success', false, 'error', 'cant_report_own');
    END IF;

    INSERT INTO public.event_reports (event_id, reporter_id, reason, details)
    VALUES (event_id_input, v_user_id, reason_input, details_input);

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.report_event(uuid, text, text) TO authenticated;

COMMENT ON TABLE public.event_reports IS 'User-Reports auf Events. Auto-Hide bei >=3 Reports.';
