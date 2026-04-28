-- =============================================================
-- Event-Reminder System (24h + 1h vor Event-Start)
-- + Mark-Past-Events Cron-Schedule
--
-- VORAUSSETZUNG: pg_cron Extension muss aktiv sein
--   - Aktivieren via Supabase Dashboard: Database > Extensions > pg_cron
--   - Falls nicht aktiv: Function-Definitionen werden erstellt,
--     Cron-Jobs werden NICHT geschedulet (defensive guards unten)
-- Stand 2026-04-28
-- =============================================================

-- =============================================================
-- TABELLE: event_reminders_sent
-- Idempotenz-Tracking, damit jeder Reminder nur 1x pro User+Event geht
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event_reminders_sent (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reminder_type text NOT NULL,
    sent_at timestamptz DEFAULT now(),
    UNIQUE(event_id, user_id, reminder_type),
    CONSTRAINT reminder_type_check CHECK (reminder_type IN ('24h', '1h'))
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_sent_event ON public.event_reminders_sent(event_id);

ALTER TABLE public.event_reminders_sent ENABLE ROW LEVEL SECURITY;

-- Reminder-Tabelle ist nur fuer System-Funktionen relevant, nicht fuer User
DROP POLICY IF EXISTS "event_reminders_sent_admin_only" ON public.event_reminders_sent;
CREATE POLICY "event_reminders_sent_admin_only" ON public.event_reminders_sent
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- =============================================================
-- FUNKTION: send_event_reminders
-- Wird per pg_cron alle 5 Minuten aufgerufen
-- Sucht Events die in 24h±5min oder 1h±5min starten und sendet
-- Reminder an alle "going"-User die noch keinen Reminder bekommen haben
-- =============================================================
CREATE OR REPLACE FUNCTION public.send_event_reminders()
RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.send_event_reminders() TO postgres;

-- =============================================================
-- CRON-SCHEDULES (defensive: nur wenn pg_cron aktiv)
-- =============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Alte Schedules aufraeumen falls schon vorhanden
        PERFORM cron.unschedule('event-reminders');
        PERFORM cron.unschedule('mark-past-events');

        -- Reminder alle 5 Minuten
        PERFORM cron.schedule(
            'event-reminders',
            '*/5 * * * *',
            $cmd$ SELECT public.send_event_reminders(); $cmd$
        );

        -- Past-Events markieren stuendlich (kosmetisch, frontend filtert eh)
        PERFORM cron.schedule(
            'mark-past-events',
            '0 * * * *',
            $cmd$ SELECT public.mark_past_events(); $cmd$
        );

        RAISE NOTICE 'pg_cron schedules created: event-reminders + mark-past-events';
    ELSE
        RAISE WARNING 'pg_cron extension NOT enabled. Reminder system idle. Enable via Supabase Dashboard > Extensions > pg_cron';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cron schedule failed (pg_cron may not be available): %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.send_event_reminders IS '24h + 1h Push-Reminder fuer Events mit pg_cron-Trigger alle 5 Min.';
