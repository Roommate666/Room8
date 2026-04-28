-- =============================================================
-- Permission-System Security-Fixes (Test-Bot Findings)
--
-- 1. KRITISCH: Privilege-Escalation via Trigger-Race
--    User kann sich selbst trusted_organizer=true setzen,
--    auto_grant feuert VOR protect_trusted_organizer-Rollback,
--    can_create_events bleibt true obwohl trusted_organizer=false.
--    Fix: auto_grant prueft Legitimitaet (System-Flag oder Admin).
--
-- 2. WARNUNG: UNIQUE-Race in request_event_creator_permission
--    Concurrent Requests werfen unique_violation, kein
--    sauberes JSON-Error. Fix: EXCEPTION-Handling.
--
-- 3. HINWEIS: Kein FCM-Push bei Approve/Reject - via pg_net adden
-- Stand 2026-04-28
-- =============================================================

-- =============================================================
-- FIX 1: auto_grant_event_creator mit Legitimitaetspruefung
-- AI-LOCK: Diese Function NIEMALS aendern ohne specs/permissions-system.md zu lesen.
-- Reason: Privilege-Escalation-Schutz. User koennte sonst via UPDATE trusted_organizer=true
-- sich selbst can_create_events=true setzen (Trigger-Reihenfolge-Race).
-- Test-Case: User ohne Admin/System-Flag versucht UPDATE trusted_organizer=true
-- -> beide Felder muessen false bleiben (nicht nur trusted).
-- =============================================================
CREATE OR REPLACE FUNCTION public.auto_grant_event_creator()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_is_admin boolean;
BEGIN
    -- Nur freischalten wenn legitim:
    --   a) System-Trigger (z.B. via admin_review_event_creator_request RPC)
    --   b) Caller ist Admin
    -- Sonst: User koennte via direktem UPDATE trusted_organizer=true
    -- versuchen sich freizuschalten - das wird hier abgefangen
    -- BEVOR can_create_events gesetzt wird.
    IF current_setting('app.system_update', true) <> 'on' THEN
        SELECT COALESCE(is_admin, false) INTO v_caller_is_admin
        FROM public.profiles WHERE id = auth.uid();
        IF NOT COALESCE(v_caller_is_admin, false) THEN
            RETURN NEW;
        END IF;
    END IF;

    IF (TG_OP = 'INSERT' OR OLD.trusted_organizer IS DISTINCT FROM NEW.trusted_organizer)
       AND NEW.trusted_organizer = true THEN
        NEW.can_create_events := true;
    END IF;
    IF (TG_OP = 'INSERT' OR OLD.is_admin IS DISTINCT FROM NEW.is_admin)
       AND NEW.is_admin = true THEN
        NEW.can_create_events := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FIX 2: request_event_creator_permission mit Exception-Handling
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

    SELECT can_create_events INTO v_can_create FROM public.profiles WHERE id = v_user_id;
    IF v_can_create = true THEN
        RETURN json_build_object('success', false, 'error', 'already_approved');
    END IF;

    SELECT id INTO v_existing_id FROM public.event_creator_requests
    WHERE user_id = v_user_id AND status = 'pending';
    IF v_existing_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'already_pending');
    END IF;

    IF LENGTH(TRIM(organization_name_input)) < 2 OR LENGTH(organization_name_input) > 200 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_organization_name');
    END IF;
    IF LENGTH(TRIM(reason_input)) < 10 OR LENGTH(reason_input) > 1000 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_reason');
    END IF;

    -- Insert mit Race-Schutz
    BEGIN
        INSERT INTO public.event_creator_requests (user_id, organization_name, organization_type, reason)
        VALUES (v_user_id, organization_name_input, organization_type_input, reason_input);
    EXCEPTION WHEN unique_violation THEN
        RETURN json_build_object('success', false, 'error', 'already_pending');
    END;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- FIX 3: admin_review_event_creator_request mit FCM-Push
-- (zusaetzlich zur In-App Notification)
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
    v_supabase_url text;
    v_service_role_key text;
    v_receiver_token text;
    v_push_title text;
    v_push_body text;
    v_link text;
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
        v_push_title := 'Event-Erlaubnis genehmigt';
        v_push_body := 'Du kannst ab sofort Events für ' || v_organization_name || ' veröffentlichen.';
        v_link := 'event-create.html';

        PERFORM set_config('app.system_update', 'on', true);
        UPDATE public.profiles
        SET can_create_events = true,
            trusted_organizer = CASE
                WHEN v_organization_type IN ('asta', 'university') THEN true
                ELSE trusted_organizer
            END
        WHERE id = v_target_user_id;
        PERFORM set_config('app.system_update', 'off', true);
    ELSE
        v_push_title := 'Antrag abgelehnt';
        v_push_body := COALESCE(rejection_reason_input, 'Dein Antrag auf Event-Erlaubnis wurde abgelehnt.');
        v_link := 'events.html';
    END IF;

    -- In-App Notification
    BEGIN
        INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
        VALUES (
            v_target_user_id,
            CASE WHEN new_status = 'approved' THEN 'event_creator_approved' ELSE 'event_creator_rejected' END,
            v_push_title,
            v_push_body,
            v_link,
            false
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'creator review notification insert failed: %', SQLERRM;
    END;

    -- Native FCM-Push
    SELECT fcm_token INTO v_receiver_token FROM public.profiles WHERE id = v_target_user_id;
    IF v_receiver_token IS NOT NULL THEN
        v_supabase_url := COALESCE(current_setting('app.settings.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co');
        v_service_role_key := current_setting('app.settings.service_role_key', true);
        BEGIN
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-push',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || COALESCE(v_service_role_key, current_setting('request.jwt.claim.sub', true))
                ),
                body := jsonb_build_object(
                    'userId', v_target_user_id,
                    'title', v_push_title,
                    'body', v_push_body,
                    'data', jsonb_build_object('url', v_link, 'reviewType', new_status)
                )
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'creator review push failed: %', SQLERRM;
        END;
    END IF;

    RETURN json_build_object('success', true, 'status', new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
