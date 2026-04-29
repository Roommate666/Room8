-- Migration: Konsolidiertes Push/Email Routing-System
--
-- ZIEL: notification_settings-Toggles aus dem UI werden im Backend respektiert.
-- Neue City-basierte Push-Trigger fuer Listings, Jobs, Coupons, Events.
--
-- AUFBAU:
--   1. notification_settings Tabelle (idempotent CREATE)
--   2. should_notify(user_id, channel) — zentraler Toggle-Gate
--   3. notify_user_push(...) — wrapped pg_net mit Toggle-Check
--   4. chat_push Trigger erneuern — respektiert chat_message-Toggle
--   5. match_saved_searches erweitern — pg_net→send-push wenn enabled
--   6. NEU: notify_new_listing_city — bei jedem listings INSERT
--   7. NEU: notify_new_job_city
--   8. NEU: notify_new_coupon_city
--   9. NEU: notify_new_event_city
--
-- AI-LOCK: Diese Helper-Funktionen sind Pflicht-Patterns.
-- Bei Aenderungen specs/push-and-email.md lesen + Spec aktualisieren.

-- =========================================================
-- 1. notification_settings Tabelle
-- =========================================================
create table if not exists public.notification_settings (
    user_id              uuid primary key references auth.users(id) on delete cascade,
    chat_message         boolean default true,
    review               boolean default true,
    favorite             boolean default true,
    interest             boolean default true,
    new_listing_city     boolean default true,
    new_job_city         boolean default true,
    new_coupon_city      boolean default true,
    new_event_city       boolean default true,                -- NEU
    saved_search_match   boolean default true,
    updated_at           timestamptz default now()
);

-- Spalte fuer Event-Push-Toggle nachziehen falls Tabelle alt
alter table public.notification_settings
    add column if not exists new_event_city boolean default true;

-- RLS: User darf nur eigene Settings lesen/schreiben
alter table public.notification_settings enable row level security;

drop policy if exists "notif_settings_self_select" on public.notification_settings;
create policy "notif_settings_self_select"
    on public.notification_settings for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "notif_settings_self_upsert" on public.notification_settings;
create policy "notif_settings_self_upsert"
    on public.notification_settings for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "notif_settings_self_update" on public.notification_settings;
create policy "notif_settings_self_update"
    on public.notification_settings for update
    to authenticated
    using (auth.uid() = user_id);

-- =========================================================
-- 2. should_notify(user_id, channel) — zentraler Toggle-Gate
-- =========================================================
-- Liefert true wenn der User den entsprechenden Push erlaubt.
-- DEFAULT bei fehlendem Eintrag: true (User hat noch nie was eingestellt → opt-in).
-- AI-LOCK: Channel-Werte muessen exakt mit notification_settings-Spalten matchen.
create or replace function public.should_notify(p_user_id uuid, p_channel text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    s public.notification_settings%rowtype;
    result boolean;
begin
    if p_user_id is null or p_channel is null then
        return false;
    end if;

    select * into s from public.notification_settings where user_id = p_user_id;

    -- Kein Eintrag → default true (User hat sich nie aktiv abgemeldet)
    if not found then
        return true;
    end if;

    case p_channel
        when 'chat_message'        then result := coalesce(s.chat_message, true);
        when 'review'              then result := coalesce(s.review, true);
        when 'favorite'            then result := coalesce(s.favorite, true);
        when 'interest'            then result := coalesce(s.interest, true);
        when 'new_listing_city'    then result := coalesce(s.new_listing_city, true);
        when 'new_job_city'        then result := coalesce(s.new_job_city, true);
        when 'new_coupon_city'     then result := coalesce(s.new_coupon_city, true);
        when 'new_event_city'      then result := coalesce(s.new_event_city, true);
        when 'saved_search_match'  then result := coalesce(s.saved_search_match, true);
        else result := true;  -- unbekannte Channels: default an
    end case;

    return result;
end;
$$;

revoke all on function public.should_notify(uuid, text) from public;
grant execute on function public.should_notify(uuid, text) to authenticated, service_role;

-- =========================================================
-- 3. notify_user_push(user_id, title, body, data) — wrapped pg_net
-- =========================================================
-- Zentrale Push-Send-Funktion. Pruefen Toggle, dann pg_net.http_post zu send-push.
-- Caller MUSS p_channel mitgeben (entspricht notification_settings-Spalte).
-- AI-LOCK: Diese Funktion ist der einzige sanktionierte Weg Push aus DB-Triggern zu senden.
create or replace function public.notify_user_push(
    p_user_id uuid,
    p_channel text,
    p_title   text,
    p_body    text,
    p_data    jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_url text;
begin
    -- Toggle-Gate
    if not public.should_notify(p_user_id, p_channel) then
        return;
    end if;

    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-push';

    begin
        perform net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
                'userId', p_user_id::text,
                'title', p_title,
                'body',  p_body,
                'data',  p_data
            )
        );
    exception when others then
        -- Push darf NIE den Trigger killen (pg_net kann Netzwerk-Issues haben)
        raise warning 'notify_user_push failed for % (channel %): %',
            p_user_id, p_channel, sqlerrm;
    end;
