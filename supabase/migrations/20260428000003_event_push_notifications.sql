-- =============================================================
-- Push-Notifications fuer Events (Phase 1: Cancel + Change)
-- Pattern uebernommen von notify_new_message (chat-push-trigger)
-- Stand 2026-04-28
-- =============================================================

-- =============================================================
-- FUNKTION: notify_event_change
-- Feuert wenn ein Event geaendert oder abgesagt wird
-- Sendet an alle User die mit status='going' im event_interests sind
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_event_change()
RETURNS TRIGGER AS $$
DECLARE
    v_supabase_url text;
    v_service_role_key text;
    v_change_type text;
    v_push_title text;
    v_push_body text;
    v_link text;
    v_interest record;
    v_receiver_token text;
    v_when text;
    v_old_when text;
BEGIN
    -- Aenderung klassifizieren (Cancellation hat Vorrang)
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        v_change_type := 'cancelled';
        v_push_title := 'Event abgesagt: ' || NEW.title;
        v_push_body := 'Das Event "' || NEW.title || '" wurde leider abgesagt.';

    ELSIF NEW.start_at IS DISTINCT FROM OLD.start_at THEN
        v_change_type := 'time_changed';
        v_old_when := to_char(OLD.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI');
        v_when := to_char(NEW.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI');
        v_push_title := 'Event verschoben: ' || NEW.title;
        v_push_body := 'Neuer Termin: ' || v_when || ' Uhr (vorher ' || v_old_when || ')';

    ELSIF (NEW.location IS DISTINCT FROM OLD.location)
       OR (NEW.address IS DISTINCT FROM OLD.address)
       OR (NEW.city IS DISTINCT FROM OLD.city) THEN
        v_change_type := 'location_changed';
        v_push_title := 'Event-Ort geaendert: ' || NEW.title;
        v_push_body := 'Neuer Ort: ' || COALESCE(NEW.location, '') ||
                       CASE WHEN NEW.city IS NOT NULL THEN ', ' || NEW.city ELSE '' END;

    ELSE
        -- Keine relevante Aenderung
        RETURN NEW;
    END IF;

    v_link := 'event-detail.html?id=' || NEW.id::text;
    v_supabase_url := COALESCE(current_setting('app.settings.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co');
    v_service_role_key := current_setting('app.settings.service_role_key', true);

    -- Loop ueber alle "going"-User (NULL-reporter ausschliessen analog auto-hide)
    FOR v_interest IN
        SELECT user_id
        FROM public.event_interests
        WHERE event_id = NEW.id
        AND status = 'going'
        AND user_id IS NOT NULL
        AND user_id != COALESCE(NEW.organizer_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
        -- 1. In-App Notification (notifications-Tabelle)
        BEGIN
            INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
            VALUES (
                v_interest.user_id,
                'event_' || v_change_type,
                v_push_title,
                v_push_body,
                v_link,
                false
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'event-notification insert failed: %', SQLERRM;
        END;

        -- 2. Native Push via FCM (nur wenn Token vorhanden)
        SELECT fcm_token INTO v_receiver_token
        FROM public.profiles
        WHERE id = v_interest.user_id;

        IF v_receiver_token IS NOT NULL THEN
            BEGIN
                PERFORM net.http_post(
                    url := v_supabase_url || '/functions/v1/send-push',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || COALESCE(v_service_role_key, current_setting('request.jwt.claim.sub', true))
                    ),
                    body := jsonb_build_object(
                        'userId', v_interest.user_id,
                        'title', v_push_title,
                        'body', v_push_body,
                        'data', jsonb_build_object(
                            'url', v_link,
                            'eventId', NEW.id::text,
                            'changeType', v_change_type
                        )
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'event-push failed for user %: %', v_interest.user_id, SQLERRM;
            END;
        END IF;
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_event_change failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- TRIGGER: Auf events UPDATE
-- =============================================================
DROP TRIGGER IF EXISTS trg_event_change_notify ON public.events;
CREATE TRIGGER trg_event_change_notify
    AFTER UPDATE ON public.events
    FOR EACH ROW
    WHEN (
        OLD.status IS DISTINCT FROM NEW.status
        OR OLD.start_at IS DISTINCT FROM NEW.start_at
        OR OLD.location IS DISTINCT FROM NEW.location
        OR OLD.address IS DISTINCT FROM NEW.address
        OR OLD.city IS DISTINCT FROM NEW.city
    )
    EXECUTE FUNCTION public.notify_event_change();

COMMENT ON FUNCTION public.notify_event_change IS 'Push + In-App Notification an "going" User wenn Event abgesagt/verschoben/Ort geaendert.';
