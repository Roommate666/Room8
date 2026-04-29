-- Migration: Skip-Logging + Token-Cleanup-Status fuer notification_logs
--
-- Erlaubt jetzt 2 weitere Status-Werte:
--   'skipped'        — Push wurde geblockt (toggle/quiet/rate/dedup)
--   'token_cleaned'  — Push fehlgeschlagen, FCM-Token wurde geloescht
--
-- notify_user_push() schreibt skip-Eintrag wenn ein Gate greift.
-- send-push (Edge Function) schreibt token_cleaned bei UNREGISTERED.
--
-- Damit kann Yusuf im Push-Health-Tab sehen WARUM ein User keinen
-- Push bekommen hat — Audit-Trail fuer Debug.

-- =========================================================
-- 1. CHECK-Constraint erweitern
-- =========================================================
alter table public.notification_logs
    drop constraint if exists notification_logs_status_check;

alter table public.notification_logs
    add constraint notification_logs_status_check
    check (status in (
        'success',
        'no_token',
        'invalid_email',
        'fcm_error',
        'resend_failed',
        'exception',
        'skipped',         -- NEU
        'token_cleaned'    -- NEU
    ));

-- =========================================================
-- 2. notify_user_push() erweitern: Skip-Logging
-- =========================================================
-- Bei jedem Skip ein notification_logs-Eintrag mit Grund.
-- Dadurch werden alle "warum kam kein Push" Faelle sichtbar.
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
    v_skip_reason text;
    s public.notification_settings%rowtype;
    v_toggle_ok boolean;
begin
    -- 1. Toggle-Check (inline statt should_notify, damit wir Reason mitloggen)
    select * into s from public.notification_settings where user_id = p_user_id;

    if not found then
        v_toggle_ok := true;
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

    if not v_toggle_ok then v_skip_reason := 'toggle_off';
    elsif p_channel != 'chat_message' and public.is_in_quiet_hours(p_user_id) then
        v_skip_reason := 'quiet_hours';
    elsif p_channel != 'chat_message' and public.is_rate_limited(p_user_id, p_channel, 5) then
        v_skip_reason := 'rate_limit';
    elsif p_ref_id is not null and public.is_duplicate_push(p_user_id, p_ref_id) then
        v_skip_reason := 'duplicate';
    end if;

    if v_skip_reason is not null then
        -- Skip-Eintrag in notification_logs (best-effort)
        begin
            insert into public.notification_logs (
                channel, user_id, status, error_code, title, ref_id, metadata
            ) values (
                'push', p_user_id, 'skipped', v_skip_reason,
                left(p_title, 200), p_ref_id,
                jsonb_build_object('channel_key', p_channel, 'skip_reason', v_skip_reason)
            );
        exception when others then
            -- Skip-Logging darf nichts blockieren
            raise warning 'skip-log insert failed: %', sqlerrm;
        end;
        return;
    end if;

    -- Send durchfuehren
    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-push';

    v_data_with_meta := coalesce(p_data, '{}'::jsonb)
        || jsonb_build_object('channel_key', p_channel)
        || case when p_ref_id is not null
                then jsonb_build_object('ref_id', p_ref_id)
                else '{}'::jsonb end;

    begin
        perform net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
                'userId', p_user_id::text,
                'title',  p_title,
                'body',   p_body,
                'data',   v_data_with_meta
            )
        );
    exception when others then
        raise warning 'notify_user_push pg_net failed for % (channel %): %',
            p_user_id, p_channel, sqlerrm;
    end;
end;
$$;

revoke all on function public.notify_user_push(uuid, text, text, text, jsonb, text) from public;
grant execute on function public.notify_user_push(uuid, text, text, text, jsonb, text) to authenticated, service_role;

-- =========================================================
-- 3. RPCs fuer Skip-Stats (Admin-UI)
-- =========================================================
-- get_skip_stats(hours) — gruppiert skipped-Eintraege nach Reason
create or replace function public.get_skip_stats(hours int default 24)
returns table (
    skip_reason  text,
    cnt          bigint,
    last_seen    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and is_admin = true
    ) then
        raise exception 'forbidden: admin only';
    end if;

    return query
    select
        nl.error_code as skip_reason,
        count(*)      as cnt,
        max(nl.created_at) as last_seen
    from public.notification_logs nl
    where nl.status = 'skipped'
      and nl.created_at >= now() - (hours || ' hours')::interval
    group by nl.error_code
    order by cnt desc;
end;
$$;

revoke all on function public.get_skip_stats(int) from public;
grant execute on function public.get_skip_stats(int) to authenticated;

-- =========================================================
-- 4. RPC: get_token_cleanup_count(hours)
-- =========================================================
create or replace function public.get_token_cleanup_count(hours int default 168)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and is_admin = true
    ) then
        raise exception 'forbidden: admin only';
    end if;

    select count(distinct user_id)::int into v_count
      from public.notification_logs
     where status = 'token_cleaned'
       and created_at >= now() - (hours || ' hours')::interval;
    return v_count;
end;
$$;

revoke all on function public.get_token_cleanup_count(int) from public;
grant execute on function public.get_token_cleanup_count(int) to authenticated;
