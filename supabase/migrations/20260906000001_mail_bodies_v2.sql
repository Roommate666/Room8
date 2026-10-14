-- v2-Fix der Mail-Body-Buttons/Code-Box (Live-Def geholt, nur Style-Tokens ersetzt)
-- Stand 2026-09-06. Betrifft: ug_email_btn (Helper), request_uni_code (Code-Box),
-- send_reactivation_emails + send_verify_reminders (Inline-Button).

CREATE OR REPLACE FUNCTION public.ug_email_btn(p_label text, p_path text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select '<a href="https://unigoat.de/' || p_path || '" style="display:inline-block;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-family:Archivo,sans-serif;padding:14px 28px;border-radius:0;font-size:15px;margin-top:8px;">' || p_label || '</a>';
$function$;

-- request_uni_code
CREATE OR REPLACE FUNCTION public.request_uni_code(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_email text; v_domain text; v_code text; v_url text; v_html text;
  v_blocked text[] := array['gmail.com','googlemail.com','gmx.de','gmx.net','web.de','yahoo.com','yahoo.de',
    'hotmail.com','hotmail.de','outlook.com','outlook.de','live.de','live.com','icloud.com','me.com',
    't-online.de','freenet.de','aol.com','proton.me','protonmail.com','mail.de'];
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  v_email := lower(trim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok',false,'error','INVALID_EMAIL'); end if;
  v_domain := split_part(v_email,'@',2);
  if v_domain = any(v_blocked) then return jsonb_build_object('ok',false,'error','NOT_UNI_EMAIL'); end if;
  if exists (select 1 from public.profiles where lower(uni_email)=v_email and uni_email_verified=true and id<>v_uid) then
    return jsonb_build_object('ok',false,'error','EMAIL_IN_USE'); end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  update public.profiles set uni_email=v_email, uni_email_verification_token=v_code, uni_email_token_created_at=now()
    where id=v_uid;

  v_url := coalesce(current_setting('app.supabase_url',true),'https://tvnvmogaqmduzcycmvby.supabase.co')||'/functions/v1/send-email';
  v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Dein UniGoat-Code</h2>'
    ||'<p style="margin:0 0 8px;">Gib diesen Code in der App ein, um deinen Studenten-Status zu bestätigen:</p>'
    ||'<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#eae9e9;border:2px solid #201e1d;border-radius:0;padding:16px;text-align:center;margin:12px 0;color:#201e1d;">'||v_code||'</div>'
    ||'<p style="margin:0;color:#6b7280;font-size:13px;">Der Code ist 15 Minuten gültig. Wenn du das nicht warst, ignoriere diese Mail.</p>';
  begin
    perform net.http_post(url:=v_url, headers:=public.app_internal_headers(),
      body:=jsonb_build_object('to',v_email,'subject','Dein UniGoat-Code: '||v_code,'html',v_html,'userId',v_uid));
  exception when others then raise warning 'uni code mail fail %: %',v_uid,sqlerrm; end;
  return jsonb_build_object('ok',true);
end; $function$
;

-- send_reactivation_emails
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
            || '<a href="https://unigoat.de/coupons.html" style="display:inline-block;background:#12B489;color:#201e1d;text-decoration:none;font-weight:800;font-family:Archivo,sans-serif;padding:14px 28px;border-radius:0;font-size:15px;">Zurueck zu UniGoat</a>';
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
$function$
;

-- send_verify_reminders
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
$function$
;

