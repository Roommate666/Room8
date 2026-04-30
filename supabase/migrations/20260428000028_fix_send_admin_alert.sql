-- Migration: send_admin_alert FIX
--
-- Bug in Migration 18: JOIN war "join admin_ids a on a.user_id = ns.user_id"
-- aber admin_ids enthielt nur (id) → "column a.user_id does not exist".
-- Trigger swallowed Exception, alle Admin-Mails seit Deploy von 18 verloren.
--
-- Fix: a.id = ns.user_id (notification_settings.user_id verweist auf profiles.id)

create or replace function public.send_admin_alert(
    p_subject  text,
    p_body_html text,
    p_cta_url  text default null,
    p_subject_type text default null
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

    if p_subject_type is not null then
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

    -- FIX: a.id = ns.user_id (war a.user_id was nicht existiert)
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
              join admin_ids a on a.id = ns.user_id   -- FIX
             where ns.extra_email_recipients is not null
        ),
        all_emails as (
            select email from primary_emails
            union
            select email from extra_emails where email is not null and email != ''
        )
        select distinct email from all_emails
    loop
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
        end;
    end loop;
end;
$$;

revoke all on function public.send_admin_alert(text, text, text, text) from public;
grant execute on function public.send_admin_alert(text, text, text, text) to service_role;
