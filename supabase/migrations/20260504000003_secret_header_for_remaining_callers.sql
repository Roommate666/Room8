-- Migration: Restliche pg_net-Caller auf x-internal-secret Header umstellen.
--
-- Migration 20260504000001 hat notify_user_push + die 4-arg Version von
-- send_admin_alert geupdated. Die 5-arg Variante (mit p_only_to, aus
-- Migration 31) sowie admin_test_push fehlten. Diese Migration patcht beide.
-- Außerdem droppt sie die alte 4-arg Variante damit nur noch eine Signatur
-- existiert (Aufrufe waren ambig).

-- =========================================================
-- 1. 4-arg Variante droppen (nur die 5-arg ist die produktiv genutzte)
-- =========================================================
drop function if exists public.send_admin_alert(text, text, text, text);

-- =========================================================
-- 2. send_admin_alert (5-arg) mit Header neu erstellen
-- =========================================================
create or replace function public.send_admin_alert(
    p_subject  text,
    p_body_html text,
    p_cta_url  text default null,
    p_subject_type text default null,
    p_only_to text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    recipient_email text;
    v_url text;
    v_mail_html text;
    v_recent_count int;
    v_full_subject text;
    v_headers jsonb;
begin
    v_full_subject := '[Room8 Admin] ' || p_subject;

    -- Rate-Limit gilt NICHT fuer Test-Modus (p_only_to)
    if p_subject_type is not null and p_only_to is null then
        select count(*) into v_recent_count
          from public.notification_logs
         where channel = 'email'
           and status = 'success'
           and metadata->>'admin_alert_type' = p_subject_type
           and created_at >= now() - interval '1 hour';

        if v_recent_count >= 10 then return; end if;
    end if;

    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-email';

    v_headers := public.app_internal_headers();

    begin
        v_mail_html := public.email_template(
            p_subject,
            p_body_html,
            case when p_cta_url is not null then 'Im Admin-Panel oeffnen' else null end,
            p_cta_url
        );
    exception when others then
        v_mail_html := '<h2>' || p_subject || '</h2>' || p_body_html
                    || case when p_cta_url is not null
                            then '<p><a href="' || p_cta_url || '">Im Admin-Panel oeffnen</a></p>'
                            else '' end;
    end;

    -- Empfaenger:
    --   p_only_to gesetzt -> nur dieser eine (Test/Health-Check Modus)
    --   sonst: alle is_admin Profile-Mails + extra_email_recipients (DISTINCT)
    if p_only_to is not null then
        recipient_email := p_only_to;
        begin
            perform net.http_post(
                url := v_url,
                headers := v_headers,
                body := jsonb_build_object(
                    'to',      recipient_email,
                    'subject', v_full_subject,
                    'html',    v_mail_html,
                    'data',    jsonb_build_object('admin_alert_type', coalesce(p_subject_type, 'unknown'))
                )
            );
        exception when others then
            raise warning 'send_admin_alert (only_to) pg_net failed for %: %', recipient_email, sqlerrm;
            insert into public.notification_logs
                (channel, status, error_code, error_msg, title, metadata)
            values
                ('email', 'exception', 'pg_net_failed',
                 left(sqlerrm, 500), v_full_subject,
                 jsonb_build_object(
                    'admin_alert_type', coalesce(p_subject_type, 'unknown'),
                    'to', recipient_email
                 ));
        end;
        return;
    end if;

    for recipient_email in
        with admin_ids as (
            select id from public.profiles where is_admin = true
        ),
        primary_emails as (
            select u.email
              from auth.users u
              join admin_ids a on a.id = u.id
             where u.email is not null and u.email != ''
        ),
        extra_emails as (
            select unnest(coalesce(ns.extra_email_recipients, '{}')) as email
              from public.notification_settings ns
              join admin_ids a on a.id = ns.user_id
             where ns.extra_email_recipients is not null
        ),
        all_emails as (
            select email from primary_emails
            union
            select email from extra_emails where email is not null and email != ''
        )
        select distinct email from all_emails
    loop
        if recipient_email is null then continue; end if;
        begin
            perform net.http_post(
                url := v_url,
                headers := v_headers,
                body := jsonb_build_object(
                    'to',      recipient_email,
                    'subject', v_full_subject,
                    'html',    v_mail_html,
                    'data',    jsonb_build_object('admin_alert_type', coalesce(p_subject_type, 'unknown'))
                )
            );
        exception when others then
            raise warning 'send_admin_alert pg_net failed for %: %',
                recipient_email, sqlerrm;
            insert into public.notification_logs
                (channel, status, error_code, error_msg, title, metadata)
            values
                ('email', 'exception', 'pg_net_failed',
                 left(sqlerrm, 500), v_full_subject,
                 jsonb_build_object(
                    'admin_alert_type', coalesce(p_subject_type, 'unknown'),
                    'to', recipient_email
                 ));
        end;
    end loop;
end;
$$;

revoke all on function public.send_admin_alert(text, text, text, text, text) from public;
grant execute on function public.send_admin_alert(text, text, text, text, text) to service_role;

-- =========================================================
-- 3. admin_test_push mit Header
-- =========================================================
create or replace function public.admin_test_push(
    p_title text default '🔔 Test Push',
    p_body  text default 'Wenn du das siehst, funktioniert FCM auf deinem Geraet'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller uuid;
    v_is_admin boolean;
    v_fcm_token text;
    v_url text;
    v_ts text;
begin
    v_caller := auth.uid();
    if v_caller is null then
        return 'EXCEPTION: not authenticated';
    end if;

    select is_admin into v_is_admin from public.profiles where id = v_caller;
    if not coalesce(v_is_admin, false) then
        return 'EXCEPTION: not admin';
    end if;

    select fcm_token into v_fcm_token from public.profiles where id = v_caller;
    if v_fcm_token is null or v_fcm_token = '' then
        return 'EXCEPTION: no fcm_token for user';
    end if;

    v_ts := to_char(now() at time zone 'utc', 'HH24:MI:SS');
    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-push';

    perform net.http_post(
        url := v_url,
        headers := public.app_internal_headers(),
        body := jsonb_build_object(
            'userId', v_caller::text,
            'title',  p_title || ' (' || v_ts || ')',
            'body',   p_body,
            'data',   jsonb_build_object(
                'channel_key', 'admin_test',
                'admin_test', true
            )
        )
    );

    return 'FIRED at ' || v_ts || ' to user ' || v_caller || '. Check Push Health logs in 30s.';
end;
$$;

revoke all on function public.admin_test_push(text, text) from anon, authenticated, public;
grant execute on function public.admin_test_push(text, text) to authenticated;
