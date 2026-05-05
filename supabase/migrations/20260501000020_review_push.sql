-- Push-Trigger fuer neue Bewertungen
-- Reviewee bekommt Push -> Tap leitet zu public-profile.html?id=<reviewee_id>
-- damit User die Bewertung auf eigenem oeffentlichen Profil sieht.

create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_reviewer_name text;
    v_title text;
    v_body text;
    v_link text;
begin
    -- Self-review verhindern (sollte UI auch tun)
    if NEW.reviewer_id = NEW.reviewee_id then return NEW; end if;

    select coalesce(p.full_name, p.username, 'Jemand')
      into v_reviewer_name
      from public.profiles p
     where p.id = NEW.reviewer_id;

    v_title := '⭐ Neue Bewertung';
    v_body  := coalesce(v_reviewer_name, 'Jemand') || ' hat dich mit ' ||
               NEW.rating::text || ' Sternen bewertet';
    v_link  := 'public-profile.html?id=' || NEW.reviewee_id::text;

    perform public.notify_user_push(
        NEW.reviewee_id,
        'review',
        v_title,
        v_body,
        jsonb_build_object(
            'url', v_link,
            'ref_id', NEW.id::text,
            'channel_key', 'review',
            'actor_id', NEW.reviewer_id::text,
            'rating', NEW.rating::text
        )
    );

    return NEW;
end $$;

drop trigger if exists trg_notify_new_review on public.reviews;
create trigger trg_notify_new_review
    after insert on public.reviews
    for each row execute function public.notify_new_review();
