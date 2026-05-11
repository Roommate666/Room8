-- Fix: notify_new_listing_city sendete `detail.html` fuer ALLE Listings (Wohnung+Marktplatz+Job).
-- Push-Tap landete dadurch auf generischer detail.html (sah aus wie Marktplatz-Tab) statt
-- auf der richtigen Detail-Seite. Frontend nutzt: listing-details.html fuer Wohnung+Gegenstand,
-- job-detail.html fuer Jobs.

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
    v_channel text;
begin
    if coalesce(NEW.is_test, false) = true then return NEW; end if;
    if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;

    if NEW.type in ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') then
        v_kind := 'wohnung';
        v_channel := 'new_listing_city';
    elsif NEW.type = 'job' then
        v_kind := 'job';
        v_channel := 'new_job_city';
    else
        v_kind := 'gegenstand';
        v_channel := 'new_listing_city';
    end if;

    -- Fix: type-aware URL. Jobs gehen auf job-detail.html, alles andere auf listing-details.html
    v_link := case
        when v_kind = 'job' then 'job-detail.html?id=' || NEW.id::text
        else 'listing-details.html?id=' || NEW.id::text
    end;

    for user_record in
        select p.id, coalesce(p.full_name, p.username, '') as name
          from public.profiles p
         where p.id != NEW.owner_id
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and p.is_test = false
           and public.should_notify(p.id, v_channel)
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

        -- In-App Bell sync
        begin
            insert into public.notifications (user_id, type, title, message, link, reference_id, is_read)
            values (user_record.id, v_channel, v_title, v_body, v_link, NEW.id, false);
        exception when others then
            raise warning 'notification insert skipped: %', sqlerrm;
        end;

        -- Push
        perform public.notify_user_push(
            user_record.id, v_channel, v_title, v_body,
            jsonb_build_object('url', v_link, 'channel_key', v_channel,
                               'actor_id', NEW.owner_id::text, 'kind', v_kind),
            NEW.id::text
        );
    end loop;
    return NEW;
end $$;
