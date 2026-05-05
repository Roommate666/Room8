-- =========================================================
-- is_test Architektur — Test-User + Test-Daten ohne dass echte User was sehen
-- =========================================================
-- Pattern (nach Mercari/Etsy):
--   profiles.is_test = true     → Test-User (sieht Pushes nur von anderen Test-Usern)
--   listings.is_test = true     → Test-Inserat (taucht nicht in echten Feeds auf)
--   events.is_test = true       → Test-Event
--   coupons.is_test = true      → Test-Coupon
--   jobs.is_test = true         → Test-Job (falls separate Tabelle existiert)
--
-- Alle Push-Trigger respektieren das via notify_user_push() Gate.
-- UI-Feeds filtern is_test = false (Frontend-Aenderungen separat).

-- ---------------------------------------------------------
-- 1. Spalten hinzufuegen
-- ---------------------------------------------------------
alter table public.profiles add column if not exists is_test boolean not null default false;
alter table public.listings add column if not exists is_test boolean not null default false;
alter table public.events   add column if not exists is_test boolean not null default false;

-- coupons + jobs: nur wenn Tabellen existieren
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='coupons') then
        execute 'alter table public.coupons add column if not exists is_test boolean not null default false';
    end if;
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='jobs') then
        execute 'alter table public.jobs add column if not exists is_test boolean not null default false';
    end if;
end $$;

-- ---------------------------------------------------------
-- 2. Indizes fuer Performance bei is_test=false Filter
-- ---------------------------------------------------------
create index if not exists idx_profiles_is_test on public.profiles (is_test) where is_test = false;
create index if not exists idx_listings_is_test on public.listings (is_test) where is_test = false;
create index if not exists idx_events_is_test on public.events (is_test) where is_test = false;

-- ---------------------------------------------------------
-- 3. Auto-Cascade: Inserat von Test-User -> automatisch is_test=true
-- ---------------------------------------------------------
create or replace function public.cascade_is_test_from_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Wenn owner is_test=true ist und Zeile is_test nicht explizit gesetzt
    if NEW.is_test = false then
        if exists (select 1 from public.profiles where id = NEW.owner_id and is_test = true) then
            NEW.is_test := true;
        end if;
    end if;
    return NEW;
end $$;

drop trigger if exists trg_cascade_is_test_listings on public.listings;
create trigger trg_cascade_is_test_listings
    before insert on public.listings
    for each row execute function public.cascade_is_test_from_owner();

-- Events haben organizer_id statt owner_id
create or replace function public.cascade_is_test_from_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.is_test = false then
        if exists (select 1 from public.profiles where id = NEW.organizer_id and is_test = true) then
            NEW.is_test := true;
        end if;
    end if;
    return NEW;
end $$;

drop trigger if exists trg_cascade_is_test_events on public.events;
create trigger trg_cascade_is_test_events
    before insert on public.events
    for each row execute function public.cascade_is_test_from_organizer();

-- ---------------------------------------------------------
-- 4. notify_user_push: Gate fuer ALLE Push-Typen
-- ---------------------------------------------------------
-- Echte User bekommen NIE Pushes von / ueber Test-Daten.
-- Test-User bekommen ALLE Pushes (auch von echten Daten — fuer Tests sinnvoll).
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
    v_recipient_is_test boolean;
    v_actor_is_test boolean;
