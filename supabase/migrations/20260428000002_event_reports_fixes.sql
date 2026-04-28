-- =============================================================
-- Fixes auf event_reports + events Trigger-Logik
-- (Findings aus Test-Bot Iteration 2)
-- Stand 2026-04-28
-- =============================================================

-- =============================================================
-- FIX 1: protect_events_admin_fields mit Bypass-Mechanismus
-- System-Trigger (z.B. auto_hide) sollen status aendern duerfen,
-- auch wenn auth.uid() NULL ist (SECURITY DEFINER Context)
-- =============================================================
CREATE OR REPLACE FUNCTION public.protect_events_admin_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- Bypass fuer System-Updates (gesetzt von auto_hide_reported_events)
    IF current_setting('app.system_update', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = auth.uid();

    IF NOT v_is_admin THEN
        IF TG_OP = 'INSERT' THEN
            NEW.is_official := false;
            NEW.organizer_type := COALESCE(NEW.organizer_type, 'student');
            IF NEW.organizer_type IN ('university', 'asta', 'admin') THEN
                NEW.organizer_type := 'student';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            NEW.is_official := OLD.is_official;
            NEW.organizer_type := OLD.organizer_type;
            NEW.view_count := OLD.view_count;
            NEW.interest_count := OLD.interest_count;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FIX 2 + 3: Auto-Hide robust machen
--   - Bypass-Setting setzen damit protect-Trigger durchlaesst
--   - COUNT NUR ueber reporter_id IS NOT NULL (verhindert NULL-Manipulation
--     wenn Reporter-Accounts geloescht werden)
--   - SELECT FOR UPDATE Lock auf Event-Zeile gegen Race-Condition
-- =============================================================
CREATE OR REPLACE FUNCTION public.auto_hide_reported_events()
RETURNS TRIGGER AS $$
DECLARE
    v_count integer;
    v_event_status text;
BEGIN
    -- Lock die Event-Zeile gegen Race-Condition
    SELECT status INTO v_event_status
    FROM public.events
    WHERE id = NEW.event_id
    FOR UPDATE;

    IF v_event_status IS NULL THEN
        RETURN NEW;
    END IF;

    -- Nur valide Reports zaehlen (NULL-reporter sind verwaiste Eintraege
    -- nach User-Loeschung und sollen die 3er-Schwelle nicht aufblaehen)
    SELECT COUNT(*) INTO v_count
    FROM public.event_reports
    WHERE event_id = NEW.event_id
    AND reporter_id IS NOT NULL;

    IF v_count >= 3 AND v_event_status = 'active' THEN
        -- Bypass-Flag setzen damit protect_events_admin_fields den
        -- system-getriggerten status-Change durchlaesst
        PERFORM set_config('app.system_update', 'on', true);
        UPDATE public.events
        SET status = 'draft'
        WHERE id = NEW.event_id;
        PERFORM set_config('app.system_update', 'off', true);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FIX 4: Organizer kann sein eigenes Event auch im draft-Status sehen
-- Sonst landet er im "404 / Event nicht gefunden" Loop, ohne zu wissen
-- dass es nur auto-gehidet wurde
-- =============================================================
DROP POLICY IF EXISTS "events_organizer_read_own" ON public.events;
CREATE POLICY "events_organizer_read_own" ON public.events
    FOR SELECT USING (auth.uid() = organizer_id);

COMMENT ON FUNCTION public.auto_hide_reported_events IS 'Hidet Events ab 3 nicht-NULL Reports. Lock + Bypass-Flag fuer protect_events_admin_fields.';
COMMENT ON FUNCTION public.protect_events_admin_fields IS 'Schuetzt admin-only Felder. Bypass via app.system_update=on Setting fuer System-Trigger.';
