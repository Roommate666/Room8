-- =============================================================
-- EVENT-KAPAZITAETS-GUARD (11.06.2026)
-- WICHTIG-Liste (e) aus Pre-Launch-Audit:
--   max_participants wurde bisher NUR clientseitig als "Ausgebucht"
--   geprueft (event-detail.html). Ein Bypass (direkter Insert via API)
--   konnte ein Event ueberbuchen. interest_count wird zwar server-seitig
--   per AFTER-Trigger (trg_event_interest_count) gepflegt, aber nichts
--   blockierte den Insert ueber das Limit hinaus.
--
-- Fix: BEFORE INSERT/UPDATE-Trigger auf event_interests. Sperrt die
-- events-Zeile (FOR UPDATE) -> serialisiert gleichzeitige Anmeldungen,
-- keine Race-Condition. max_participants NULL oder 0 = unbegrenzt.
-- =============================================================

CREATE OR REPLACE FUNCTION public.enforce_event_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_max   integer;
    v_count integer;
    v_becomes_going boolean;
BEGIN
    -- Wird diese Zeile zu einer aktiven "going"-Anmeldung?
    v_becomes_going := (
        (TG_OP = 'INSERT' AND NEW.status = 'going')
        OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'going' AND NEW.status = 'going')
    );

    IF NOT v_becomes_going THEN
        RETURN NEW;  -- Abmeldung / interested / not_going -> kein Limit-Check
    END IF;

    -- events-Zeile sperren -> gleichzeitige Anmeldungen werden serialisiert
    SELECT max_participants, interest_count
      INTO v_max, v_count
      FROM public.events
     WHERE id = NEW.event_id
     FOR UPDATE;

    -- NULL oder 0 = unbegrenzt
    IF v_max IS NOT NULL AND v_max > 0 AND coalesce(v_count, 0) >= v_max THEN
        RAISE EXCEPTION 'Event ist ausgebucht (% / % Plätze)', v_count, v_max
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END $$;

-- BEFORE (vor dem AFTER-Trigger der interest_count hochzaehlt)
DROP TRIGGER IF EXISTS trg_enforce_event_capacity ON public.event_interests;
CREATE TRIGGER trg_enforce_event_capacity
    BEFORE INSERT OR UPDATE ON public.event_interests
    FOR EACH ROW EXECUTE FUNCTION public.enforce_event_capacity();
