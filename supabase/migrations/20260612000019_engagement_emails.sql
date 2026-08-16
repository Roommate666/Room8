-- UniGoat Engagement-MAILS zusaetzlich zu Push.
-- Yusuf-Wunsch: Studenten sollen die wichtigen Trigger 100%ig erreichen (Push
-- verfehlt alle ohne App/Erlaubnis) UND ~2-3 Mails/Woche von UniGoat bekommen.
-- Umgesetzt:
--  A) notify_user_email(): schickt ueber send-email (room8.club, UniGoat-Template),
--     mit Dedup + globaler Anti-Fatigue-Drossel (max 1 Event-Mail / p_throttle_hours).
--  B) Event-Mails an die 3 von Yusuf genannten Trigger (ueberholt / letzte 3 Tage /
--     Streak) + monatlich (neuer Wettkampf / Gewinner). Alle mit Push wie gehabt.
--  C) Wochen-Floor: 2 feste Mails/Woche an alle Studenten (Digest Mi + Spotlight So)
--     -> garantiert die 2-3/Woche, ohne unkontrolliertes Promo-Bombing.
-- Kanal room8.club (unigoat.de haengt am netcup-Hold). CTAs -> www.room8.club (live).

create table if not exists public.engagement_emails_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedup_key text not null,
  kind text not null default 'event',
  sent_at timestamptz default now(),
  unique(user_id, dedup_key)
);
alter table public.engagement_emails_sent enable row level security;
drop policy if exists "eng_emails_admin_only" on public.engagement_emails_sent;
create policy "eng_emails_admin_only" on public.engagement_emails_sent
  for all using (exists (select 1 from public.profiles where id=auth.uid() and is_admin=true));

-- ---------- Helper: eine Mail schicken (mit Dedup + Drossel) ----------
create or replace function public.notify_user_email(
  p_user_id uuid, p_subject text, p_html text, p_dedup_key text,
  p_kind text default 'event', p_throttle_hours int default 48)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text; v_url text;
begin
  select coalesce(p.email, u.email) into v_email
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_user_id
    and coalesce(p.is_test,false)=false
    and coalesce(p.email,u.email) is not null
    and coalesce(p.email,u.email) not like '%@room8.partner';
  if v_email is null then return false; end if;
  -- schon geschickt?
  if exists (select 1 from public.engagement_emails_sent where user_id=p_user_id and dedup_key=p_dedup_key) then
    return false;
  end if;
  -- Anti-Fatigue: nur bei Event-Mails, Wochen-Floor umgeht die Drossel bewusst
  if p_kind='event' and exists (
    select 1 from public.engagement_emails_sent
    where user_id=p_user_id and kind='event' and sent_at > now() - make_interval(hours => p_throttle_hours)
  ) then
    return false;
  end if;
  v_url := coalesce(current_setting('app.supabase_url', true),'https://tvnvmogaqmduzcycmvby.supabase.co') || '/functions/v1/send-email';
  begin
    perform net.http_post(url := v_url, headers := public.app_internal_headers(),
      body := jsonb_build_object('to', v_email, 'subject', p_subject, 'html', p_html, 'userId', p_user_id));
    insert into public.engagement_emails_sent (user_id, dedup_key, kind) values (p_user_id, p_dedup_key, p_kind)
      on conflict (user_id, dedup_key) do nothing;
    return true;
  exception when others then
    raise warning 'notify_user_email fail %: %', p_user_id, sqlerrm; return false;
  end;
end; $$;

-- kleiner Button-Baustein
create or replace function public.ug_email_btn(p_label text, p_path text)
returns text language sql immutable as $$
  select '<a href="https://www.room8.club/' || p_path || '" style="display:inline-block;background:#1B9E5F;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;margin-top:8px;">' || p_label || '</a>';
$$;

-- ============================================================
-- Event-Funktionen NEU: Push (wie gehabt) + Mail
-- ============================================================

