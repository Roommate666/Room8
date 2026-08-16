-- ============================================================
-- Feature #1: Zeitgesteuerte personalisierte Coupon-Erinnerungen
-- "Hol dir Shawarma von Damaskus Mond" etc.
-- ============================================================
-- Sicherheit:
--   * max 1 Erinnerung / Tag / User (coupon_reminder_log, 20h-Fenster)
--   * Opt-out via notification_settings.coupon_reminder
--   * respektiert Quiet Hours (is_in_quiet_hours)
--   * nur an User mit Push-Token (fcm_tokens)
--   * TEST-Modus: send_daily_coupon_reminders(p_only_user) sendet NUR an einen User
--   * Broadcast-Cron ist am Ende AUSKOMMENTIERT -> erst nach Test-Send aktivieren
-- notify_user_push (AI-LOCK) bleibt unangetastet; Opt-out wird inline geprueft.

-- 1. Opt-out-Spalte
alter table public.notification_settings
    add column if not exists coupon_reminder boolean default true;

-- 2. Optionale personalisierte Push-Copy pro Coupon (sonst Auto-Fallback)
alter table public.coupons
    add column if not exists reminder_title text,
    add column if not exists reminder_body  text;

-- 3. Tages-Cap-Log (self-contained, keine Annahme ueber notification_logs)
create table if not exists public.coupon_reminder_log (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null,
    coupon_id uuid,
    sent_at   timestamptz not null default now()
);
create index if not exists idx_crl_user_sent on public.coupon_reminder_log(user_id, sent_at desc);
alter table public.coupon_reminder_log enable row level security;
-- Keine Policies: nur SECURITY DEFINER Funktion + service_role greifen zu.

-- 4. Haupt-Sender: "Coupon des Tages" rotierend an alle berechtigten User
create or replace function public.send_daily_coupon_reminders(p_only_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_coupon public.coupons%rowtype;
    v_count  int;
    v_idx    int;
    v_title  text;
    v_body   text;
    v_sent   int := 0;
    r        record;
begin
    -- Nur echte, aktive Coupons (kein Test)
    select count(*) into v_count
      from public.coupons
     where status = 'active' and coalesce(is_test, false) = false;
    if v_count = 0 then return 0; end if;

    -- Coupon des Tages rotierend nach Tag-des-Jahres
    v_idx := (extract(doy from now())::int) % v_count;
    select * into v_coupon
      from public.coupons
     where status = 'active' and coalesce(is_test, false) = false
     order by created_at
     offset v_idx limit 1;
    if not found then return 0; end if;

    -- Copy: personalisiert wenn gesetzt, sonst Fallback aus Titel + Partner
    v_title := coalesce(nullif(v_coupon.reminder_title, ''), 'Dein Studenten-Deal wartet 🐐');
    v_body  := coalesce(nullif(v_coupon.reminder_body, ''),
                        v_coupon.title || ' — jetzt bei '
                        || coalesce(nullif(v_coupon.business_name, ''), 'deinem Lieblingsladen')
                        || ' einloesen.');

    -- Zielgruppe: distinct User mit Push-Token
    for r in
        select distinct ft.user_id
          from public.fcm_tokens ft
         where (p_only_user is null or ft.user_id = p_only_user)
    loop
        -- Opt-out?
        if exists (select 1 from public.notification_settings ns
                    where ns.user_id = r.user_id and ns.coupon_reminder = false) then
            continue;
        end if;

        -- Quiet Hours? (im Test-Modus ueberspringen, damit Test jederzeit geht)
        if p_only_user is null and public.is_in_quiet_hours(r.user_id) then
            continue;
        end if;

        -- Tages-Cap: in letzten 20h schon eine Erinnerung bekommen?
        if exists (select 1 from public.coupon_reminder_log l
                    where l.user_id = r.user_id
                      and l.sent_at >= now() - interval '20 hours') then
            continue;
        end if;

        -- Senden (notify_user_push gated zusaetzlich via should_notify -> default an)
        perform public.notify_user_push(
            r.user_id,
            'coupon_reminder',
            v_title,
            v_body,
            jsonb_build_object(
                'url', '/coupon-detail.html?id=' || v_coupon.id::text,
                'couponId', v_coupon.id::text
            )
        );

        insert into public.coupon_reminder_log(user_id, coupon_id)
             values (r.user_id, v_coupon.id);

        v_sent := v_sent + 1;
    end loop;

    return v_sent;
end;
$$;

revoke all on function public.send_daily_coupon_reminders(uuid) from public;
grant execute on function public.send_daily_coupon_reminders(uuid) to service_role;

-- 5. Personalisierte Copy fuer die 5 Live-Coupons setzen
update public.coupons set
    reminder_title = 'Shawarma-Time? 🌯',
    reminder_body  = 'Hol dir syrische Küche bei Damaskus Mond — 10% auf die gesamte Speisekarte.'
 where id = '300e13da-a854-4da6-b7f6-9e133078b43f';

update public.coupons set
    reminder_title = 'Bock auf Action? 🎮',
    reminder_body  = 'Face Off Arena: 18 € + Freigetränk. Schnapp dir dein Team und legt los!'
 where id = '28d3fda3-d4bf-493f-b819-3fd8f8bbfa6f';

update public.coupons set
    reminder_title = 'Frisch einkaufen? 🥩',
    reminder_body  = 'Bei Fleischgut Çelik 10% ab 10 € — einfach Studi-Ausweis zeigen.'
 where id = 'd399fab9-78bc-4da8-bd78-c250f2048649';

update public.coupons set
    reminder_title = 'Mittagshunger? 🍔',
    reminder_body  = 'Super Smash: jedes Menü nur 12 € — stell dir dein Menü selbst zusammen.'
 where id = '92786a95-c495-47cf-be26-bfb285c10261';

update public.coupons set
    reminder_title = 'Vorräte leer? 🧊',
    reminder_body  = 'Delfo TK-Supermarkt: 15% auf deinen ganzen Einkauf.'
 where id = '0f99d2cc-13a7-487d-88dc-01ac6ec8293d';

-- 6. Broadcast-Cron (taeglich 11:30 CEST = 09:30 UTC)
--    !!! ERST NACH ERFOLGREICHEM TEST-SEND AKTIVIEREN !!!
--    Zum Scharfschalten diese Zeile separat ausfuehren:
--
--    select cron.schedule('daily-coupon-reminder', '30 9 * * *',
--                          $$ select public.send_daily_coupon_reminders(); $$);
