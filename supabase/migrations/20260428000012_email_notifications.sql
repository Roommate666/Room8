-- =============================================================
-- Email-Notifications via Resend Edge Function
--
-- Erweitert bestehende Trigger/RPCs um zusaetzlich E-Mail zu senden
-- (parallel zu In-App Notification + FCM Push)
--
-- Voraussetzung: RESEND_API_KEY in Supabase Secrets (vorhanden)
-- Voraussetzung: send-email Edge Function deployed (geschehen)
-- Stand 2026-04-28
-- =============================================================

-- =============================================================
-- HELPER: send_user_email
-- Holt User-Email + ruft Edge Function via pg_net auf
-- =============================================================
CREATE OR REPLACE FUNCTION public.send_user_email(
    target_user_id uuid,
    subject_input text,
    html_input text
)
RETURNS void AS $$
DECLARE
    v_email text;
    v_supabase_url text;
    v_service_role_key text;
BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = target_user_id;

    IF v_email IS NULL OR v_email = '' THEN
        RETURN;
    END IF;

    v_supabase_url := COALESCE(current_setting('app.settings.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co');
    v_service_role_key := current_setting('app.settings.service_role_key', true);

    BEGIN
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/send-email',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(v_service_role_key, current_setting('request.jwt.claim.sub', true))
            ),
            body := jsonb_build_object(
                'to', v_email,
                'subject', subject_input,
                'html', html_input
            )
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'send_user_email failed for %: %', target_user_id, SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- HELPER: HTML-Email-Template
-- Einheitliches Branding, weniger Code-Duplikation
-- =============================================================
CREATE OR REPLACE FUNCTION public.email_template(
    headline text,
    body_html text,
    cta_text text DEFAULT NULL,
    cta_url text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
    v_cta_html text := '';
BEGIN
    IF cta_text IS NOT NULL AND cta_url IS NOT NULL THEN
        v_cta_html := '<div style="margin: 32px 0; text-align: center;">' ||
            '<a href="' || cta_url || '" style="display:inline-block; padding:14px 32px; background:linear-gradient(135deg,#3B82F6,#2563EB); color:white; border-radius:999px; text-decoration:none; font-weight:700; font-size:15px;">' ||
            cta_text || '</a></div>';
    END IF;

    RETURN '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' ||
        '<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; background:#F3F4F6; margin:0; padding:24px;">' ||
        '<div style="max-width:560px; margin:0 auto; background:white; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.06);">' ||
            '<div style="padding:24px 28px; background:linear-gradient(135deg,#3B82F6,#2563EB); color:white;">' ||
                '<div style="font-size:22px; font-weight:800; letter-spacing:-0.02em;">Room8</div>' ||
            '</div>' ||
            '<div style="padding:32px 28px;">' ||
                '<h1 style="font-size:22px; color:#111827; margin:0 0 16px; font-weight:700;">' || headline || '</h1>' ||
                '<div style="color:#374151; font-size:15px; line-height:1.6;">' || body_html || '</div>' ||
                v_cta_html ||
            '</div>' ||
            '<div style="padding:20px 28px; background:#F9FAFB; border-top:1px solid #E5E7EB; color:#9CA3AF; font-size:12px; text-align:center;">' ||
                'Room8 - Dein Campus. Dein Deal.<br>' ||
                '<a href="https://www.room8.club" style="color:#9CA3AF;">www.room8.club</a>' ||
            '</div>' ||
        '</div></body></html>';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================
-- ÜBERSCHREIBE: admin_set_event_creator (jetzt mit Email)
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_set_event_creator(
    target_user_id uuid,
    can_create boolean
)
RETURNS json AS $$
DECLARE
    v_is_admin boolean;
    v_user_exists boolean;
    v_subject text;
    v_html text;
BEGIN
    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles WHERE id = auth.uid();

    IF NOT v_is_admin THEN
        RETURN json_build_object('success', false, 'error', 'not_admin');
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = target_user_id) INTO v_user_exists;
    IF NOT v_user_exists THEN
        RETURN json_build_object('success', false, 'error', 'user_not_found');
    END IF;

    PERFORM set_config('app.system_update', 'on', true);
    UPDATE public.profiles
    SET can_create_events = can_create
    WHERE id = target_user_id;
    PERFORM set_config('app.system_update', 'off', true);

    -- In-App
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

    -- Email
    IF can_create THEN
        v_subject := 'Du kannst jetzt Events auf Room8 erstellen';
        v_html := public.email_template(
            'Event-Erlaubnis erteilt',
            '<p>Wir haben dich als Event-Veranstalter freigeschaltet. Du kannst ab sofort eigene Events auf Room8 veröffentlichen.</p>' ||
            '<p>Dein erstes Event ist nur einen Klick entfernt.</p>',
            'Event erstellen',
            'https://www.room8.club/event-create.html'
        );
    ELSE
        v_subject := 'Event-Erlaubnis zurückgenommen';
        v_html := public.email_template(
            'Event-Erlaubnis zurückgenommen',
            '<p>Deine Erlaubnis Events auf Room8 zu erstellen wurde von einem Admin zurückgenommen.</p>' ||
            '<p>Falls du das für einen Fehler hältst, melde dich gerne bei uns.</p>',
            NULL, NULL
        );
    END IF;

    PERFORM public.send_user_email(target_user_id, v_subject, v_html);

    RETURN json_build_object('success', true, 'can_create_events', can_create);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- ÜBERSCHREIBE: admin_review_event_creator_request (jetzt mit Email)
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
    v_subject text;
    v_html text;
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

        v_subject := 'Dein Event-Antrag wurde genehmigt';
        v_html := public.email_template(
            'Antrag genehmigt',
            '<p>Großartige Neuigkeiten! Dein Antrag, Events für <strong>' || v_organization_name ||
            '</strong> auf Room8 zu veröffentlichen, wurde genehmigt.</p>' ||
            '<p>Du kannst ab sofort eigene Events erstellen.</p>',
            'Erstes Event erstellen',
            'https://www.room8.club/event-create.html'
        );
    ELSE
        v_push_title := 'Antrag abgelehnt';
        v_push_body := COALESCE(rejection_reason_input, 'Dein Antrag auf Event-Erlaubnis wurde abgelehnt.');
        v_link := 'events.html';

        v_subject := 'Dein Event-Antrag wurde leider abgelehnt';
        v_html := public.email_template(
            'Antrag abgelehnt',
            '<p>Wir haben deinen Antrag, Events für <strong>' || v_organization_name ||
            '</strong> zu veröffentlichen, leider abgelehnt.</p>' ||
            CASE WHEN rejection_reason_input IS NOT NULL AND LENGTH(TRIM(rejection_reason_input)) > 0
                 THEN '<p style="background:#FEF3C7;border-left:3px solid #F59E0B;padding:12px;border-radius:6px;color:#78350F;"><strong>Grund:</strong><br>' ||
                      replace(rejection_reason_input, chr(10), '<br>') || '</p>'
                 ELSE ''
            END ||
            '<p>Falls du Rückfragen hast, antworte einfach auf diese E-Mail.</p>',
            NULL, NULL
        );
    END IF;

    -- In-App
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
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Native Push
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

    -- Email
    PERFORM public.send_user_email(v_target_user_id, v_subject, v_html);

    RETURN json_build_object('success', true, 'status', new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- ÜBERSCHREIBE: notify_event_change (jetzt mit Email an "going"-User)
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
    v_short_title text;
    v_email_subject text;
    v_email_html text;
    v_event_url text;
BEGIN
    IF COALESCE(NEW.end_at, NEW.start_at + interval '4 hours') < now() THEN
        RETURN NEW;
    END IF;

    v_short_title := LEFT(NEW.title, 40);
    IF LENGTH(NEW.title) > 40 THEN
        v_short_title := v_short_title || '...';
    END IF;

    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        v_change_type := 'cancelled';
        v_push_title := 'Event abgesagt: ' || v_short_title;
        v_push_body := 'Das Event "' || NEW.title || '" wurde leider abgesagt.';
        v_email_subject := 'Event abgesagt: ' || NEW.title;
        v_email_html := public.email_template(
            'Event abgesagt',
            '<p>Das Event <strong>' || NEW.title || '</strong>, für das du dich angemeldet hattest, wurde leider abgesagt.</p>' ||
            CASE WHEN NEW.organizer_name IS NOT NULL
                 THEN '<p>Veranstalter: ' || NEW.organizer_name || '</p>' ELSE '' END,
            NULL, NULL
        );

    ELSIF NEW.start_at IS DISTINCT FROM OLD.start_at THEN
        v_change_type := 'time_changed';
        v_old_when := to_char(OLD.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI');
        v_when := to_char(NEW.start_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI');
        v_push_title := 'Event verschoben: ' || v_short_title;
        v_push_body := 'Neuer Termin: ' || v_when || ' Uhr (vorher ' || v_old_when || ')';
        v_email_subject := 'Event verschoben: ' || NEW.title;
        v_email_html := public.email_template(
            'Event verschoben',
            '<p>Das Event <strong>' || NEW.title || '</strong> hat einen neuen Termin.</p>' ||
            '<p style="background:#F0FDFA;border-left:3px solid #14B8A6;padding:12px;border-radius:6px;">' ||
            '<strong>Neu:</strong> ' || v_when || ' Uhr<br>' ||
            '<span style="color:#6B7280;text-decoration:line-through;">Vorher: ' || v_old_when || ' Uhr</span></p>',
            'Details ansehen',
            'https://www.room8.club/event-detail.html?id=' || NEW.id::text
        );

    ELSIF (NEW.location IS DISTINCT FROM OLD.location)
       OR (NEW.address IS DISTINCT FROM OLD.address)
       OR (NEW.city IS DISTINCT FROM OLD.city) THEN
        v_change_type := 'location_changed';
        v_push_title := 'Event-Ort geändert: ' || v_short_title;
        v_push_body := 'Neuer Ort: ' || COALESCE(NEW.location, '') ||
                       CASE WHEN NEW.city IS NOT NULL THEN ', ' || NEW.city ELSE '' END;
        v_email_subject := 'Event-Ort geändert: ' || NEW.title;
        v_email_html := public.email_template(
            'Event-Ort geändert',
            '<p>Das Event <strong>' || NEW.title || '</strong> findet an einem neuen Ort statt.</p>' ||
            '<p style="background:#F0FDFA;border-left:3px solid #14B8A6;padding:12px;border-radius:6px;">' ||
            '<strong>Neuer Ort:</strong> ' || COALESCE(NEW.location, '') ||
            CASE WHEN NEW.city IS NOT NULL THEN ', ' || NEW.city ELSE '' END || '</p>',
            'Details ansehen',
            'https://www.room8.club/event-detail.html?id=' || NEW.id::text
        );

    ELSE
        RETURN NEW;
    END IF;

    v_link := 'event-detail.html?id=' || NEW.id::text;
    v_supabase_url := COALESCE(current_setting('app.settings.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co');
    v_service_role_key := current_setting('app.settings.service_role_key', true);

    FOR v_interest IN
        SELECT user_id
        FROM public.event_interests
        WHERE event_id = NEW.id
        AND status = 'going'
        AND user_id IS NOT NULL
        AND (NEW.organizer_id IS NULL OR user_id != NEW.organizer_id)
    LOOP
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
                            'eventId', NEW.id::text,
                            'changeType', v_change_type
                        )
                    )
                );
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'event-push failed for user %: %', v_interest.user_id, SQLERRM;
            END;
        END IF;

        -- Email
        PERFORM public.send_user_email(v_interest.user_id, v_email_subject, v_email_html);
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_event_change failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
