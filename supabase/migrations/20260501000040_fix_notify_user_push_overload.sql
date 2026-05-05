-- Fix: notify_user_push existiert in 2 ueberladenen Versionen, was zu
-- "is not unique" Fehler bei Aufrufen aus Triggern fuehrt.
-- Loesung: alle Versionen droppen, EINE kanonische Version mit allen Features
-- (skip-logging + is_test-gate + safeguards) neu erstellen.

drop function if exists public.notify_user_push(uuid, text, text, text, jsonb);
drop function if exists public.notify_user_push(uuid, text, text, text, jsonb, text);

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
    v_recipient_is_test boolean;
    v_actor_is_test boolean;
begin
    if p_user_id is null then return; end if;

    -- is_test Gate: echte User bekommen keine Pushes von Test-Aktionen
    select is_test into v_recipient_is_test
      from public.profiles where id = p_user_id;

    if p_data ? 'actor_id' then
        begin
            select is_test into v_actor_is_test
              from public.profiles where id = (p_data->>'actor_id')::uuid;
        exception when others then
            v_actor_is_test := false;
        end;
    end if;

    if coalesce(v_recipient_is_test, false) = false
       and coalesce(v_actor_is_test, false) = true then
        return;
    end if;

    -- 1. Toggle-Check (inline statt should_notify, damit wir Reason mitloggen)
    select * into s from public.notification_settings where user_id = p_user_id;

    if not found then
        v_toggle_ok := true; -- Kein Eintrag → Default true
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
        insert into public.notification_logs (user_id, channel, status, error_code, title, metadata)
        values (p_user_id, 'push', 'skipped', 'toggle_off', p_title,
                jsonb_build_object('channel', p_channel));
        return;
    end if;

    -- 2. Quiet-Hours
    if public.is_in_quiet_hours(p_user_id) then
        insert into public.notification_logs (user_id, channel, status, error_code, title, metadata)
        values (p_user_id, 'push', 'skipped', 'quiet_hours', p_title,
                jsonb_build_object('channel', p_channel));
        return;
    end if;

    -- 3. Rate-Limit
    if public.is_rate_limited(p_user_id, p_channel) then
        insert into public.notification_logs (user_id, channel, status, error_code, title, metadata)
        values (p_user_id, 'push', 'skipped', 'rate_limited', p_title,
                jsonb_build_object('channel', p_channel));
        return;
    end if;

    -- 4. Dedup
    if public.is_duplicate_push(p_user_id, p_channel,
                                 coalesce(p_ref_id, p_data->>'ref_id', ''),
                                 coalesce(p_data->>'channel_key', '')) then
        insert into public.notification_logs (user_id, channel, status, error_code, title, metadata)
        values (p_user_id, 'push', 'skipped', 'duplicate', p_title,
                jsonb_build_object('channel', p_channel));
        return;
    end if;

    -- 5. Push absenden via send-push edge function
    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-push';

    -- channel_key in data sicherstellen (fuer Rate-Limit + Dedup spaeter)
    v_data_with_meta := coalesce(p_data, '{}'::jsonb);
    if not (v_data_with_meta ? 'channel_key') then
        v_data_with_meta := v_data_with_meta || jsonb_build_object('channel_key', p_channel);
    end if;
    if p_ref_id is not null and not (v_data_with_meta ? 'ref_id') then
        v_data_with_meta := v_data_with_meta || jsonb_build_object('ref_id', p_ref_id);
    end if;

    perform net.http_post(
        url := v_url,
        body := jsonb_build_object(
            'userId', p_user_id,
            'title',  p_title,
            'body',   p_body,
            'data',   v_data_with_meta
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(
                current_setting('app.supabase_service_key', true),
                ''
            )
        )
    );
exception when others then
    raise warning 'notify_user_push failed: %', sqlerrm;
end $$;

grant execute on function public.notify_user_push(uuid, text, text, text, jsonb, text) to authenticated, service_role;
