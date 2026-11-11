-- ============================================================================
-- COUPON-PUSH: SAFE BY DEFAULT (09.11.2026)
-- Grund: Ein Coupon-INSERT (egal ob via Admin-Panel, coupon-create oder
-- direkt in der DB) loeste bisher IMMER automatisch City-Push an alle User
-- der Stadt aus. Das fuehrte zu versehentlichen Massen-Pushes.
-- NEU: Ein INSERT pusht NIE automatisch. Push ist ein bewusster, expliziter
-- Akt via announce_coupon(id) ODER announce=true beim Insert.
-- ============================================================================

-- 1. Guard-Spalten
alter table public.coupons add column if not exists announce boolean not null default false;
alter table public.coupons add column if not exists announced_at timestamptz;

comment on column public.coupons.announce is
  'true = beim INSERT bewusst City-Push ausloesen. default false = KEIN Auto-Push (safe by default).';
comment on column public.coupons.announced_at is
  'Zeitpunkt des City-Push. Gesetzt = schon announced -> announce_coupon() pusht nicht erneut.';

-- 2. Wiederverwendbare Push-Logik (aus dem Trigger extrahiert, DRY)
create or replace function public._announce_coupon_to_city(c public.coupons)
returns integer
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    user_record record;
    v_title text; v_body text; v_first_name text; v_link text;
    n integer := 0;
begin
    if coalesce(c.is_test, false) = true then return 0; end if;
    if c.city is null or trim(c.city) = '' then return 0; end if;
    v_link := 'coupon-detail.html?id=' || c.id::text;

    for user_record in
        select p.id, coalesce(p.full_name, p.username, '') as name
          from public.profiles p
         where lower(coalesce(p.city, '')) = lower(c.city)
           and p.is_test = false
           and public.should_notify(p.id, 'new_coupon_city')
    loop
        v_first_name := split_part(user_record.name, ' ', 1);
        v_title := case when v_first_name <> '' then 'Hey ' || v_first_name || '! \U0001F39F️ Studenten-Rabatt'
                        else '\U0001F39F️ Neuer Coupon in ' || c.city end;
        v_body := coalesce(c.title, 'Rabatt') || ' bei ' || coalesce(c.business_name, c.city);

        begin
            insert into public.notifications (user_id, type, title, message, link, reference_id, is_read)
            values (user_record.id, 'new_coupon_city', v_title, v_body, v_link, c.id, false);
        exception when others then
            raise warning 'notification insert skipped: %', sqlerrm;
        end;

        perform public.notify_user_push(
            user_record.id, 'new_coupon_city', v_title, v_body,
            jsonb_build_object('url', v_link, 'channel_key', 'new_coupon_city'),
            c.id::text
        );
        n := n + 1;
    end loop;
    return n;
end
$fn$;

-- 3. Trigger-Funktion: pusht NUR bei announce=true (SAFE BY DEFAULT)
create or replace function public.notify_new_coupon_city()
returns trigger
language plpgsql security definer set search_path to 'public'
as $fn$
begin
    -- Safe by default: ein normaler INSERT pusht NIE automatisch.
    if coalesce(NEW.announce, false) <> true then
        return NEW;
    end if;
    perform public._announce_coupon_to_city(NEW);
    update public.coupons set announced_at = now() where id = NEW.id and announced_at is null;
    return NEW;
end
$fn$;

-- 4. Bewusster, expliziter Push (idempotent: pusht nie doppelt)
create or replace function public.announce_coupon(p_id uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    c public.coupons;
    n integer;
begin
    select * into c from public.coupons where id = p_id;
    if not found then
        raise exception 'announce_coupon: coupon % nicht gefunden', p_id;
    end if;
    if c.announced_at is not null then
        raise notice 'announce_coupon: coupon % schon announced am % -> uebersprungen', p_id, c.announced_at;
        return 0;
    end if;
    n := public._announce_coupon_to_city(c);
    update public.coupons set announced_at = now(), announce = true where id = p_id;
    return n;
end
$fn$;

-- 5. Bestehende Coupons als "schon announced" markieren (kein Nachhol-Push)
update public.coupons set announced_at = coalesce(announced_at, created_at, now())
 where announced_at is null;
