-- Fix: notify_user_push rief is_duplicate_push mit 4 Args auf (uuid,text,text,text)
-- aber die Funktion hat nur (uuid,text,int) Signatur. Korrektur + TRACE-Diags raus.

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

    -- Korrekte is_duplicate_push Signatur: (uuid, text, int default 60)
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
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || coalesce(current_setting('app.supabase_service_key', true), ''))
    );

exception when others then
    insert into public.notification_logs (user_id, channel, status, error_code, error_msg, title)
    values (p_user_id, 'push', 'exception', 'notify_user_push_err', sqlerrm, p_title);
end $$;

grant execute on function public.notify_user_push(uuid, text, text, text, jsonb, text) to authenticated, service_role;

-- Cleanup TRACE-Logs aus der Diagnostik
delete from public.notification_logs where error_code in ('TRACE_enter','TRACE_pg_net_fired','notify_user_push_err');
