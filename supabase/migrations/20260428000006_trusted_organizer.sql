-- =============================================================
-- Trusted Organizer System
--
-- AStAs, Hochschul-Accounts und Vereine bekommen `trusted_organizer = true`
-- Ihre Events koennen `is_official = true` markiert werden (Badge "Offiziell")
-- Plus: Sie duerfen privilegierte organizer_type Werte setzen
-- (university, asta, partner)
-- Stand 2026-04-28
-- =============================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS trusted_organizer boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_trusted_organizer
ON public.profiles(trusted_organizer)
WHERE trusted_organizer = true;

COMMENT ON COLUMN public.profiles.trusted_organizer IS 'Erlaubt is_official=true bei Events (z.B. AStA, Uni, Vereine). Nur Admin darf setzen.';

-- =============================================================
-- protect_events_admin_fields aktualisieren
-- Trusted-Organizer duerfen is_official + privilegierte organizer_types setzen
-- Admin behaelt volle Kontrolle ueber alle Felder
-- =============================================================
CREATE OR REPLACE FUNCTION public.protect_events_admin_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin boolean;
    v_is_trusted boolean;
BEGIN
    -- System-Trigger Bypass (z.B. auto_hide_reported_events)
    IF current_setting('app.system_update', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT
        COALESCE(is_admin, false),
        COALESCE(trusted_organizer, false)
    INTO v_is_admin, v_is_trusted
    FROM public.profiles WHERE id = auth.uid();

    -- Admin: kein Lock, alles erlaubt
    IF v_is_admin THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- view_count und interest_count immer auf Default zwingen
        NEW.view_count := 0;
        NEW.interest_count := 0;

        -- Trusted-Organizer: darf is_official + privilegierte types
        IF v_is_trusted THEN
            NEW.organizer_type := COALESCE(NEW.organizer_type, 'student');
        ELSE
            NEW.is_official := false;
            NEW.organizer_type := COALESCE(NEW.organizer_type, 'student');
            IF NEW.organizer_type IN ('university', 'asta', 'partner', 'admin') THEN
                NEW.organizer_type := 'student';
            END IF;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- view_count + interest_count koennen nur durch Trigger geaendert werden
        NEW.view_count := OLD.view_count;
        NEW.interest_count := OLD.interest_count;

        IF v_is_trusted THEN
            -- Trusted: darf is_official + organizer_type weiter aendern
            NULL;
        ELSE
            NEW.is_official := OLD.is_official;
            NEW.organizer_type := OLD.organizer_type;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- RLS-Policy: Nur Admin darf trusted_organizer Flag aendern
-- (User darf eigenes Profil zwar editieren, aber nicht den Flag)
--
-- profiles hat schon RLS - hier ein BEFORE UPDATE Trigger
-- =============================================================
CREATE OR REPLACE FUNCTION public.protect_trusted_organizer()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    IF current_setting('app.system_update', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = auth.uid();

    IF NOT v_is_admin AND OLD.trusted_organizer IS DISTINCT FROM NEW.trusted_organizer THEN
        NEW.trusted_organizer := OLD.trusted_organizer;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profiles_protect_trusted ON public.profiles;
CREATE TRIGGER trg_profiles_protect_trusted
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_trusted_organizer();

-- =============================================================
-- RPC: Admin-Helper um Trusted-Status zu setzen
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_set_trusted_organizer(
    target_user_id uuid,
    is_trusted boolean
)
RETURNS json AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = auth.uid();

    IF NOT v_is_admin THEN
        RETURN json_build_object('success', false, 'error', 'not_admin');
    END IF;

    -- Bypass setzen damit der Profile-Trigger durchlaesst
    PERFORM set_config('app.system_update', 'on', true);
    UPDATE public.profiles SET trusted_organizer = is_trusted WHERE id = target_user_id;
    PERFORM set_config('app.system_update', 'off', true);

    RETURN json_build_object('success', true, 'user_id', target_user_id, 'trusted', is_trusted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_set_trusted_organizer(uuid, boolean) TO authenticated;
