-- Migration: Active Email-Watchdog
--
-- Loest: heute war send_admin_alert 5h still tot. Health-Check Workflow
-- pruefte zwar Success-Rate, aber wenn keine Inserts kommen, gibts auch
-- keine fail-rate → blind. Aktiver Watchdog feuert taeglich einen
-- echten Test-Alert und checkt ob er es bis in notification_logs schafft.

-- =========================================================
-- 1. send_admin_alert erweitern um p_only_to (optional Test-Recipient)
-- =========================================================
-- Alte Signature droppen damit neue mit zusaetzlichem default-Param geht
drop function if exists public.send_admin_alert(text, text, text, text);

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
    --   p_only_to gesetzt → nur dieser eine (Test/Health-Check Modus)
    --   sonst: alle is_admin Profile-Mails + extra_email_recipients (DISTINCT)
    if p_only_to is not null then
        -- Einzel-Recipient direkt
        recipient_email := p_only_to;
        begin
            perform net.http_post(
                url := v_url,
                headers := jsonb_build_object('Content-Type', 'application/json'),
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

    -- Mehr-Recipient Modus: Admin-Profile + extras
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
                headers := jsonb_build_object('Content-Type', 'application/json'),
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
            -- defensives Logging: Mail-Send-Fehler bleibt sonst unsichtbar
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
-- 2. RPC: daily_health_check() — wird vom GitHub-Workflow gerufen
-- =========================================================
-- Sendet Test-Mail an admin@room8.club (gleiche Domain → kommt sicher an).
-- subject_type='daily_health_check' macht es im Log eindeutig identifizierbar.
create or replace function public.daily_health_check()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ts text;
begin
    v_ts := to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS UTC');
    perform public.send_admin_alert(
        '✅ Daily Health Check ' || v_ts,
        '<p>Watchdog: send_admin_alert ist erreichbar.</p>'
        || '<p>Wenn du diese Mail siehst, funktioniert die komplette Pipeline:</p>'
        || '<ul>'
        || '<li>RPC daily_health_check → send_admin_alert</li>'
        || '<li>send_admin_alert → pg_net.http_post → send-email Edge Function</li>'
        || '<li>send-email → Resend → Mailbox</li>'
        || '<li>notification_logs Eintrag mit success</li>'
        || '</ul>'
        || '<p>Fail-Modus: Watchdog-Workflow failt → GitHub schickt dir Mail direkt.</p>',
        null,
        'daily_health_check',
        'admin@room8.club'  -- only_to: nur 1 Mail, nicht alle Admins
    );
    return 'health check fired @ ' || v_ts;
end;
$$;

revoke all on function public.daily_health_check() from public;
grant execute on function public.daily_health_check() to service_role;

-- =========================================================
-- 3. RPC: check_daily_health_log() — verifiziert dass success geloggt wurde
-- =========================================================
-- Returns true wenn in den letzten p_minutes Minuten ein success-Log
-- mit subject_type='daily_health_check' existiert.
create or replace function public.check_daily_health_log(p_minutes int default 10)
returns table(
    success_count int,
    exception_count int,
    last_status text,
    last_error_msg text,
    last_created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    with recent as (
        select status, error_msg, created_at
          from public.notification_logs
         where channel = 'email'
           and (
               metadata->>'admin_alert_type' = 'daily_health_check'
               or title like '%Daily Health Check%'
               or title like '%daily_health_check%'
           )
           and created_at >= now() - (p_minutes || ' minutes')::interval
         order by created_at desc
    )
    select
        coalesce((select count(*)::int from recent where status = 'success'), 0),
        coalesce((select count(*)::int from recent where status = 'exception'), 0),
        (select status from recent limit 1),
        (select error_msg from recent limit 1),
        (select created_at from recent limit 1);
$$;

revoke all on function public.check_daily_health_log(int) from public;
grant execute on function public.check_daily_health_log(int) to service_role;