-- 2. Wettkampf endet bald (letzte 3 Tage)
create or replace function public.notify_competition_ending()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_days int; v_html text;
begin
  v_days := (date_trunc('month', now()) + interval '1 month')::date - current_date;
  if v_days > 3 or v_days < 1 then return; end if;
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) group by user_id having sum(delta)>0)
    select user_id, rank() over (order by c desc) rk from mc
  ) loop
    begin
      perform public.notify_user_push(r.user_id, 'competition',
        'Nur noch ' || v_days || ' Tag' || (case when v_days=1 then '' else 'e' end) || '! ⏳',
        'Du bist auf Platz ' || r.rk || '. Top 3 gewinnen — jetzt noch Punkte sammeln!',
        jsonb_build_object('url','/challenge.html'), 'comp_end_' || current_date::text);
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Der Wettkampf endet in ' || v_days || ' Tag' || (case when v_days=1 then '' else 'en' end) || '! ⏳</h2>'
        || '<p style="margin:0 0 16px;">Du stehst gerade auf <strong>Platz ' || r.rk || '</strong>. Die Top 3 gewinnen am Monatsende — jetzt ist die Zeit, nochmal G-Coins zu sammeln.</p>'
        || public.ug_email_btn('Zum Wettkampf', 'challenge.html');
      perform public.notify_user_email(r.user_id, 'Nur noch ' || v_days || ' Tage im UniGoat-Wettkampf ⏳', v_html, 'comp_end_' || current_date::text);
    exception when others then raise warning 'ending fail %: %', r.user_id, sqlerrm; end;
  end loop;
end; $$;

-- 3. Gewinner Vormonat
create or replace function public.notify_competition_winners()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_html text;
begin
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) - interval '1 month'
                 and created_at < date_trunc('month', now())
               group by user_id having sum(delta)>0)
    select user_id, rank() over (order by c desc) rk from mc
  ) loop
    if r.rk <= 3 then
      begin
        perform public.notify_user_push(r.user_id, 'competition', 'Du hast gewonnen! 🏆',
          'Platz ' || r.rk || ' im letzten Wettkampf — dein Preis wartet in der App.',
          jsonb_build_object('url','/challenge.html'), 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
        v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Platz ' || r.rk || ' — du hast gewonnen! 🏆</h2>'
          || '<p style="margin:0 0 16px;">Im letzten UniGoat-Wettkampf hast du es unter die <strong>Top 3</strong> geschafft. Stark! Dein Preis wartet in der App.</p>'
          || public.ug_email_btn('Preis ansehen', 'challenge.html');
        perform public.notify_user_email(r.user_id, 'Du bist unter den Top 3 — UniGoat 🏆', v_html, 'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
      exception when others then raise warning 'winner fail %: %', r.user_id, sqlerrm; end;
    end if;
  end loop;
end; $$;

-- 4. Streak-Rettung
create or replace function public.notify_streak_risk()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_html text;
begin
  for r in (
    select id, streak_days from public.profiles
    where coalesce(streak_days,0) >= 2 and last_active_date = current_date - 1
  ) loop
    begin
      perform public.notify_user_push(r.id, 'streak', 'Deine Streak reißt gleich! 🔥',
        r.streak_days || ' Tage am Stück — kurz reinschauen und dranbleiben.',
        jsonb_build_object('url','/game/'), 'streak_' || current_date::text);
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Deine ' || r.streak_days || '-Tage-Streak reißt gleich! 🔥</h2>'
        || '<p style="margin:0 0 16px;">Du warst ' || r.streak_days || ' Tage am Stück dabei. Wenn du heute nicht reinschaust, ist die Serie weg. Ein kurzes Spiel reicht.</p>'
        || public.ug_email_btn('Streak retten', 'game/');
      perform public.notify_user_email(r.id, 'Deine ' || r.streak_days || '-Tage-Streak ist in Gefahr 🔥', v_html, 'streak_' || current_date::text);
    exception when others then raise warning 'streak fail %: %', r.id, sqlerrm; end;
  end loop;
end; $$;

-- 5. Rang ueberholt
create or replace function public.notify_rank_changes()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_html text;
begin
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) group by user_id having sum(delta)>0)
    select mc.user_id, rank() over (order by mc.c desc) rk, p.last_challenge_rank lr
    from mc join public.profiles p on p.id = mc.user_id
  ) loop
    begin
      if r.lr is not null and r.rk > r.lr then
        perform public.notify_user_push(r.user_id, 'competition', 'Du wurdest überholt 🥊',
          'Jemand hat dich überholt — du bist jetzt Platz ' || r.rk || '. Hol dir den Platz zurück!',
          jsonb_build_object('url','/challenge.html'), 'rank_' || current_date::text);
        v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Du wurdest überholt 🥊</h2>'
          || '<p style="margin:0 0 16px;">Jemand hat dich im Wettkampf überholt — du bist jetzt auf <strong>Platz ' || r.rk || '</strong>. Hol dir ein paar G-Coins und schnapp dir den Platz zurück.</p>'
          || public.ug_email_btn('Platz zurückholen', 'challenge.html');
        perform public.notify_user_email(r.user_id, 'Du wurdest im UniGoat-Wettkampf überholt 🥊', v_html, 'rank_' || current_date::text);
      end if;
      update public.profiles set last_challenge_rank = r.rk where id = r.user_id;
    exception when others then raise warning 'rank fail %: %', r.user_id, sqlerrm; end;
  end loop;
