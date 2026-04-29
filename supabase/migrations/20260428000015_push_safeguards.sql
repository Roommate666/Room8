-- Migration: Push-Safeguards
-- Verhindert die 4 grossen Probleme mit unserem Push-System:
--   1. Spam bei Mass-Insert (Rate-Limit per User/Channel/Stunde)
--   2. Push um 3 Uhr morgens (Quiet Hours)
--   3. Doppel-Push fuer dasselbe Item (Dedup via ref_id)
--   4. City-Triggers ohne Bell-Eintrag (In-App-Sync)
--
-- AI-LOCK: Diese Safeguards sind Teil von should_notify() bzw.
-- notify_user_push(). Spec: specs/push-and-email.md.

-- =========================================================
-- 1. notification_settings: Quiet Hours
-- =========================================================
alter table public.notification_settings
    add column if not exists quiet_hours_enabled boolean default true,
    add column if not exists quiet_hours_start   text default '22:00',  -- HH:MM
    add column if not exists quiet_hours_end     text default '08:00',  -- HH:MM
    add column if not exists timezone            text default 'Europe/Berlin';

-- =========================================================
-- 2. notification_logs: ref_id fuer Dedup
-- =========================================================
alter table public.notification_logs
    add column if not exists ref_id text;

create index if not exists idx_notification_logs_dedup
    on public.notification_logs (user_id, ref_id, created_at desc)
    where ref_id is not null;

