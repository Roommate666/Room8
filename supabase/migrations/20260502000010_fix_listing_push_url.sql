-- Fix: City-Push fuer Gegenstand zeigt auf gegenstand.html (= Create-Form),
-- soll aber auf detail.html?id=X (= Detailseite) zeigen, genau wie Wohnung.

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
    if coalesce(NEW.is_test, false) = true then return NEW; end if;
    if NEW.city is null or trim(NEW.city) = '' then return NEW; end if;

    if NEW.type in ('wohnung', 'wg_room', 'entire_apartment', 'studio', 'housing') then
        v_kind  := 'wohnung';
        v_title := '🏠 Neue Wohnung in ' || NEW.city;
    elsif NEW.type = 'job' then
        v_kind  := 'job';
        v_title := '💼 Neuer Job in ' || NEW.city;
    else
        v_kind  := 'gegenstand';
        v_title := '📦 Neuer Artikel in ' || NEW.city;
    end if;

    -- ALLE Inserate -> detail.html?id=X (single-source-of-truth Detail-Seite)
    v_link := 'detail.html?id=' || NEW.id::text;
    v_body := coalesce(NEW.title, 'Ohne Titel');

    for user_record in
        select p.id
          from public.profiles p
         where p.id != NEW.owner_id
           and lower(coalesce(p.city, '')) = lower(NEW.city)
           and p.is_test = false
           and public.should_notify(p.id, case v_kind
               when 'job' then 'new_job_city'
               else 'new_listing_city' end)
    loop
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