end; $$;

-- 1. Neuer Monats-Wettkampf (+Mail)
create or replace function public.notify_competition_new_month()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_html text;
begin
  for r in (select id from public.profiles where coalesce(is_partner,false)=false) loop
    begin
      perform public.notify_user_push(r.id, 'competition', 'Neuer Wettkampf! 🏁',
        'Neuer Monat, alle bei 0 G-Coins. Hol dir Platz 1 und das Preisgeld!',
        jsonb_build_object('url','/challenge.html'), 'comp_new_' || to_char(now(),'YYYY-MM'));
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Neuer Wettkampf startet! 🏁</h2>'
        || '<p style="margin:0 0 16px;">Neuer Monat, alle wieder bei 0 G-Coins. Wer am meisten sammelt (Coupons einlösen, Freunde einladen, Streak, Spiel), gewinnt. <strong>Top 3 kassieren.</strong></p>'
        || public.ug_email_btn('Jetzt mitmachen', 'challenge.html');
      perform public.notify_user_email(r.id, 'Neuer UniGoat-Wettkampf — alle bei 0 🏁', v_html, 'comp_new_' || to_char(now(),'YYYY-MM'), 'event', 0);
    exception when others then raise warning 'new_month fail %: %', r.id, sqlerrm; end;
  end loop;
  update public.profiles set last_challenge_rank = null;
end; $$;

-- ============================================================
-- C) Wochen-Floor: 2 garantierte Mails/Woche an alle Studenten
-- ============================================================