-- =========================================================
-- 3. is_in_quiet_hours(user_id) — prueft Uhrzeit
-- =========================================================
create or replace function public.is_in_quiet_hours(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    s public.notification_settings%rowtype;
    v_now_local time;
    v_start time;
    v_end   time;
begin
    if p_user_id is null then return false; end if;

    select * into s from public.notification_settings where user_id = p_user_id;
    if not found then return false; end if;
    if s.quiet_hours_enabled is not true then return false; end if;

    -- Zeit in User-Timezone (default Europe/Berlin)
    begin
        v_now_local := (now() at time zone coalesce(s.timezone, 'Europe/Berlin'))::time;
        v_start := s.quiet_hours_start::time;
        v_end   := s.quiet_hours_end::time;
    exception when others then
        return false;  -- Bei Parse-Fehlern lieber Push erlauben als blocken
    end;

    -- Wrap-around: 22:00 -> 08:00
    if v_start > v_end then
        return v_now_local >= v_start or v_now_local < v_end;
    else
        return v_now_local >= v_start and v_now_local < v_end;
    end if;
end;
$$;

revoke all on function public.is_in_quiet_hours(uuid) from public;
grant execute on function public.is_in_quiet_hours(uuid) to authenticated, service_role;

-- =========================================================
-- 4. is_rate_limited(user_id, channel, max_per_hour) — Spam-Schutz
-- =========================================================
-- Schaut wie oft user in der letzten Stunde Push fuer den Channel bekommen hat.
-- Default-Limit: 5 Pushes pro Channel pro Stunde.
create or replace function public.is_rate_limited(
    p_user_id uuid,
    p_channel text,
    p_max_per_hour int default 5
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select count(*) >= p_max_per_hour
      from public.notification_logs
     where user_id = p_user_id
       and channel = 'push'
       and status = 'success'
       and metadata->>'channel_key' = p_channel
       and created_at >= now() - interval '1 hour';
$$;

revoke all on function public.is_rate_limited(uuid, text, int) from public;
grant execute on function public.is_rate_limited(uuid, text, int) to authenticated, service_role;

-- =========================================================
-- 5. is_duplicate_push(user_id, ref_id) — Dedup-Check
-- =========================================================
-- True wenn fuer (user, ref_id) in den letzten 60 Min schon ein Push lief.
-- Verhindert dass derselbe Job/Coupon/Listing mehrfach Push triggert
-- (z.B. saved_search_match + new_listing_city beide treffen).
create or replace function public.is_duplicate_push(
    p_user_id uuid,
    p_ref_id  text,
    p_window_minutes int default 60
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.notification_logs
         where user_id = p_user_id
           and ref_id  = p_ref_id
           and channel = 'push'
           and status  = 'success'
           and created_at >= now() - (p_window_minutes || ' minutes')::interval
    );
$$;

revoke all on function public.is_duplicate_push(uuid, text, int) from public;
grant execute on function public.is_duplicate_push(uuid, text, int) to authenticated, service_role;

-- =========================================================
-- 6. should_notify() erweitern: Quiet-Hours + Rate-Limit
-- =========================================================
-- Ruhezeiten und Rate-Limit gelten NICHT fuer chat_message
-- (1:1 Konversation, User erwartet Echtzeit).
create or replace function public.should_notify(p_user_id uuid, p_channel text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    s public.notification_settings%rowtype;
    toggle_ok boolean;
begin
    if p_user_id is null or p_channel is null then return false; end if;

    select * into s from public.notification_settings where user_id = p_user_id;

    -- Toggle-Check
    if not found then
        toggle_ok := true;
    else
        case p_channel
            when 'chat_message'        then toggle_ok := coalesce(s.chat_message, true);
            when 'review'              then toggle_ok := coalesce(s.review, true);
            when 'favorite'            then toggle_ok := coalesce(s.favorite, true);
            when 'interest'            then toggle_ok := coalesce(s.interest, true);
            when 'new_listing_city'    then toggle_ok := coalesce(s.new_listing_city, true);
            when 'new_job_city'        then toggle_ok := coalesce(s.new_job_city, true);
            when 'new_coupon_city'     then toggle_ok := coalesce(s.new_coupon_city, true);
            when 'new_event_city'      then toggle_ok := coalesce(s.new_event_city, true);
            when 'saved_search_match'  then toggle_ok := coalesce(s.saved_search_match, true);
            else toggle_ok := true;
        end case;
    end if;

    if not toggle_ok then return false; end if;

    -- Chat ist immer durchgelassen (Echtzeit-Erwartung)
    if p_channel = 'chat_message' then
        return true;
    end if;

    -- Quiet Hours fuer alle anderen Channels
    if public.is_in_quiet_hours(p_user_id) then return false; end if;

    -- Rate-Limit (default 5 pro Stunde, Channel-spezifisch)
    if public.is_rate_limited(p_user_id, p_channel, 5) then return false; end if;

    return true;
end;
$$;

-- =========================================================
-- 7. notify_user_push() um ref_id erweitern + Dedup-Check
-- =========================================================
-- Neue Signatur: ref_id ist optional, dient Dedup.
-- Channel-Tag wird in metadata.channel_key fuer Rate-Limit-Lookup gespeichert.
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
begin
    -- Toggle + Quiet Hours + Rate-Limit
    if not public.should_notify(p_user_id, p_channel) then return; end if;

    -- Dedup-Check
    if p_ref_id is not null and public.is_duplicate_push(p_user_id, p_ref_id) then
        return;
    end if;

    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-push';

    -- channel_key + ref_id ins data-Feld damit send-push sie in notification_logs.metadata schreibt
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
        raise warning 'notify_user_push failed for % (channel %): %',
            p_user_id, p_channel, sqlerrm;
    end;
end;
$$;

revoke all on function public.notify_user_push(uuid, text, text, text, jsonb, text) from public;
grant execute on function public.notify_user_push(uuid, text, text, text, jsonb, text) to authenticated, service_role;

-- Alte 5-arg Version droppen (jetzt mit Default-Param ersetzt durch obige)
drop function if exists public.notify_user_push(uuid, text, text, text, jsonb);

-- =========================================================
-- 8. City-Trigger updaten: ref_id + zusaetzliche In-App-Notification
-- =========================================================

-- 8a. notify_new_listing_city
create or replace function public.notify_new_listing_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_record record;
    v_title text;
    v_body  text;
    v_link  text;
    v_kind  text;
begin
    if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;

    if NEW.type in ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') then
        v_kind  := 'wohnung';
        v_title := '🏠 Neue Wohnung in ' || NEW.city;
        v_link  := 'detail.html?id=' || NEW.id::text;
    else
        v_kind  := 'gegenstand';
        v_title := '📦 Neuer Artikel in ' || NEW.city;
        v_link  := 'gegenstand.html?id=' || NEW.id::text;
    end if;

    v_body := coalesce(NEW.title, 'Ohne Titel');

    for user_record in
        select p.id
          from public.profiles p
         where p.id != NEW.owner_id
           and lower(coalesce(p.city, '')) = lower(NEW.city)
    loop
        -- In-App immer (Bell-Sync)
        insert into public.notifications (user_id, type, title, message, link, reference_id)
        values (user_record.id, 'new_listing_city', v_title, v_body, v_link, NEW.id);

        -- Push gated
        perform public.notify_user_push(
            user_record.id, 'new_listing_city', v_title, v_body,
            jsonb_build_object('url', v_link, 'type', 'new_listing', 'kind', v_kind),
            'listing:' || NEW.id::text
        );
    end loop;
    return NEW;
end;
$$;

-- 8b. notify_new_job_city
create or replace function public.notify_new_job_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_record record;
    v_loc text;
    v_title text;
    v_body  text;
    v_link  text;
begin
    v_loc := NEW.location;
    if v_loc is null or trim(v_loc) = '' or lower(trim(v_loc)) = 'remote' then
        return NEW;
    end if;

    v_title := '💼 Neuer Job in ' || v_loc;
    v_body  := coalesce(NEW.title, 'Ohne Titel');
    v_link  := 'job-detail.html?id=' || NEW.id::text;

    for user_record in
        select p.id
          from public.profiles p
         where (NEW.owner_id is null or p.id != NEW.owner_id)
           and lower(coalesce(p.city, '')) = lower(v_loc)
    loop
        insert into public.notifications (user_id, type, title, message, link, reference_id)
        values (user_record.id, 'new_job_city', v_title, v_body, v_link, NEW.id);

        perform public.notify_user_push(
            user_record.id, 'new_job_city', v_title, v_body,
            jsonb_build_object('url', v_link, 'type', 'new_job'),
            'job:' || NEW.id::text
        );
    end loop;
    return NEW;
end;
$$;

-- 8c. notify_new_coupon_city
create or replace function public.notify_new_coupon_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_record record;
    v_title text;
    v_body  text;
    v_link  text;
begin
    if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;

    v_title := '🎟️ Neuer Coupon in ' || NEW.city;
    v_body  := coalesce(NEW.title, 'Ohne Titel');
    v_link  := 'coupon-detail.html?id=' || NEW.id::text;

    for user_record in
        select p.id
          from public.profiles p
         where (NEW.user_id is null or p.id != NEW.user_id)
           and lower(coalesce(p.city, '')) = lower(NEW.city)
    loop
        insert into public.notifications (user_id, type, title, message, link, reference_id)
        values (user_record.id, 'new_coupon_city', v_title, v_body, v_link, NEW.id);

        perform public.notify_user_push(
            user_record.id, 'new_coupon_city', v_title, v_body,
            jsonb_build_object('url', v_link, 'type', 'new_coupon'),
            'coupon:' || NEW.id::text
        );
    end loop;
    return NEW;
end;
$$;

-- 8d. notify_new_event_city
create or replace function public.notify_new_event_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_record record;
    v_title text;
    v_body  text;
    v_link  text;
begin
    if NEW.status != 'active' or NEW.city is null or trim(NEW.city) = '' then
        return NEW;
    end if;

    v_title := '📅 Neues Event in ' || NEW.city;
    v_body  := coalesce(NEW.title, 'Ohne Titel');
    v_link  := 'event-detail.html?id=' || NEW.id::text;

    for user_record in
        select p.id
          from public.profiles p
         where (NEW.organizer_id is null or p.id != NEW.organizer_id)
           and lower(coalesce(p.city, '')) = lower(NEW.city)
    loop
        insert into public.notifications (user_id, type, title, message, link, reference_id)
        values (user_record.id, 'new_event_city', v_title, v_body, v_link, NEW.id);

        perform public.notify_user_push(
            user_record.id, 'new_event_city', v_title, v_body,
            jsonb_build_object('url', v_link, 'type', 'new_event'),
            'event:' || NEW.id::text
        );
    end loop;
    return NEW;
end;
$$;

-- 8e. match_saved_searches: ref_id ergaenzen
create or replace function public.match_saved_searches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    search_record record;
    listing_type text;
    listing_price integer;
    match_found boolean;
    v_title text;
    v_body  text;
    v_link  text;
begin
    if NEW.type in ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') then
        listing_type := 'wohnung';
    else
        listing_type := 'gegenstand';
    end if;

    if listing_type = 'wohnung' then
        listing_price := coalesce(NEW.monthly_rent, NEW.price, 0);
    else
        listing_price := coalesce(NEW.price, 0);
    end if;

    for search_record in
        select * from public.saved_searches where is_active = true and user_id != NEW.owner_id
    loop
        match_found := true;

        if search_record.search_type != listing_type then match_found := false; end if;

        if match_found and search_record.city is not null then
            if lower(coalesce(NEW.city, '')) not like '%' || lower(search_record.city) || '%' then
                match_found := false;
            end if;
        end if;

        if match_found and search_record.min_price is not null and listing_price < search_record.min_price then
            match_found := false;
        end if;

        if match_found and search_record.max_price is not null and listing_price > search_record.max_price then
            match_found := false;
        end if;

        if match_found and listing_type = 'gegenstand' and search_record.category is not null then
            if coalesce(NEW.category, '') != search_record.category then match_found := false; end if;
        end if;

        if match_found and search_record.search_query is not null and search_record.search_query != '' then
            if lower(coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''))
               not like '%' || lower(search_record.search_query) || '%' then
                match_found := false;
            end if;
        end if;

        if match_found then
            v_title := case when listing_type = 'wohnung'
                            then '🏠 Neue Wohnung gefunden!'
                            else '📦 Neuer Artikel gefunden!' end;
            v_body  := 'Passt zu deiner Suche: ' || coalesce(NEW.title, 'Ohne Titel');
            v_link  := case when listing_type = 'wohnung'
                            then 'detail.html?id=' || NEW.id::text
                            else 'gegenstand.html?id=' || NEW.id::text end;

            insert into public.notifications (user_id, type, title, message, link, reference_id)
            values (search_record.user_id, 'search_match', v_title, v_body, v_link, NEW.id);

            -- Dedup mit listing-Trigger: derselbe ref_id-Schluessel.
            -- Wenn new_listing_city bereits Push fuer dieses Listing schickte,
            -- wird saved_search_match-Push deduped.
            perform public.notify_user_push(
                search_record.user_id, 'saved_search_match', v_title, v_body,
                jsonb_build_object('url', v_link, 'type', 'search_match', 'listing_id', NEW.id::text),
                'listing:' || NEW.id::text
            );
        end if;
    end loop;
    return NEW;
end;
$$;
