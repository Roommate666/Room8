-- Persoenlichere Push-Texte: "Hey, [Name]..." statt nur Emoji-Headline.
-- Body-Text wird konkreter & ansprechender.

-- 1. City-Listing Push: "Hey! Neue WG-Anzeige in Augsburg" / Body: "[Titel] - klick um zu sehen"
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
    v_first_name text;
begin
    if coalesce(NEW.is_test, false) = true then return NEW; end if;
    if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;

    if NEW.type in ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') then
        v_kind  := 'wohnung';
    elsif NEW.type = 'job' then
        v_kind  := 'job';
    else
        v_kind  := 'gegenstand';
    end if;

    v_link := 'detail.html?id=' || NEW.id::text;

    for user_record in
        select p.id, coalesce(p.full_name, p.username, '') as name
          from public.profiles p
         where p.id != NEW.owner_id
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and p.is_test = false
           and public.should_notify(p.id, case v_kind when 'job' then 'new_job_city' else 'new_listing_city' end)
    loop
        v_first_name := split_part(user_record.name, ' ', 1);
        if v_kind = 'wohnung' then
            v_title := case when v_first_name <> '' then 'Hey ' || v_first_name || '! 🏠 Neue Wohnung'
                            else '🏠 Neue Wohnung in ' || NEW.city end;
            v_body := 'Schau mal: ' || coalesce(NEW.title, 'Wohnung') || ' in ' || NEW.city;
        elsif v_kind = 'job' then
            v_title := case when v_first_name <> '' then 'Hey ' || v_first_name || '! 💼 Neuer Job'
                            else '💼 Neuer Job in ' || NEW.city end;
            v_body := coalesce(NEW.title, 'Stellenangebot') || ' — koennte was fuer dich sein.';
        else
            v_title := case when v_first_name <> '' then 'Hey ' || v_first_name || '! 📦 Marktplatz'
                            else '📦 Neuer Artikel in ' || NEW.city end;
            v_body := coalesce(NEW.title, 'Neuer Artikel') || ' aus deiner Stadt.';
        end if;

        perform public.notify_user_push(
            user_record.id,
            case v_kind when 'job' then 'new_job_city' else 'new_listing_city' end,
            v_title,
            v_body,
            jsonb_build_object(
                'url', v_link,
                'channel_key', case v_kind when 'job' then 'new_job_city' else 'new_listing_city' end,
                'actor_id', NEW.owner_id::text,
                'kind', v_kind
            ),
            NEW.id::text
        );
    end loop;
    return NEW;
end $$;

-- 2. City-Event Push: persoenlicher
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
    v_first_name text;
begin
    if coalesce(NEW.is_test, false) = true then return NEW; end if;
    if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;
    if NEW.status != 'active' then return NEW; end if;

    v_link := 'event-detail.html?id=' || NEW.id::text;

    for user_record in
        select p.id, coalesce(p.full_name, p.username, '') as name
          from public.profiles p
         where p.id != NEW.organizer_id
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and p.is_test = false
           and public.should_notify(p.id, 'new_event_city')
    loop
        v_first_name := split_part(user_record.name, ' ', 1);
        v_title := case when v_first_name <> '' then 'Hey ' || v_first_name || '! 🎉 Neues Event'
                        else '🎉 Neues Event in ' || NEW.city end;
        v_body := coalesce(NEW.title, 'Event') || ' — ' || NEW.city || '. Komm vorbei!';

        perform public.notify_user_push(
            user_record.id,
            'new_event_city',
            v_title,
            v_body,
            jsonb_build_object(
                'url', v_link,
                'channel_key', 'new_event_city',
                'actor_id', NEW.organizer_id::text
            ),
            NEW.id::text
        );
    end loop;
    return NEW;
end $$;

-- 3. Coupon-City Push (falls Funktion existiert)
do $$
begin
    if exists (select 1 from information_schema.routines
               where routine_schema='public' and routine_name='notify_new_coupon_city') then
        execute $f$
        create or replace function public.notify_new_coupon_city()
        returns trigger
        language plpgsql
        security definer
        set search_path = public
        as $body$
        declare
            user_record record;
            v_title text;
            v_body text;
            v_first_name text;
        begin
            if coalesce(NEW.is_test, false) = true then return NEW; end if;
            if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;
            for user_record in
                select p.id, coalesce(p.full_name, p.username, '') as name
                  from public.profiles p
                 where lower(coalesce(p.city, '')) = lower(NEW.city)
                   and p.is_test = false
                   and public.should_notify(p.id, 'new_coupon_city')
            loop
                v_first_name := split_part(user_record.name, ' ', 1);
                v_title := case when v_first_name <> '' then 'Hey ' || v_first_name || '! 🎟️ Studenten-Rabatt'
                                else '🎟️ Neuer Coupon in ' || NEW.city end;
                v_body := coalesce(NEW.title, 'Rabatt') || ' bei ' || coalesce(NEW.business_name, NEW.city);
                perform public.notify_user_push(
                    user_record.id, 'new_coupon_city', v_title, v_body,
                    jsonb_build_object(
                        'url', 'coupon-detail.html?id=' || NEW.id::text,
                        'channel_key', 'new_coupon_city'
                    ),
                    NEW.id::text
                );
            end loop;
            return NEW;
        end $body$;
        $f$;
    end if;
end $$;

-- 4. Review Push: persoenlicher
create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_reviewer_name text;
    v_reviewee_first text;
    v_title text;
    v_body text;
    v_link text;
begin
    if NEW.reviewer_id = NEW.reviewee_id then return NEW; end if;

    select coalesce(p.full_name, p.username, 'Jemand') into v_reviewer_name
      from public.profiles p where p.id = NEW.reviewer_id;
    select split_part(coalesce(p.full_name, p.username, ''), ' ', 1) into v_reviewee_first
      from public.profiles p where p.id = NEW.reviewee_id;

    v_title := case when v_reviewee_first <> '' then 'Hey ' || v_reviewee_first || '! ⭐ Neue Bewertung'
                    else '⭐ Neue Bewertung' end;
    v_body  := coalesce(v_reviewer_name, 'Jemand') || ' hat dir ' || NEW.rating::text || ' Sterne gegeben.';
    v_link  := 'public-profile.html?id=' || NEW.reviewee_id::text;

    perform public.notify_user_push(
        NEW.reviewee_id, 'review', v_title, v_body,
        jsonb_build_object(
            'url', v_link,
            'channel_key', 'review',
            'actor_id', NEW.reviewer_id::text,
            'rating', NEW.rating::text
        ),
        NEW.id::text
    );
    return NEW;
end $$;
