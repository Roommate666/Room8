-- =============================================================
-- Admin-RPC: can_create_events direkt fuer einen User setzen
-- (ohne Antrag-Workflow - fuer manuelle Admin-Freischaltung)
-- =============================================================

CREATE OR REPLACE FUNCTION public.admin_set_event_creator(
    target_user_id uuid,
    can_create boolean
)
RETURNS json AS $$
DECLARE
    v_is_admin boolean;
    v_user_exists boolean;
BEGIN
    -- Pruefen ob Caller Admin ist
    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = auth.uid();

    IF NOT v_is_admin THEN
        RETURN json_build_object('success', false, 'error', 'not_admin');
    END IF;

    -- Pruefen ob Target-User existiert
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = target_user_id) INTO v_user_exists;
    IF NOT v_user_exists THEN
        RETURN json_build_object('success', false, 'error', 'user_not_found');
    END IF;

    -- Bypass setzen damit protect-Trigger durchlaesst
    PERFORM set_config('app.system_update', 'on', true);

    UPDATE public.profiles
    SET can_create_events = can_create
    WHERE id = target_user_id;

    PERFORM set_config('app.system_update', 'off', true);

    -- In-App Notification fuer den User
    BEGIN
        INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
        VALUES (
            target_user_id,
            CASE WHEN can_create THEN 'event_creator_granted' ELSE 'event_creator_revoked' END,
            CASE WHEN can_create THEN 'Du kannst jetzt Events erstellen!' ELSE 'Event-Erlaubnis entzogen' END,
            CASE WHEN can_create
                THEN 'Ein Admin hat dich als Event-Veranstalter freigeschaltet.'
                ELSE 'Deine Erlaubnis Events zu erstellen wurde zurückgenommen.'
            END,
            CASE WHEN can_create THEN 'event-create.html' ELSE 'events.html' END,
            false
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN json_build_object('success', true, 'can_create_events', can_create);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_set_event_creator(uuid, boolean) TO authenticated;
