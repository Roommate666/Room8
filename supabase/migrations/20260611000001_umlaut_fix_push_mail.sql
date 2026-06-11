-- =============================================================
-- Echte Umlaute in user-facing Push- und Mail-Texten
-- Code-Kommentare bleiben bei ae/oe/ue (Umlaut-Regel), aber alles was der
-- User in Push/Mail SIEHT, muss echte Umlaute (ä, ö, ü, ß) haben.
-- Gefixt:
--   1. notify_job_application: "ueber" -> "über", "Vollstaendige" -> "Vollständige"
--   2. notify_new_listing_city: "koennte was fuer dich" -> "könnte was für dich"
-- Stand 2026-06-11
-- =============================================================

-- 1. Bewerbungs-Benachrichtigung (Mail an Job-Owner)
CREATE OR REPLACE FUNCTION public.notify_job_application()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_job        record;
    v_owner_mail text;
    v_to         text;
    v_url        text;
    v_letter     text;
BEGIN
    SELECT l.title, l.owner_id, l.application_email
      INTO v_job
      FROM public.listings l
     WHERE l.id = NEW.listing_id;

    IF v_job IS NULL THEN RETURN NEW; END IF;

    SELECT email INTO v_owner_mail FROM auth.users WHERE id = v_job.owner_id;
    v_to := coalesce(nullif(v_job.application_email, ''), v_owner_mail);

    -- In-App-Notification fuer eingeloggten Partner
    IF v_job.owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
        VALUES (v_job.owner_id, 'job_application',
                '📨 Neue Bewerbung',
                coalesce(NEW.applicant_name, 'Jemand') || ' hat sich auf "' || coalesce(v_job.title, 'deinen Job') || '" beworben.',
                'partner-dashboard.html', false);
        PERFORM public.notify_user_push(v_job.owner_id, 'job_application',
            '📨 Neue Bewerbung',
            coalesce(NEW.applicant_name, 'Jemand') || ' hat sich auf "' || coalesce(v_job.title, 'deinen Job') || '" beworben.',
            jsonb_build_object('url', 'partner-dashboard.html', 'ref_id', 'japp_' || NEW.id::text));
    END IF;

    -- Mail an den Job-Owner mit den Bewerber-Daten
    IF coalesce(v_to, '') <> '' THEN
        v_letter := coalesce(NEW.cover_letter, '');
        v_url := coalesce(current_setting('app.supabase_url', true), 'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
        PERFORM net.http_post(
            url := v_url,
            headers := public.app_internal_headers(),
            body := jsonb_build_object(
                'to', v_to,
                'subject', 'Neue Bewerbung: ' || coalesce(v_job.title, 'Job') || ' - Room8',
                'html',
                    '<h2>Neue Bewerbung über Room8</h2>'
                  || '<p>Du hast eine neue Bewerbung auf <strong>' || coalesce(v_job.title, 'deinen Job') || '</strong> erhalten.</p>'
                  || '<table style="border-collapse:collapse;margin:12px 0;">'
                  || '<tr><td style="padding:4px 10px;color:#6b7280;">Name</td><td style="padding:4px 10px;"><strong>' || coalesce(NEW.applicant_name, '-') || '</strong></td></tr>'
                  || '<tr><td style="padding:4px 10px;color:#6b7280;">E-Mail</td><td style="padding:4px 10px;"><a href="mailto:' || coalesce(NEW.applicant_email, '') || '">' || coalesce(NEW.applicant_email, '-') || '</a></td></tr>'
                  || '<tr><td style="padding:4px 10px;color:#6b7280;">Telefon</td><td style="padding:4px 10px;">' || coalesce(NEW.applicant_phone, '-') || '</td></tr>'
                  || '</table>'
                  || case when v_letter <> '' then '<p style="color:#6b7280;margin-bottom:4px;">Anschreiben:</p><blockquote style="border-left:3px solid #f59e0b;padding-left:12px;color:#374151;white-space:pre-wrap;">' || v_letter || '</blockquote>' else '' end
                  || case when coalesce(NEW.resume_path, '') <> '' then '<p>📎 Lebenslauf liegt bei der Bewerbung — im <a href="https://www.room8.club/partner-dashboard.html">Partner-Dashboard</a> ansehen.</p>' else '<p>Vollständige Bewerbung im <a href="https://www.room8.club/partner-dashboard.html">Partner-Dashboard</a>.</p>' end
            )
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_job_application failed: %', sqlerrm;
    RETURN NEW;
END;
$$;

-- 2. Stadt-Push fuer neue Listings (nur die Job-Body-Zeile war betroffen)
CREATE OR REPLACE FUNCTION public.notify_new_listing_city()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    user_record record;
    v_title text;
    v_body  text;
    v_link  text;
    v_kind  text;
    v_first_name text;
    v_channel text;
BEGIN
    IF coalesce(NEW.is_test, false) = true THEN RETURN NEW; END IF;
    IF NEW.city IS NULL OR trim(NEW.city) = '' THEN RETURN NEW; END IF;

    IF NEW.type IN ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') THEN
        v_kind := 'wohnung'; v_channel := 'new_listing_city';
    ELSIF NEW.type = 'job' THEN
        v_kind := 'job'; v_channel := 'new_job_city';
    ELSE
        v_kind := 'gegenstand'; v_channel := 'new_listing_city';
    END IF;

    v_link := CASE
        WHEN v_kind = 'job' THEN 'job-detail.html?id=' || NEW.id::text
        ELSE 'listing-details.html?id=' || NEW.id::text
    END;

    FOR user_record IN
        SELECT p.id, coalesce(p.full_name, p.username, '') AS name
          FROM public.profiles p
         WHERE p.id != NEW.owner_id
           AND lower(coalesce(p.city, '')) = lower(NEW.city)
           AND p.is_test = false
           AND public.should_notify(p.id, v_channel)
    LOOP
        v_first_name := split_part(user_record.name, ' ', 1);
        IF v_kind = 'wohnung' THEN
            v_title := CASE WHEN v_first_name <> '' THEN 'Hey ' || v_first_name || '! 🏠 Neue Wohnung'
                            ELSE '🏠 Neue Wohnung in ' || NEW.city END;
            v_body := 'Schau mal: ' || coalesce(NEW.title, 'Wohnung') || ' in ' || NEW.city;
        ELSIF v_kind = 'job' THEN
            v_title := CASE WHEN v_first_name <> '' THEN 'Hey ' || v_first_name || '! 💼 Neuer Job'
                            ELSE '💼 Neuer Job in ' || NEW.city END;
            v_body := coalesce(NEW.title, 'Stellenangebot') || ' — könnte was für dich sein.';
        ELSE
            v_title := CASE WHEN v_first_name <> '' THEN 'Hey ' || v_first_name || '! 📦 Marktplatz'
                            ELSE '📦 Neuer Artikel in ' || NEW.city END;
            v_body := coalesce(NEW.title, 'Neuer Artikel') || ' aus deiner Stadt.';
        END IF;

        BEGIN
            INSERT INTO public.notifications (user_id, type, title, message, link, reference_id, is_read)
            VALUES (user_record.id, v_channel, v_title, v_body, v_link, NEW.id, false);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'notification insert skipped: %', sqlerrm;
        END;

        PERFORM public.notify_user_push(
            user_record.id, v_channel, v_title, v_body,
            jsonb_build_object('url', v_link, 'channel_key', v_channel,
                               'actor_id', NEW.owner_id::text, 'kind', v_kind),
            NEW.id::text
        );
    END LOOP;
    RETURN NEW;
END;
$$;