begin
    if p_user_id is null then return; end if;

    -- Empfaenger laden
    select is_test into v_recipient_is_test
      from public.profiles where id = p_user_id;

    -- Actor (data.actor_id) — wenn der Test-User ist, ist Push auch Test
    if p_data ? 'actor_id' then
        select is_test into v_actor_is_test
          from public.profiles where id = (p_data->>'actor_id')::uuid;
    end if;

    -- Gate: echter User darf KEINE Pushes von Test-Aktionen sehen
    if coalesce(v_recipient_is_test, false) = false
       and coalesce(v_actor_is_test, false) = true then
        return;
    end if;

    -- Toggle, Quiet-Hours, Rate-Limit, Dedup
    if not public.should_notify(p_user_id, p_channel) then return; end if;
    if public.is_in_quiet_hours(p_user_id) then return; end if;
    if public.is_rate_limited(p_user_id, p_channel) then return; end if;
    if public.is_duplicate_push(p_user_id, p_channel,
                                 coalesce(p_data->>'ref_id', ''),
                                 coalesce(p_data->>'channel_key', '')) then return; end if;

    -- pg_net call zu send-push
    v_url := coalesce(
        current_setting('app.supabase_url', true),
        'https://tvnvmogaqmduzcycmvby.supabase.co'
    ) || '/functions/v1/send-push';

    perform net.http_post(
        url := v_url,
        body := jsonb_build_object(
            'userId', p_user_id,
            'title',  p_title,
            'body',   p_body,
            'data',   p_data
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
    raise warning 'notify_user_push failed: %', SQLERRM;
end $$;

-- ---------------------------------------------------------
-- 5. City-Push-Trigger: skip wenn Inserat is_test=true
-- ---------------------------------------------------------
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
    -- Skip wenn Test-Inserat (echte User sollen nichts sehen)
    if coalesce(NEW.is_test, false) = true then return NEW; end if;
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
           and p.is_test = false              -- echte User filtern (Test-Empfaenger explizit)
           and public.should_notify(p.id, 'new_listing_city')
    loop
        perform public.notify_user_push(
            user_record.id,
            'new_listing_city',
            v_title,
            v_body,
            jsonb_build_object(
                'url', v_link,
                'ref_id', NEW.id::text,
                'channel_key', 'new_listing_city',
                'actor_id', NEW.owner_id::text,
                'kind', v_kind
            )
        );
    end loop;
    return NEW;
end $$;

-- Event-City-Push: gleicher Filter
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
    if coalesce(NEW.is_test, false) = true then return NEW; end if;
    if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;
    if NEW.status != 'approved' then return NEW; end if;

    v_title := '🎉 Neues Event in ' || NEW.city;
    v_body  := coalesce(NEW.title, 'Ohne Titel');
    v_link  := 'event-detail.html?id=' || NEW.id::text;

    for user_record in
        select p.id
          from public.profiles p
         where p.id != NEW.organizer_id
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and p.is_test = false
           and public.should_notify(p.id, 'new_event_city')
    loop
        perform public.notify_user_push(
            user_record.id,
            'new_event_city',
            v_title,
            v_body,
            jsonb_build_object(
                'url', v_link,
                'ref_id', NEW.id::text,
                'channel_key', 'new_event_city',
                'actor_id', NEW.organizer_id::text
            )
        );
    end loop;
    return NEW;
end $$;

-- coupon + job city triggers nur falls Tabellen existieren
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='coupons') then
        execute $f$
        create or replace function public.notify_new_coupon_city()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare
            user_record record;
        begin
            if coalesce(NEW.is_test, false) = true then return NEW; end if;
            if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;
            for user_record in
                select p.id from public.profiles p
                 where lower(coalesce(p.city, '')) = lower(NEW.city)
                   and p.is_test = false
                   and public.should_notify(p.id, 'new_coupon_city')
            loop
                perform public.notify_user_push(
                    user_record.id,
                    'new_coupon_city',
                    '🎟️ Neuer Coupon in ' || NEW.city,
                    coalesce(NEW.title, 'Ohne Titel'),
                    jsonb_build_object(
                        'url', 'coupon-detail.html?id=' || NEW.id::text,
                        'ref_id', NEW.id::text,
                        'channel_key', 'new_coupon_city'
                    )
                );
            end loop;
            return NEW;
        end $body$;
        $f$;
    end if;

    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='jobs') then
        execute $f$
        create or replace function public.notify_new_job_city()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare
            user_record record;
        begin
            if coalesce(NEW.is_test, false) = true then return NEW; end if;
            if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;
            for user_record in
                select p.id from public.profiles p
                 where lower(coalesce(p.city, '')) = lower(NEW.city)
                   and p.is_test = false
                   and public.should_notify(p.id, 'new_job_city')
            loop
                perform public.notify_user_push(
                    user_record.id,
                    'new_job_city',
                    '💼 Neuer Job in ' || NEW.city,
                    coalesce(NEW.title, 'Ohne Titel'),
                    jsonb_build_object(
                        'url', 'job-detail.html?id=' || NEW.id::text,
                        'ref_id', NEW.id::text,
                        'channel_key', 'new_job_city'
                    )
                );
            end loop;
            return NEW;
        end $body$;
        $f$;
    end if;
end $$;
