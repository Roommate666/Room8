-- =============================================================
-- Event Creator Permissions: Whitelist-Modell
--
-- Ab jetzt darf NICHT mehr jeder verifizierte Student Events erstellen.
-- Stattdessen muss `profiles.can_create_events = true` sein.
--
-- Wege fuer User um diese Erlaubnis zu bekommen:
--   1. Admin schaltet manuell frei
--   2. User wird trusted_organizer -> auto-Freischaltung
--   3. User stellt Antrag via event_creator_requests -> Admin approved
-- Stand 2026-04-28
-- =============================================================

-- =============================================================
-- 1. SPALTE: profiles.can_create_events
-- =============================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS can_create_events boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_can_create_events
ON public.profiles(can_create_events) WHERE can_create_events = true;

COMMENT ON COLUMN public.profiles.can_create_events IS 'Erlaubnis Events zu erstellen. Default false. Wird vom Admin manuell oder via Antrag freigeschaltet.';

-- Bestehende Trusted-Organizer auto-freischalten (Bypass via System-Flag)
DO $$
BEGIN
    PERFORM set_config('app.system_update', 'on', true);
    UPDATE public.profiles SET can_create_events = true WHERE trusted_organizer = true;
    -- Admin-Accounts auch freischalten
    UPDATE public.profiles SET can_create_events = true WHERE is_admin = true;
    PERFORM set_config('app.system_update', 'off', true);
END $$;

-- =============================================================
-- 2. TABELLE: event_creator_requests
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event_creator_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_name text NOT NULL,
    organization_type text NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending',
    reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    rejection_reason text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT request_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT request_org_type_check CHECK (organization_type IN ('asta', 'university', 'student_association', 'partner', 'private', 'other'))
);

-- Nur 1 pending Request pro User
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_creator_requests_one_pending
ON public.event_creator_requests(user_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_event_creator_requests_status
ON public.event_creator_requests(status);

ALTER TABLE public.event_creator_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ecr_self_read" ON public.event_creator_requests;
CREATE POLICY "ecr_self_read" ON public.event_creator_requests
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ecr_self_insert" ON public.event_creator_requests;
CREATE POLICY "ecr_self_insert" ON public.event_creator_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "ecr_self_cancel" ON public.event_creator_requests;
CREATE POLICY "ecr_self_cancel" ON public.event_creator_requests
    FOR UPDATE USING (auth.uid() = user_id AND status = 'pending')
    WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'cancelled'));

DROP POLICY IF EXISTS "ecr_admin_all" ON public.event_creator_requests;
CREATE POLICY "ecr_admin_all" ON public.event_creator_requests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- =============================================================
-- 3. RPC: User stellt Antrag
-- =============================================================
CREATE OR REPLACE FUNCTION public.request_event_creator_permission(
    organization_name_input text,
    organization_type_input text,
    reason_input text
)
RETURNS json AS $$
DECLARE
    v_user_id uuid;
    v_can_create boolean;
    v_existing_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- Pruefen ob schon freigeschaltet
    SELECT can_create_events INTO v_can_create FROM public.profiles WHERE id = v_user_id;
    IF v_can_create = true THEN
        RETURN json_build_object('success', false, 'error', 'already_approved');
    END IF;

    -- Pruefen ob schon ein pending Request existiert
    SELECT id INTO v_existing_id FROM public.event_creator_requests
    WHERE user_id = v_user_id AND status = 'pending';
    IF v_existing_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'already_pending');
    END IF;

    -- Validierung
    IF LENGTH(TRIM(organization_name_input)) < 2 OR LENGTH(organization_name_input) > 200 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_organization_name');
    END IF;
    IF LENGTH(TRIM(reason_input)) < 10 OR LENGTH(reason_input) > 1000 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_reason');
    END IF;

    INSERT INTO public.event_creator_requests (user_id, organization_name, organization_type, reason)
    VALUES (v_user_id, organization_name_input, organization_type_input, reason_input);

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.request_event_creator_permission(text, text, text) TO authenticated;

