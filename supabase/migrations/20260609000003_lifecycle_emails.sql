-- =============================================================
-- Lifecycle-E-Mails: Verify-Reminder + Reaktivierung
-- - Verify-Reminder: an registrierte aber NICHT verifizierte Studenten,
--   gestaffelt Tag 2 + Tag 7 nach Registrierung, dann Stop (kein Spam).
-- - Reaktivierung: an User die >30 Tage nicht eingeloggt waren, 1x.
-- Idempotenz via lifecycle_emails_sent (UNIQUE user_id+email_type).
-- Mails laufen ueber send-email -> automatisch im bunten Room8-Template.
-- Max 30 Mails/Lauf (sanfter Start). Taeglicher pg_cron.
-- Test-User + @room8.partner ausgeschlossen.
-- Stand 2026-06-09
-- =============================================================

CREATE TABLE IF NOT EXISTS public.lifecycle_emails_sent (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_type text NOT NULL,
    sent_at timestamptz DEFAULT now(),
    UNIQUE(user_id, email_type)
);
ALTER TABLE public.lifecycle_emails_sent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lifecycle_admin_only" ON public.lifecycle_emails_sent;
CREATE POLICY "lifecycle_admin_only" ON public.lifecycle_emails_sent
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ---------- Verify-Reminder ----------
CREATE OR REPLACE FUNCTION public.send_verify_reminders()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r record; v_url text; v_type text; v_body text;
BEGIN
    v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
    FOR r IN
        SELECT p.id, coalesce(p.email, u.email) AS email, p.created_at, p.full_name
        FROM public.profiles p JOIN auth.users u ON u.id = p.id
        WHERE p.is_student_verified IS NOT TRUE
          AND coalesce(p.is_test, false) = false
          AND coalesce(p.email, u.email) IS NOT NULL
          AND coalesce(p.email, u.email) NOT LIKE '%@room8.partner'
          AND p.created_at < now() - interval '2 days'
        ORDER BY p.created_at DESC
        LIMIT 30
    LOOP
        -- Welche Stufe? d7 wenn >7 Tage + d2 schon geschickt, sonst d2
        IF r.created_at < now() - interval '7 days'
           AND EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = r.id AND email_type = 'verify_d2')
           AND NOT EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = r.id AND email_type = 'verify_d7') THEN
            v_type := 'verify_d7';
        ELSIF NOT EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = r.id AND email_type = 'verify_d2') THEN
            v_type := 'verify_d2';
        ELSE
            CONTINUE; -- beide schon geschickt -> kein Spam
        END IF;

        v_body := '<h2 style="margin:0 0 12px;font-size:22px;color:#111827;">Du bist fast dabei! 🎓</h2>'
            || '<p style="margin:0 0 16px;">Hey' || coalesce(' ' || nullif(split_part(coalesce(r.full_name,''),' ',1),''), '') || '! Du hast dich bei Room8 angemeldet, aber noch nicht verifiziert. Nur ein kurzer Schritt - dann schaltest du alle <strong>Studentenrabatte</strong>, <strong>Jobs</strong> und <strong>Events</strong> deiner Unistadt frei.</p>'
            || '<p style="margin:0 0 22px;">Verifizier dich mit deiner Hochschul-Mail - geht in Sekunden 👇</p>'
            || '<a href="https://www.room8.club/verify-options.html" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;">Jetzt verifizieren</a>';

        BEGIN
            PERFORM net.http_post(url := v_url, headers := public.app_internal_headers(), body :=
                jsonb_build_object('to', r.email, 'subject', 'Verifizier dich und sicher dir die Studentenrabatte 🎓', 'html', v_body, 'userId', r.id));
            INSERT INTO public.lifecycle_emails_sent (user_id, email_type) VALUES (r.id, v_type)
                ON CONFLICT (user_id, email_type) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'verify reminder failed for %: %', r.id, sqlerrm;
        END;
    END LOOP;
END;
$$;

-- ---------- Reaktivierung ----------
CREATE OR REPLACE FUNCTION public.send_reactivation_emails()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r record; v_url text; v_body text;
BEGIN
    v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
    FOR r IN
        SELECT p.id, coalesce(p.email, u.email) AS email, p.full_name
        FROM public.profiles p JOIN auth.users u ON u.id = p.id
        WHERE coalesce(p.is_test, false) = false
          AND coalesce(p.email, u.email) IS NOT NULL
          AND coalesce(p.email, u.email) NOT LIKE '%@room8.partner'
          AND u.last_sign_in_at IS NOT NULL
          AND u.last_sign_in_at < now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM public.lifecycle_emails_sent WHERE user_id = p.id AND email_type = 'reactivation_d30')
        ORDER BY u.last_sign_in_at ASC
        LIMIT 30
    LOOP
        v_body := '<h2 style="margin:0 0 12px;font-size:22px;color:#111827;">Lange nicht gesehen! ☕</h2>'
            || '<p style="margin:0 0 16px;">Hey' || coalesce(' ' || nullif(split_part(coalesce(r.full_name,''),' ',1),''), '') || '! In deiner Unistadt gibt es neue <strong>Studentenrabatte</strong>, <strong>Jobs</strong> und <strong>Events</strong>. Schau doch mal wieder rein - vielleicht ist genau dein Ding dabei.</p>'
            || '<a href="https://www.room8.club/coupons.html" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;">Zurueck zu Room8</a>';
        BEGIN
            PERFORM net.http_post(url := v_url, headers := public.app_internal_headers(), body :=
                jsonb_build_object('to', r.email, 'subject', 'Neue Rabatte & Events warten auf dich ☕', 'html', v_body, 'userId', r.id));
            INSERT INTO public.lifecycle_emails_sent (user_id, email_type) VALUES (r.id, 'reactivation_d30')
                ON CONFLICT (user_id, email_type) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'reactivation failed for %: %', r.id, sqlerrm;
        END;
    END LOOP;
END;
$$;

-- ---------- pg_cron: taeglich ----------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verify-reminders') THEN PERFORM cron.unschedule('verify-reminders'); END IF;
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reactivation-emails') THEN PERFORM cron.unschedule('reactivation-emails'); END IF;
        -- Taeglich 10:00 UTC (12:00 CEST) - gute Lese-Zeit
        PERFORM cron.schedule('verify-reminders', '0 10 * * *', $cmd$ SELECT public.send_verify_reminders(); $cmd$);
        PERFORM cron.schedule('reactivation-emails', '15 10 * * *', $cmd$ SELECT public.send_reactivation_emails(); $cmd$);
        RAISE NOTICE 'Lifecycle-Email-Crons erstellt';
    ELSE
        RAISE WARNING 'pg_cron nicht aktiv - Lifecycle-Mails idle';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cron schedule failed: %', SQLERRM;
END $$;
