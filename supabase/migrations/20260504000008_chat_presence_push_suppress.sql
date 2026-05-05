-- Migration: Push-Suppression wenn User aktuell im Chat ist.
--
-- Vorher: Yusuf tippt eine Nachricht, andere User antwortet sofort, Yusuf
-- bekommt VIBRATION + BANNER waehrend er gerade tippt. Schlecht UX.
--
-- Nachher:
--   - profiles.current_chat_listing_id (uuid, nullable) merkt sich welchen
--     Chat der User aktuell offen hat
--   - chat.html setzt beim Open via set_chat_presence(listing_id) RPC
--   - chat.html nullt beim Close via clear_chat_presence() (visibilitychange,
--     beforeunload)
--   - notify_user_push skippt wenn p_channel = 'chat_message' AND
--     p_data->>'listing_id' = profiles.current_chat_listing_id
--
-- Falls User die App im Hintergrund hat oder Phone gesperrt ist:
--   visibilitychange -> hidden -> clear_chat_presence -> Push kommt wieder
--
-- Best-Practice empfohlen in QA-Wolf-Recherche 04.05.

-- =========================================================
-- 1. profiles-Spalte ergaenzen
-- =========================================================
alter table public.profiles
    add column if not exists current_chat_listing_id uuid;

-- =========================================================
-- 2. RPC: set_chat_presence + clear_chat_presence
-- =========================================================
create or replace function public.set_chat_presence(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;
    update public.profiles
       set current_chat_listing_id = p_listing_id
     where id = v_uid;
end;
$$;

revoke all on function public.set_chat_presence(uuid) from public, anon;
grant execute on function public.set_chat_presence(uuid) to authenticated;

create or replace function public.clear_chat_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then return; end if;
    update public.profiles
       set current_chat_listing_id = null
     where id = v_uid;
end;
$$;

revoke all on function public.clear_chat_presence() from public, anon;
grant execute on function public.clear_chat_presence() to authenticated;

-- =========================================================
-- 3. notify_new_message: listing_id mit-senden
-- =========================================================
-- Vorher hatte die data-payload nur {url, type}. Wir ergaenzen listing_id
-- und sender_id damit notify_user_push die Suppression machen kann.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sender_name text;
    v_raw_content text;
    v_preview     text;
    v_chat_url    text;
begin
    select coalesce(p.full_name, p.username, 'Jemand')
        into v_sender_name
        from public.profiles p
        where p.id = NEW.sender_id;

    v_raw_content := trim(regexp_replace(coalesce(NEW.content, ''), '\[IMG\].*?\[/IMG\]\s*', '', 'g'));
    if v_raw_content = '' then
        v_preview := 'Bild';
    else
        v_preview := left(v_raw_content, 50);
        if length(v_raw_content) > 50 then
            v_preview := v_preview || '...';
        end if;
    end if;

    v_chat_url := 'chat.html?user=' || NEW.sender_id::text
               || '&listing=' || coalesce(NEW.listing_id::text, '');

    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (
        NEW.receiver_id,
        'chat_message',
        'Neue Nachricht von ' || v_sender_name,
        v_preview,
        v_chat_url,
        false
    );

    perform public.notify_user_push(
        NEW.receiver_id,
        'chat_message',
        'Neue Nachricht von ' || v_sender_name,
        v_preview,
        jsonb_build_object(
            'url', v_chat_url,
            'type', 'chat_message',
            'listing_id', coalesce(NEW.listing_id::text, ''),
            'sender_id', NEW.sender_id::text
        )
    );

    return NEW;
exception when others then
    raise warning 'notify_new_message failed: %', sqlerrm;
    return NEW;
end;
$$;

-- =========================================================
-- 4. notify_user_push: Skip wenn User in genau diesem Chat ist
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
    v_active_chat uuid;
    v_msg_listing_id uuid;
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

    -- NEU: Chat-Presence Suppression
    -- Wenn channel = 'chat_message' AND p_data hat listing_id AND
    --      User-Profil current_chat_listing_id matched -> skip Push
    -- (In-App-Notification bleibt — Bell-Icon zaehlt)
    if p_channel = 'chat_message' and (p_data ? 'listing_id') then
        begin
            v_msg_listing_id := nullif(p_data->>'listing_id', '')::uuid;
        exception when others then
            v_msg_listing_id := null;
        end;

        if v_msg_listing_id is not null then
            select current_chat_listing_id into v_active_chat
              from public.profiles where id = p_user_id;

            if v_active_chat is not null and v_active_chat = v_msg_listing_id then
                insert into public.notification_logs (user_id, channel, status, error_code, title)
                values (p_user_id, 'push', 'skipped', 'in_active_chat', p_title);
                return;
            end if;
        end if;
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

revoke all on function public.notify_user_push(uuid, text, text, text, jsonb, text) from public;
grant execute on function public.notify_user_push(uuid, text, text, text, jsonb, text) to authenticated, service_role;
