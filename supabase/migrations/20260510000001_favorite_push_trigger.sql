-- Push-Trigger fuer neue Favoriten
-- Inserate-Owner bekommt Push wenn jemand das Inserat favorisiert.
-- Selber-Favoriten wird stillschweigend uebersprungen.
--
-- Hintergrund: Migration 20260503000070 hat den globalen trigger_notify_push_all
-- gedroppt (Duplicate-Push-Bug). Spezifische Trigger-Funktionen wurden fuer
-- review, listing_city, event_city, coupon_city, application angelegt, aber
-- der Favoriten-Trigger fehlte. In-App-Notification wurde via createNotification
-- weiterhin erstellt, aber Push kam nie an.

create or replace function public.notify_new_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_id uuid;
    v_listing_title text;
    v_faver_name text;
    v_faver_first text;
    v_owner_first text;
    v_title text;
    v_body text;
    v_link text;
begin
    -- Listing-Owner und Title holen
    select owner_id, coalesce(title, 'dein Inserat')
      into v_owner_id, v_listing_title
      from public.listings
     where id = NEW.listing_id;

    -- Listing existiert nicht? abbrechen
    if v_owner_id is null then return NEW; end if;

    -- Eigenes Inserat favorisiert? skip
    if v_owner_id = NEW.user_id then return NEW; end if;

    -- Faver-Name + Owner-Vorname holen (fuer freundlichen Title)
    select coalesce(p.full_name, p.username, 'Jemand')
      into v_faver_name
      from public.profiles p
     where p.id = NEW.user_id;
    v_faver_first := split_part(coalesce(v_faver_name, ''), ' ', 1);

    select split_part(coalesce(p.full_name, p.username, ''), ' ', 1)
      into v_owner_first
      from public.profiles p
     where p.id = v_owner_id;

    v_title := case
        when v_owner_first <> '' then 'Hey ' || v_owner_first || '! ❤️ Neuer Favorit'
        else '❤️ Neuer Favorit'
    end;
    v_body  := coalesce(v_faver_name, 'Jemand') || ' hat "' || v_listing_title || '" favorisiert.';
    v_link  := 'listing-details.html?id=' || NEW.listing_id::text;

    perform public.notify_user_push(
        v_owner_id,
        'favorite',
        v_title,
        v_body,
        jsonb_build_object(
            'url', v_link,
            'ref_id', NEW.id::text,
            'channel_key', 'favorite',
            'actor_id', NEW.user_id::text,
            'listing_id', NEW.listing_id::text
        )
    );

    return NEW;
end $$;

drop trigger if exists trg_notify_new_favorite on public.favorites;
create trigger trg_notify_new_favorite
    after insert on public.favorites
    for each row execute function public.notify_new_favorite();