end;
$$;

revoke all on function public.notify_user_push(uuid, text, text, text, jsonb) from public;
grant execute on function public.notify_user_push(uuid, text, text, text, jsonb) to authenticated, service_role;

-- =========================================================
-- 4. notify_new_message Trigger erneuern (respektiert Toggle)
-- =========================================================
-- ALT: Hatte pg_net.http_post inline + hardcoded anon-key.
-- NEU: Push via notify_user_push() Helper, gated durch chat_message-Toggle.
-- In-App-Notification bleibt IMMER (nicht gated) — Bell-Icon zaehlt mit.
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
    -- Sender-Name
    select coalesce(p.full_name, p.username, 'Jemand')
        into v_sender_name
        from public.profiles p
        where p.id = NEW.sender_id;

    -- Content bereinigen ([IMG] tags weg)
    v_raw_content := trim(regexp_replace(coalesce(NEW.content, ''), '\[IMG\].*?\[/IMG\]\s*', '', 'g'));
    if v_raw_content = '' then
        v_preview := 'Bild';
    else
        v_preview := left(v_raw_content, 50);
        if length(v_raw_content) > 50 then
            v_preview := v_preview || '...';
        end if;
    end if;

    -- Chat-URL mit Listing-Kontext
    v_chat_url := 'chat.html?user=' || NEW.sender_id::text
               || '&listing=' || coalesce(NEW.listing_id::text, '');

    -- 1. In-App Notification (immer, ohne Toggle-Gate — Bell-Icon ist universell)
    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (
        NEW.receiver_id,
        'chat_message',
        'Neue Nachricht von ' || v_sender_name,
        v_preview,
        v_chat_url,
        false
    );

    -- 2. Push (gated durch chat_message-Toggle)
    perform public.notify_user_push(
        NEW.receiver_id,
        'chat_message',
        'Neue Nachricht von ' || v_sender_name,
        v_preview,
        jsonb_build_object('url', v_chat_url, 'type', 'chat_message')
    );

    return NEW;
exception when others then
    raise warning 'notify_new_message failed: %', sqlerrm;
    return NEW;
end;
$$;

-- Alle bestehenden Trigger-Varianten droppen, sauberen anhaengen
drop trigger if exists chat_message_push on public.messages;
drop trigger if exists chat_push_trigger on public.messages;
drop trigger if exists chat_push_trigger_v2 on public.messages;
drop trigger if exists notify_new_message_trigger on public.messages;
drop trigger if exists notify_new_message on public.messages;
create trigger notify_new_message_trigger
    after insert on public.messages
    for each row
    execute function public.notify_new_message();

-- =========================================================
-- 5. match_saved_searches erweitern — Push wenn enabled
-- =========================================================
-- Bestehende Funktion aus 20260218031000 erweitern: nach in-app notification
-- ALSO push senden, gated by notification_settings.saved_search_match.
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

        if search_record.search_type != listing_type then
            match_found := false;
        end if;

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
            if coalesce(NEW.category, '') != search_record.category then
                match_found := false;
            end if;
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

            -- 1. In-App Notification (immer, kein Toggle-Check)
            insert into public.notifications (user_id, type, title, message, link, reference_id)
            values (search_record.user_id, 'search_match', v_title, v_body, v_link, NEW.id);

            -- 2. Push (gated by saved_search_match Toggle)
            perform public.notify_user_push(
                search_record.user_id,
                'saved_search_match',
                v_title,
                v_body,
                jsonb_build_object('url', v_link, 'type', 'search_match', 'listing_id', NEW.id::text)
            );
        end if;
    end loop;

    return NEW;
end;
$$;

-- =========================================================
-- 6. notify_new_listing_city — Allgemein-Push fuer User in Stadt
-- =========================================================
-- Zusaetzlich zum saved_searches-Match: User die NICHT explizit suchen aber
-- in der gleichen Stadt wohnen + new_listing_city=true bekommen einen Push.
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
    v_listing_kind text;