-- Mittwoch: persoenlicher Wochen-Digest (Rang + Coins + Streak + Top-Coupon der Stadt)
create or replace function public.send_weekly_digest()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_cpn record; v_html text; v_key text;
begin
  v_key := 'digest_' || to_char(now(),'IYYY-IW');
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) group by user_id),
    ranked as (select user_id, c, rank() over (order by c desc) rk from mc)
    select p.id, split_part(coalesce(p.full_name,''),' ',1) fn, p.city,
           coalesce(p.streak_days,0) streak, coalesce(ranked.c,0) coins, ranked.rk
    from public.profiles p join auth.users u on u.id=p.id
    left join ranked on ranked.user_id=p.id
    where coalesce(p.is_partner,false)=false and coalesce(p.is_test,false)=false
      and coalesce(p.email,u.email) is not null
      and coalesce(p.email,u.email) not like '%@room8.partner'
    limit 1000
  ) loop
    begin
      select title, business_name into v_cpn from public.coupons
        where status='active' and (r.city is null or city is null or lower(city)=lower(r.city))
        order by created_at desc limit 1;
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Dein UniGoat-Wochenüberblick 🐐</h2>'
        || '<p style="margin:0 0 8px;">Hey' || coalesce(' ' || nullif(r.fn,''),'') || '! So stehst du gerade:</p>'
        || '<ul style="margin:0 0 16px;padding-left:18px;line-height:1.8;">'
        || '<li><strong>' || r.coins || '</strong> G-Coins diesen Monat' || coalesce(' — Platz <strong>' || r.rk || '</strong>', '') || '</li>'
        || '<li>Streak: <strong>' || r.streak || ' Tage</strong></li>'
        || case when v_cpn.title is not null then '<li>Neu für dich: <strong>' || v_cpn.title || '</strong>' || coalesce(' bei ' || v_cpn.business_name,'') || '</li>' else '' end
        || '</ul>'
        || '<p style="margin:0 0 16px;">Schnapp dir ein paar Coupons und kletter im Wettkampf nach oben.</p>'
        || public.ug_email_btn('Coupons ansehen', 'coupons.html');
      perform public.notify_user_email(r.id, 'Dein UniGoat-Wochenüberblick 🐐', v_html, v_key, 'weekly');
    exception when others then raise warning 'digest fail %: %', r.id, sqlerrm; end;
  end loop;
end; $$;

-- Sonntag: Coupon-Spotlight (neuester aktiver Coupon der Stadt / global)
create or replace function public.send_weekly_spotlight()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_cpn record; v_html text; v_key text;
begin
  v_key := 'spot_' || to_char(now(),'IYYY-IW');
  for r in (
    select p.id, p.city from public.profiles p join auth.users u on u.id=p.id
    where coalesce(p.is_partner,false)=false and coalesce(p.is_test,false)=false
      and coalesce(p.email,u.email) is not null
      and coalesce(p.email,u.email) not like '%@room8.partner'
    limit 1000
  ) loop
    begin
      select id, title, business_name into v_cpn from public.coupons
        where status='active' and (r.city is null or city is null or lower(city)=lower(r.city))
        order by created_at desc limit 1;
      if v_cpn.id is null then continue; end if;
      v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Lust auf ' || v_cpn.title || '? 😋</h2>'
        || '<p style="margin:0 0 16px;">Bei <strong>' || coalesce(v_cpn.business_name,'einem Laden in deiner Nähe') || '</strong> wartet gerade ein Rabatt auf dich. Einlösen bringt dir außerdem G-Coins für den Wettkampf.</p>'
        || public.ug_email_btn('Coupon schnappen', 'coupon-detail.html?id=' || v_cpn.id);
      perform public.notify_user_email(r.id, 'Lust auf ' || v_cpn.title || '? 😋', v_html, v_key, 'weekly');
    exception when others then raise warning 'spotlight fail %: %', r.id, sqlerrm; end;
  end loop;
end; $$;

-- Grants
grant execute on function public.notify_user_email(uuid,text,text,text,text,int) to service_role;
grant execute on function public.send_weekly_digest() to service_role;
grant execute on function public.send_weekly_spotlight() to service_role;

-- Crons: Digest Mi 07:00 UTC (09:00 CEST), Spotlight So 09:00 UTC (11:00 CEST)
do $$
begin
  perform cron.unschedule(j) from (select unnest(array['weekly-digest','weekly-spotlight']) j) x
    where exists (select 1 from cron.job where jobname = x.j);
  perform cron.schedule('weekly-digest',   '0 7 * * 3', $c$ select public.send_weekly_digest(); $c$);
  perform cron.schedule('weekly-spotlight','0 9 * * 0', $c$ select public.send_weekly_spotlight(); $c$);
exception when others then raise warning 'weekly cron schedule failed (pg_cron?): %', sqlerrm;
end $$;
