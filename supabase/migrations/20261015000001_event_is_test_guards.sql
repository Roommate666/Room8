-- Audit-Fixes (15.10.2026): is_test-Guards fuer Event-Push/Mail + set_app_flag Key-Allowlist.
-- Grund: seit is_test-Rollout (20261014) duerfen Test-Events KEINE echten Reminder-Pushs /
-- Signup-Mails an echte User ausloesen. Funktionsrumpf 1:1 aus pg_get_functiondef uebernommen,
-- nur der is_test-Guard ergaenzt. CREATE OR REPLACE ist atomar (bei Fehler bleibt die alte Version).

-- 1. notify_event_signup: Test-Event-Anmeldungen schicken KEINE Mail an den Veranstalter
CREATE OR REPLACE FUNCTION public.notify_event_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_notify text;
    v_title text;
    v_count int;
    v_name text;
    v_email text;
    v_url text;
    v_is_test boolean;
BEGIN
    -- Nur bei "going" benachrichtigen (interested/not_going ignorieren)
    IF NEW.status IS DISTINCT FROM 'going' THEN
        RETURN NEW;
    END IF;

    SELECT signup_notify_email, title, COALESCE(is_test, false)
      INTO v_notify, v_title, v_is_test
      FROM public.events WHERE id = NEW.event_id;

    -- Test-Events loesen keine Veranstalter-Mail aus
    IF v_is_test THEN
        RETURN NEW;
    END IF;

    IF v_notify IS NULL OR v_notify = '' THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(full_name, username, 'Unbekannt'), email
      INTO v_name, v_email
      FROM public.profiles WHERE id = NEW.user_id;

    SELECT count(*) INTO v_count
      FROM public.event_interests WHERE event_id = NEW.event_id AND status = 'going';

    v_url := coalesce(current_setting('app.supabase_url', true),
                      'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';

    PERFORM net.http_post(
        url     := v_url,
        headers := public.app_internal_headers(),
        body    := jsonb_build_object(
            'to',      v_notify,
            'subject', 'Neue Anmeldung: ' || coalesce(v_title, 'Event') || ' (' || v_count || ')',
            'html',    '<h2>Neue Anmeldung</h2>'
                    || '<p><strong>' || coalesce(v_name, 'Student') || '</strong> hat sich angemeldet.</p>'
                    || '<p>E-Mail: <a href="mailto:' || coalesce(v_email, '') || '">' || coalesce(v_email, 'keine') || '</a></p>'
                    || '<p>Event: ' || coalesce(v_title, '') || '</p>'
                    || '<p>Anmeldungen gesamt: ' || v_count || '</p>'
        )
    );

    RETURN NEW;
END;
$function$;

-- 2. send_event_reminders: Test-Events loesen keine Reminder-Pushs/In-App-Notifications aus
CREATE OR REPLACE FUNCTION public.send_event_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_event record;
    v_interest record;
    v_reminder_type text;
    v_minutes_until int;
    v_when_local text;
    v_push_title text;
    v_push_body text;
    v_link text;
    v_short_title text;
    v_supabase_url text;
    v_service_role_key text;
    v_receiver_token text;
BEGIN
    v_supabase_url := COALESCE(current_setting('app.settings.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co');
    v_service_role_key := current_setting('app.settings.service_role_key', true);

    -- Events die in 24h+/-5min ODER 1h+/-5min starten
    FOR v_event IN
        SELECT *,
            CASE
                WHEN start_at BETWEEN now() + interval '23 hours 55 minutes' AND now() + interval '24 hours 5 minutes' THEN '24h'
                WHEN start_at BETWEEN now() + interval '55 minutes' AND now() + interval '65 minutes' THEN '1h'
                ELSE NULL
            END AS reminder_window
        FROM public.events
        WHERE status = 'active'
        AND COALESCE(is_test, false) = false
        AND (
            start_at BETWEEN now() + interval '23 hours 55 minutes' AND now() + interval '24 hours 5 minutes'
            OR start_at BETWEEN now() + interval '55 minutes' AND now() + interval '65 minutes'
        )
    LOOP
        v_reminder_type := v_event.reminder_window;
        v_when_local := to_char(v_event.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI');

        -- Title kuerzen analog notify_event_change
        v_short_title := LEFT(v_event.title, 40);
        IF LENGTH(v_event.title) > 40 THEN
            v_short_title := v_short_title || '...';
        END IF;

        IF v_reminder_type = '24h' THEN
            v_push_title := 'Morgen: ' || v_short_title;
            v_push_body := 'Erinnerung: Dein Event "' || v_event.title || '" startet morgen um ' || v_when_local || ' Uhr in ' || COALESCE(v_event.location, v_event.city, '') || '.';
        ELSE
            v_push_title := 'In 1 Stunde: ' || v_short_title;
            v_push_body := 'Es geht los! Dein Event startet um ' || v_when_local || ' Uhr in ' || COALESCE(v_event.location, v_event.city, '') || '.';
        END IF;

        v_link := 'event-detail.html?id=' || v_event.id::text;

        FOR v_interest IN
            SELECT ei.user_id
            FROM public.event_interests ei
            WHERE ei.event_id = v_event.id
            AND ei.status = 'going'
            AND ei.user_id IS NOT NULL
            -- Idempotenz: nur User die noch keinen Reminder bekommen haben
            AND NOT EXISTS (
                SELECT 1 FROM public.event_reminders_sent ers
                WHERE ers.event_id = v_event.id
                AND ers.user_id = ei.user_id
                AND ers.reminder_type = v_reminder_type
            )
        LOOP
            -- Reminder-Tracking SOFORT eintragen (verhindert Doppel bei Cron-Overlap)
            BEGIN
                INSERT INTO public.event_reminders_sent (event_id, user_id, reminder_type)
                VALUES (v_event.id, v_interest.user_id, v_reminder_type);
            EXCEPTION WHEN unique_violation THEN
                CONTINUE;
            END;

            -- In-App Notification
            BEGIN
                INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
                VALUES (
                    v_interest.user_id,
                    'event_reminder_' || v_reminder_type,
                    v_push_title,
                    v_push_body,
                    v_link,
                    false
                );
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'reminder notification insert failed: %', SQLERRM;
            END;

            -- Native Push via FCM
            SELECT fcm_token INTO v_receiver_token FROM public.profiles WHERE id = v_interest.user_id;
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
                                'eventId', v_event.id::text,
                                'reminderType', v_reminder_type
                            )
                        )
                    );
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'reminder push failed for user %: %', v_interest.user_id, SQLERRM;
                END;
            END IF;
        END LOOP;
    END LOOP;
END;
$function$;

-- 3. set_app_flag: Key-Allowlist (Admin kann nur bekannte Flags setzen, keine beliebigen Keys)
CREATE OR REPLACE FUNCTION public.set_app_flag(p_key text, p_value boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_key NOT IN ('events_enabled') THEN
    RAISE EXCEPTION 'unknown config key: %', p_key;
  END IF;
  INSERT INTO public.app_config(key, value, updated_at)
    VALUES (p_key, p_value, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_value;
END $$;