begin
    if NEW.city is null or trim(NEW.city) = '' then
        return NEW;
    end if;

    -- Wohnung vs Gegenstand
    if NEW.type in ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') then
        v_listing_kind := 'wohnung';
        v_title := '🏠 Neue Wohnung in ' || NEW.city;
        v_link  := 'detail.html?id=' || NEW.id::text;
    else
        v_listing_kind := 'gegenstand';
        v_title := '📦 Neuer Artikel in ' || NEW.city;
        v_link  := 'gegenstand.html?id=' || NEW.id::text;
    end if;

    v_body := coalesce(NEW.title, 'Ohne Titel');

    for user_record in
        select p.id
          from public.profiles p
         where p.id != NEW.owner_id
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and public.should_notify(p.id, 'new_listing_city')
    loop
        perform public.notify_user_push(
            user_record.id,
            'new_listing_city',
            v_title,
            v_body,
            jsonb_build_object('url', v_link, 'type', 'new_listing', 'kind', v_listing_kind)
        );
    end loop;

    return NEW;
end;
$$;

drop trigger if exists notify_new_listing_city on public.listings;
create trigger notify_new_listing_city
    after insert on public.listings
    for each row
    execute function public.notify_new_listing_city();

-- =========================================================
-- 7. notify_new_job_city
-- =========================================================
-- jobs-Tabelle nutzt 'location' (nicht 'city') und 'owner_id'.
create or replace function public.notify_new_job_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_record record;
    v_loc text;
begin
    v_loc := NEW.location;
    if v_loc is null or trim(v_loc) = '' or lower(trim(v_loc)) = 'remote' then
        return NEW;
    end if;

    for user_record in
        select p.id
          from public.profiles p
         where (NEW.owner_id is null or p.id != NEW.owner_id)
           and lower(coalesce(p.city, '')) = lower(v_loc)
           and public.should_notify(p.id, 'new_job_city')
    loop
        perform public.notify_user_push(
            user_record.id,
            'new_job_city',
            '💼 Neuer Job in ' || v_loc,
            coalesce(NEW.title, 'Ohne Titel'),
            jsonb_build_object(
                'url', 'job-detail.html?id=' || NEW.id::text,
                'type', 'new_job'
            )
        );
    end loop;

    return NEW;
end;
$$;

drop trigger if exists notify_new_job_city on public.jobs;
create trigger notify_new_job_city
    after insert on public.jobs
    for each row
    execute function public.notify_new_job_city();

-- =========================================================
-- 8. notify_new_coupon_city
-- =========================================================
-- coupons-Tabelle nutzt 'city' und 'user_id'.
create or replace function public.notify_new_coupon_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_record record;
begin
    if NEW.city is null or trim(NEW.city) = '' then
        return NEW;
    end if;

    for user_record in
        select p.id
          from public.profiles p
         where (NEW.user_id is null or p.id != NEW.user_id)
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and public.should_notify(p.id, 'new_coupon_city')
    loop
        perform public.notify_user_push(
            user_record.id,
            'new_coupon_city',
            '🎟️ Neuer Coupon in ' || NEW.city,
            coalesce(NEW.title, 'Ohne Titel'),
            jsonb_build_object(
                'url', 'coupon-detail.html?id=' || NEW.id::text,
                'type', 'new_coupon'
            )
        );
    end loop;

    return NEW;
end;
$$;

drop trigger if exists notify_new_coupon_city on public.coupons;
create trigger notify_new_coupon_city
    after insert on public.coupons
    for each row
    execute function public.notify_new_coupon_city();

-- =========================================================
-- 9. notify_new_event_city — NEU
-- =========================================================
create or replace function public.notify_new_event_city()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    user_record record;
begin
    -- Nur aktive, nicht-geheime Events triggern Push
    if NEW.status != 'active' or NEW.city is null or trim(NEW.city) = '' then
        return NEW;
    end if;

    for user_record in
        select p.id
          from public.profiles p
         where (NEW.organizer_id is null or p.id != NEW.organizer_id)
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and public.should_notify(p.id, 'new_event_city')
    loop
        perform public.notify_user_push(
            user_record.id,
            'new_event_city',
            '📅 Neues Event in ' || NEW.city,
            coalesce(NEW.title, 'Ohne Titel'),
            jsonb_build_object(
                'url', 'event-detail.html?id=' || NEW.id::text,
                'type', 'new_event'
            )
        );
    end loop;

    return NEW;
end;
$$;

drop trigger if exists notify_new_event_city on public.events;
create trigger notify_new_event_city
    after insert on public.events
    for each row
    execute function public.notify_new_event_city();
