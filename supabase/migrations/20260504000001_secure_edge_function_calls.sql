-- Migration: Edge-Function-Calls absichern via x-internal-secret Header.
--
-- Hintergrund:
--   send-email + send-push sind mit `--no-verify-jwt` deployed (damit DB-Trigger
--   sie via pg_net aufrufen koennen). Vorher waren sie damit Open-Relays. Jeder
--   Anonyme konnte:
--     - send-email: beliebige Mails ueber noreply@room8.club versenden (Phishing,
--       Resend-Quota-Kill).
--     - send-push: beliebige User pushen wenn UUID bekannt (Spam).
--
-- Schutz:
--   Edge Functions pruefen jetzt einen Header `x-internal-secret`, der gegen die
--   env-var INTERNAL_FUNCTION_SECRET vergleicht. Diese Migration aktualisiert
--   die zentralen Caller-Functions (notify_user_push, send_admin_alert) damit
--   sie das Secret aus current_setting('app.internal_secret', true) lesen und
--   im pg_net-Call mitsenden.
--
-- DEPLOY-VORAUSSETZUNG (manuell durch Yusuf):
--   1. Random-Secret generieren:
--        openssl rand -hex 32
--   2. In Supabase Dashboard -> Edge Functions -> Secrets:
--        INTERNAL_FUNCTION_SECRET = <secret>
--   3. In Supabase Dashboard -> Project Settings -> Vault -> "Add new secret":
--        Name:  internal_secret
--        Value: <derselbe secret>
--   4. Edge Functions deployen:
--        supabase functions deploy send-email
--        supabase functions deploy send-push
--   5. Diese Migration applien:
--        npx supabase db push
--
-- Hintergrund Vault: Supabase Cloud erlaubt kein `ALTER DATABASE postgres SET ...`
-- (kein Superuser-Recht). Vault ist das offizielle Secret-Storage. Wir lesen
-- via vault.decrypted_secrets aus security-definer Function.

-- Helper: Liest das Internal-Secret aus Supabase Vault und baut die Header.
create or replace function public.app_internal_headers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
    v_secret text;
begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets
     where name = 'internal_secret'
     limit 1;
    if v_secret is null or v_secret = '' then
        -- Bewusst KEIN Fallback - wenn Setting fehlt, sollen Calls scheitern
        -- damit das Setup-Problem auffaellt.
        return jsonb_build_object('Content-Type', 'application/json');
    end if;
    return jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
    );
end;
$$;

revoke all on function public.app_internal_headers() from public, anon, authenticated;
grant execute on function public.app_internal_headers() to service_role;

-- =========================================================
-- notify_user_push: Header mitsenden
-- =========================================================
create or replace function public.notify_user_push(
    p_user_id uuid,
    p_channel text,
    p_title   text,
    p_body    text,
    p_data    jsonb default '{}'::jsonb,
    p_ref_id  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_url text;
    v_data_with_meta jsonb;
    s public.notification_settings%rowtype;
    v_toggle_ok boolean;
    v_recipient_is_test boolean;
    v_actor_is_test boolean;
    v_effective_ref_id text;
begin
    if p_user_id is null then return; end if;

    -- is_test Gate
    select is_test into v_recipient_is_test from public.profiles where id = p_user_id;
    if p_data ? 'actor_id' then
        begin
            select is_test into v_actor_is_test from public.profiles where id = (p_data->>'actor_id')::uuid;
        exception when others then v_actor_is_test := false;
        end;
    end if;
    if coalesce(v_recipient_is_test, false) = false
       and coalesce(v_actor_is_test, false) = true then
        return;
    end if;

    -- Toggle Check
    select * into s from public.notification_settings where user_id = p_user_id;
    if not found then v_toggle_ok := true;
    else
        case p_channel
            when 'chat_message'        then v_toggle_ok := coalesce(s.chat_message, true);
            when 'review'              then v_toggle_ok := coalesce(s.review, true);
            when 'favorite'            then v_toggle_ok := coalesce(s.favorite, true);
            when 'interest'            then v_toggle_ok := coalesce(s.interest, true);
            when 'new_listing_city'    then v_toggle_ok := coalesce(s.new_listing_city, true);
            when 'new_job_city'        then v_toggle_ok := coalesce(s.new_job_city, true);
            when 'new_coupon_city'     then v_toggle_ok := coalesce(s.new_coupon_city, true);
            when 'new_event_city'      then v_toggle_ok := coalesce(s.new_event_city, true);
            when 'saved_search_match'  then v_toggle_ok := coalesce(s.saved_search_match, true);
            else v_toggle_ok := true;
        end case;
    end if;

    if not v_toggle_ok then
        insert into public.notification_logs (user_id, channel, status, error_code, title)
        values (p_user_id, 'push', 'skipped', 'toggle_off', p_title);
        return;
    end if;
    if public.is_in_quiet_hours(p_user_id) then
        insert into public.notification_logs (user_id, channel, status, error_code, title)
        values (p_user_id, 'push', 'skipped', 'quiet_hours', p_title);
        return;
    end if;
    if public.is_rate_limited(p_user_id, p_channel) then
        insert into public.notification_logs (user_id, channel, status, error_code, title)
        values (p_user_id, 'push', 'skipped', 'rate_limited', p_title);
        return;
    end if;

    v_effective_ref_id := coalesce(p_ref_id, p_data->>'ref_id', '');
    if v_effective_ref_id <> ''
       and public.is_duplicate_push(p_user_id, v_effective_ref_id) then
        insert into public.notification_logs (user_id, channel, status, error_code, title)
        values (p_user_id, 'push', 'skipped', 'duplicate', p_title);
        return;
    end if;

    v_url := coalesce(current_setting('app.supabase_url', true),
                      'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-push';

    v_data_with_meta := coalesce(p_data, '{}'::jsonb);
    if not (v_data_with_meta ? 'channel_key') then
        v_data_with_meta := v_data_with_meta || jsonb_build_object('channel_key', p_channel);
    end if;
    if v_effective_ref_id <> '' and not (v_data_with_meta ? 'ref_id') then
        v_data_with_meta := v_data_with_meta || jsonb_build_object('ref_id', v_effective_ref_id);
    end if;

    perform net.http_post(
        url := v_url,
        body := jsonb_build_object('userId', p_user_id, 'title', p_title, 'body', p_body, 'data', v_data_with_meta),
        headers := public.app_internal_headers()
    );

exception when others then
    insert into public.notification_logs (user_id, channel, status, error_code, error_msg, title)
    values (p_user_id, 'push', 'exception', 'notify_user_push_err', sqlerrm, p_title);
end $$;

grant execute on function public.notify_user_push(uuid, text, text, text, jsonb, text) to authenticated, service_role;

-- =========================================================
-- send_admin_alert: Header mitsenden
-- =========================================================
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
        begin
            perform net.http_post(
                url := v_url,
                headers := public.app_internal_headers(),
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
