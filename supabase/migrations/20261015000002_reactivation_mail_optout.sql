-- P1 Audit-Fix (15.10.2026): send_reactivation_emails respektiert email_marketing-Opt-out
-- + haengt Abmelde-Link an (UWG-Pflicht). Original per pg_get_functiondef, nur 3 Patches.
CREATE OR REPLACE FUNCTION public.send_reactivation_emails()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r record; v_url text; v_body text;
BEGIN
    v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
    FOR r IN
        SELECT p.id, coalesce(p.email, u.email) AS email, p.full_name, p.unsubscribe_token
        FROM public.profiles p JOIN auth.users u ON u.id = p.id
        WHERE coalesce(p.is_test, false) = false
          AND coalesce(p.email_marketing, true) = true
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
            || '<a href="https://unigoat.de/coupons.html" style="display:inline-block;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-family:Archivo,sans-serif;padding:14px 28px;border-radius:0;font-size:15px;">Zurueck zu UniGoat</a>' || '<div style="font-size:11px;color:#B6BCC6;margin-top:24px;">Keine solchen Mails mehr? <a href="https://www.unigoat.de/abmelden.html?t=' || coalesce(r.unsubscribe_token::text,'') || '" style="color:#B6BCC6;">Hier abmelden</a></div>';
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
$function$;