-- =============================================================
-- 4. RPC: Admin approved/rejects einen Antrag
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_review_event_creator_request(
    request_id_input uuid,
    new_status text,
    rejection_reason_input text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_admin_id uuid;
    v_is_admin boolean;
    v_target_user_id uuid;
    v_organization_name text;
    v_organization_type text;
BEGIN
    v_admin_id := auth.uid();

    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = v_admin_id;

    IF NOT v_is_admin THEN
        RETURN json_build_object('success', false, 'error', 'not_admin');
    END IF;

    IF new_status NOT IN ('approved', 'rejected') THEN
        RETURN json_build_object('success', false, 'error', 'invalid_status');
    END IF;

    -- Request laden
    SELECT user_id, organization_name, organization_type
    INTO v_target_user_id, v_organization_name, v_organization_type
    FROM public.event_creator_requests
    WHERE id = request_id_input AND status = 'pending';

    IF v_target_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'request_not_found');
    END IF;

    -- Status setzen
    UPDATE public.event_creator_requests
    SET status = new_status,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        rejection_reason = CASE WHEN new_status = 'rejected' THEN rejection_reason_input ELSE NULL END
    WHERE id = request_id_input;

    -- Bei Approved: User freischalten + ggf. trusted_organizer wenn AStA/Uni
    IF new_status = 'approved' THEN
        PERFORM set_config('app.system_update', 'on', true);
        UPDATE public.profiles
        SET can_create_events = true,
            -- AStA und Uni werden auto auf trusted gesetzt
            trusted_organizer = CASE
                WHEN v_organization_type IN ('asta', 'university') THEN true
                ELSE trusted_organizer
            END
        WHERE id = v_target_user_id;
        PERFORM set_config('app.system_update', 'off', true);

        -- In-App Notification + optional Push
        BEGIN
            INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
            VALUES (
                v_target_user_id,
                'event_creator_approved',
                'Du kannst jetzt Events erstellen!',
                'Dein Antrag wurde genehmigt. Du kannst ab sofort Events für ' || v_organization_name || ' veröffentlichen.',
                'event-create.html',
                false
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    ELSIF new_status = 'rejected' THEN
        BEGIN
            INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
            VALUES (
                v_target_user_id,
                'event_creator_rejected',
                'Antrag abgelehnt',
                COALESCE(rejection_reason_input, 'Dein Antrag auf Event-Erlaubnis wurde abgelehnt.'),
                'events.html',
                false
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    RETURN json_build_object('success', true, 'status', new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_review_event_creator_request(uuid, text, text) TO authenticated;

-- =============================================================
-- 5. RLS: events_verified_insert PRUEFT NEU can_create_events
-- AI-LOCK: Diese Policy garantiert dass nur freigeschaltete User Events erstellen.
-- NIEMALS durch eine offenere Policy ersetzen ohne specs/permissions-system.md zu lesen.
-- Reason: Whitelist-Modell ist Yusufs Kern-Anforderung.
-- =============================================================
DROP POLICY IF EXISTS "events_verified_insert" ON public.events;
CREATE POLICY "events_creator_insert" ON public.events
    FOR INSERT WITH CHECK (
        auth.uid() = organizer_id
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND COALESCE(can_create_events, false) = true
        )
    );

-- =============================================================
-- 6. TRIGGER: Wenn trusted_organizer = true gesetzt -> auto can_create_events
-- =============================================================
CREATE OR REPLACE FUNCTION public.auto_grant_event_creator()
RETURNS TRIGGER AS $$
BEGIN
    -- Wenn trusted_organizer NEU auf true geht: can_create_events auch
    IF (TG_OP = 'INSERT' OR OLD.trusted_organizer IS DISTINCT FROM NEW.trusted_organizer)
       AND NEW.trusted_organizer = true THEN
        NEW.can_create_events := true;
    END IF;
    -- Wenn is_admin auf true geht: ebenfalls
    IF (TG_OP = 'INSERT' OR OLD.is_admin IS DISTINCT FROM NEW.is_admin)
       AND NEW.is_admin = true THEN
        NEW.can_create_events := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_grant_event_creator ON public.profiles;
CREATE TRIGGER trg_auto_grant_event_creator
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.auto_grant_event_creator();

-- =============================================================
-- 7. TRIGGER: protect can_create_events vor Self-Set
-- (User darf das nicht selbst auf true setzen)
-- =============================================================
CREATE OR REPLACE FUNCTION public.protect_can_create_events()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    IF current_setting('app.system_update', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = auth.uid();

    -- Trigger auto_grant_event_creator hat eventuell can_create auf true gesetzt
    -- (durch trusted_organizer/is_admin Aenderung). Das ist OK weil der protect_trusted_organizer
    -- Trigger sicherstellt dass nicht-Admins das nicht setzen koennen.
    -- Hier: Nicht-Admins koennen can_create_events NICHT direkt aendern
    IF NOT v_is_admin AND TG_OP = 'UPDATE' THEN
        IF OLD.can_create_events IS DISTINCT FROM NEW.can_create_events THEN
            -- Erlaubt: durch auto_grant_event_creator (gleichzeitig mit trusted/admin Aenderung)
            -- Verboten: direkter manueller User-Edit
            IF OLD.trusted_organizer = NEW.trusted_organizer
               AND OLD.is_admin = NEW.is_admin THEN
                NEW.can_create_events := OLD.can_create_events;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profiles_protect_can_create ON public.profiles;
-- Reihenfolge: BEFORE-Trigger laufen alphabetisch nach Name
-- protect_can_create_events soll NACH auto_grant_event_creator laufen (weil A < P)
CREATE TRIGGER trg_profiles_protect_can_create
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_can_create_events();
