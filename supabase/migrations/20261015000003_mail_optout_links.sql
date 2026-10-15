-- P1-Familie Audit-Fix (15.10.): verify_reminders nur an bestaetigte Adressen + Mail-Links auf Production-Domain
CREATE OR REPLACE FUNCTION public.send_verify_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r record; v_url text; v_type text; v_body text;
BEGIN
    v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
    FOR r IN
        SELECT p.id, coalesce(p.email, u.email) AS email, p.created_at, p.full_name
        FROM public.profiles p JOIN auth.users u ON u.id = p.id
        WHERE p.is_student_verified IS NOT TRUE
          AND u.email_confirmed_at IS NOT NULL
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
            || '<p style="margin:0 0 16px;">Hey' || coalesce(' ' || nullif(split_part(coalesce(r.full_name,''),' ',1),''), '') || '! Du hast dich bei UniGoat angemeldet, aber noch nicht verifiziert. Nur ein kurzer Schritt - dann schaltest du alle <strong>Studentenrabatte</strong>, <strong>Jobs</strong> und <strong>Events</strong> deiner Unistadt frei.</p>'
            || '<p style="margin:0 0 22px;">Verifizier dich mit deiner Hochschul-Mail - geht in Sekunden 👇</p>'
            || '<a href="https://unigoat.de/verify-options.html" style="display:inline-block;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-family:Archivo,sans-serif;padding:14px 28px;border-radius:0;font-size:15px;">Jetzt verifizieren</a>';

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
$function$;

CREATE OR REPLACE FUNCTION public.notify_user_email(p_user_id uuid, p_subject text, p_html text, p_dedup_key text, p_kind text DEFAULT 'event'::text, p_throttle_hours integer DEFAULT 48)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_email text; v_tok uuid; v_url text; v_html text;
begin
  select coalesce(p.email, u.email), p.unsubscribe_token into v_email, v_tok
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_user_id
    and coalesce(p.is_test,false)=false
    and coalesce(p.email_marketing,true)=true
    and coalesce(p.email,u.email) is not null
    and coalesce(p.email,u.email) not like '%@room8.partner';
  if v_email is null then return false; end if;
  if exists (select 1 from public.engagement_emails_sent where user_id=p_user_id and dedup_key=p_dedup_key) then
    return false;
  end if;
  if p_kind='event' and exists (
    select 1 from public.engagement_emails_sent
    where user_id=p_user_id and kind='event' and sent_at > now() - make_interval(hours => p_throttle_hours)
  ) then
    return false;
  end if;
  v_html := p_html
    || '<div style="font-size:11px;color:#B6BCC6;margin-top:20px;border-top:1px solid #EEE;padding-top:12px;">'
    || 'Keine solchen Mails mehr? <a href="https://www.unigoat.de/abmelden.html?t=' || coalesce(v_tok::text,'')
    || '" style="color:#B6BCC6;text-decoration:underline;">Hier abmelden</a></div>';
  v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
  begin
    perform net.http_post(url := v_url, headers := public.app_internal_headers(),
      body := jsonb_build_object('to', v_email, 'subject', p_subject, 'html', v_html, 'userId', p_user_id));
    insert into public.engagement_emails_sent (user_id, dedup_key, kind) values (p_user_id, p_dedup_key, p_kind)
      on conflict (user_id, dedup_key) do nothing;
    return true;
  exception when others then
    raise warning 'notify_user_email fail %: %', p_user_id, sqlerrm; return false;
  end;
end; $function$;
