-- Verify-Reminder Haertung (15.10.2026): DSGVO/UWG-Standard + Loop-Bug-Fix.
-- KEINE Regression-Behebung (die Funktion hatte nie email_marketing/Abmelde-Link) sondern Angleichung
-- an den Standard von notify_user_email. Zusaetzlich: Kandidaten-Filter in die WHERE-Klausel gezogen,
-- damit LIMIT 30 nicht von Nicht-Kandidaten (bereits d2+d7 versorgt / zu jung) aufgefressen wird und
-- die aeltesten (d7-faelligen) zuerst drankommen. Gates/Stufen/Stopp-Logik unveraendert.
CREATE OR REPLACE FUNCTION public.send_verify_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r record; v_url text; v_type text; v_body text; v_subject text; v_name text; v_tok uuid;
BEGIN
    v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
    FOR r IN
        SELECT p.id, coalesce(p.email, u.email) AS email, p.created_at, p.full_name, p.unsubscribe_token AS tok
        FROM public.profiles p JOIN auth.users u ON u.id = p.id
        WHERE p.is_student_verified IS NOT TRUE
          AND u.email_confirmed_at IS NOT NULL
          AND coalesce(p.is_test, false) = false
          AND coalesce(p.email_marketing, true) = true                     -- UWG-Opt-out respektieren
          AND coalesce(p.email, u.email) IS NOT NULL
          AND coalesce(p.email, u.email) NOT LIKE '%@room8.partner'
          AND p.created_at < now() - interval '2 days'
          AND (                                                            -- nur echte Kandidaten -> LIMIT nicht verschwenden
            NOT EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = p.id AND email_type = 'verify_d2')
            OR (p.created_at < now() - interval '7 days'
                AND EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = p.id AND email_type = 'verify_d2')
                AND NOT EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = p.id AND email_type = 'verify_d7'))
          )
        ORDER BY p.created_at ASC                                          -- aelteste (d7-faellig) zuerst
        LIMIT 30
    LOOP
        -- Stufe bestimmen (Loop-interne Absicherung; Stopp wenn beide raus)
        IF r.created_at < now() - interval '7 days'
           AND EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = r.id AND email_type = 'verify_d2')
           AND NOT EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = r.id AND email_type = 'verify_d7') THEN
            v_type := 'verify_d7';
        ELSIF NOT EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = r.id AND email_type = 'verify_d2') THEN
            v_type := 'verify_d2';
        ELSE
            CONTINUE;
        END IF;

        -- Vorname defensiv (HTML-gefaehrliche Zeichen raus, kein Injection-Vektor)
        v_name := coalesce(' ' || nullif(regexp_replace(split_part(coalesce(r.full_name,''),' ',1), '[<>&"'']', '', 'g'),''), '');
        v_tok  := r.tok;

        IF v_type = 'verify_d7' THEN
            v_subject := 'Letzte Erinnerung: deine Studentenrabatte warten 🎓';
            v_body := '<h2 style="margin:0 0 12px;font-size:22px;color:#111827;">Schade, dich zu verpassen 😢</h2>'
                || '<p style="margin:0 0 16px;">Hey' || v_name || '! Du hast dich bei UniGoat angemeldet, schaltest deine <strong>Rabatte, Jobs &amp; Events</strong> aber immer noch nicht frei. Ein einziger Schritt mit deiner Hochschul-Mail – und alles ist da, inklusive deinem <strong>Start-Guthaben 🪙</strong>.</p>'
                || '<p style="margin:0 0 22px;">Das ist unsere letzte Erinnerung. Verifizier dich jetzt in Sekunden 👇</p>'
                || '<a href="https://unigoat.de/verify-options.html" style="display:inline-block;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-family:Archivo,sans-serif;padding:14px 28px;border-radius:0;font-size:15px;">Jetzt verifizieren</a>';
        ELSE
            v_subject := 'Verifizier dich und sicher dir die Studentenrabatte 🎓';
            v_body := '<h2 style="margin:0 0 12px;font-size:22px;color:#111827;">Du bist fast dabei! 🎓</h2>'
                || '<p style="margin:0 0 16px;">Hey' || v_name || '! Du hast dich bei UniGoat angemeldet, aber noch nicht verifiziert. Nur ein kurzer Schritt - dann schaltest du alle <strong>Studentenrabatte</strong>, <strong>Jobs</strong> und <strong>Events</strong> deiner Unistadt frei.</p>'
                || '<p style="margin:0 0 22px;">Verifizier dich mit deiner Hochschul-Mail - geht in Sekunden 👇</p>'
                || '<a href="https://unigoat.de/verify-options.html" style="display:inline-block;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-family:Archivo,sans-serif;padding:14px 28px;border-radius:0;font-size:15px;">Jetzt verifizieren</a>';
        END IF;

        -- Pflicht-Abmeldelink (gleicher Standard wie notify_user_email)
        v_body := v_body
            || '<div style="font-size:11px;color:#B6BCC6;margin-top:20px;border-top:1px solid #EEE;padding-top:12px;">'
            || 'Keine solchen Mails mehr? <a href="https://www.unigoat.de/abmelden.html?t=' || coalesce(v_tok::text,'')
            || '" style="color:#B6BCC6;text-decoration:underline;">Hier abmelden</a></div>';

        BEGIN
            PERFORM net.http_post(url := v_url, headers := public.app_internal_headers(), body :=
                jsonb_build_object('to', r.email, 'subject', v_subject, 'html', v_body, 'userId', r.id));
            INSERT INTO public.lifecycle_emails_sent (user_id, email_type) VALUES (r.id, v_type)
                ON CONFLICT (user_id, email_type) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'verify reminder failed for %: %', r.id, sqlerrm;
        END;
    END LOOP;
END;
$function$;
