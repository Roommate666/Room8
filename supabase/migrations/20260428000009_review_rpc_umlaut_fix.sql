-- Umlaut-Fix in admin_review_event_creator_request Notification-Body
-- "veroeffentlichen" -> "veröffentlichen", "fuer" -> "für"
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

    SELECT user_id, organization_name, organization_type
    INTO v_target_user_id, v_organization_name, v_organization_type
    FROM public.event_creator_requests
    WHERE id = request_id_input AND status = 'pending';

    IF v_target_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'request_not_found');
    END IF;

    UPDATE public.event_creator_requests
    SET status = new_status,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        rejection_reason = CASE WHEN new_status = 'rejected' THEN rejection_reason_input ELSE NULL END
    WHERE id = request_id_input;

    IF new_status = 'approved' THEN
        PERFORM set_config('app.system_update', 'on', true);
        UPDATE public.profiles
        SET can_create_events = true,
            trusted_organizer = CASE
                WHEN v_organization_type IN ('asta', 'university') THEN true
                ELSE trusted_organizer
            END
        WHERE id = v_target_user_id;
        PERFORM set_config('app.system_update', 'off', true);

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
