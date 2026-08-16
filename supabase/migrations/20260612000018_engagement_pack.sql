-- UniGoat Engagement-Pack: Wettkampf-Lifecycle + Streak + Rang + Coupon-Nudges.
-- Alle nutzen notify_user_push(user_id, channel, title, body, data, dedup_ref)
-- -> Push + In-App-Notification + Safeguards (Quiet-Hours/Rate-Limit/Dedup).
-- Monats-Wertung = SUM(coin_transactions.delta) im jeweiligen Monat (auto-Reset).

alter table public.profiles add column if not exists last_challenge_rank int;

-- ============================================================
-- 1. Neuer Monats-Wettkampf (Cron: 1. des Monats 09:00 UTC)
-- ============================================================
create or replace function public.notify_competition_new_month()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in (select id from public.profiles where coalesce(is_partner,false)=false) loop
    begin
      perform public.notify_user_push(r.id, 'competition',
        'Neuer Wettkampf! 🏁',
        'Neuer Monat, alle bei 0 G-Coins. Hol dir Platz 1 und das Preisgeld!',
        jsonb_build_object('url','/challenge.html'),
        'comp_new_' || to_char(now(),'YYYY-MM'));
    exception when others then raise warning 'new_month fail %: %', r.id, sqlerrm; end;
  end loop;
  -- Rang-Baseline fuer den neuen Monat zuruecksetzen
  update public.profiles set last_challenge_rank = null;
end; $$;

-- ============================================================
-- 2. Wettkampf endet bald (Cron taeglich 16:00; wirkt nur letzte 3 Tage)
-- ============================================================
create or replace function public.notify_competition_ending()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_days int;
begin
  v_days := (date_trunc('month', now()) + interval '1 month')::date - current_date; -- Tage bis Monatsende
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
        jsonb_build_object('url','/challenge.html'),
        'comp_end_' || current_date::text);
    exception when others then raise warning 'ending fail %: %', r.user_id, sqlerrm; end;
  end loop;
end; $$;

-- ============================================================
-- 3. Gewinner des Vormonats (Cron: 1. des Monats 00:30 UTC)
-- ============================================================
create or replace function public.notify_competition_winners()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
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
        perform public.notify_user_push(r.user_id, 'competition',
          'Du hast gewonnen! 🏆',
          'Platz ' || r.rk || ' im letzten Wettkampf — dein Preis wartet in der App.',
          jsonb_build_object('url','/challenge.html'),
          'comp_win_' || to_char(now()-interval '1 day','YYYY-MM'));
      exception when others then raise warning 'winner fail %: %', r.user_id, sqlerrm; end;
    end if;
  end loop;
end; $$;

-- ============================================================
-- 4. Streak-Rettung (Cron taeglich 18:00): gestern aktiv, heute noch nicht
-- ============================================================
create or replace function public.notify_streak_risk()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in (
    select id, streak_days from public.profiles
    where coalesce(streak_days,0) >= 2 and last_active_date = current_date - 1
  ) loop
    begin
      perform public.notify_user_push(r.id, 'streak',
        'Deine Streak reißt gleich! 🔥',
        r.streak_days || ' Tage am Stück — kurz reinschauen und dranbleiben.',
        jsonb_build_object('url','/game/'),
        'streak_' || current_date::text);
    exception when others then raise warning 'streak fail %: %', r.id, sqlerrm; end;
  end loop;
end; $$;

-- ============================================================
-- 5. Rang überholt (Cron taeglich 12:00): Rang schlechter als beim letzten Check
-- ============================================================
create or replace function public.notify_rank_changes()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in (
    with mc as (select user_id, sum(delta) c from public.coin_transactions
               where created_at >= date_trunc('month', now()) group by user_id having sum(delta)>0)
    select mc.user_id, rank() over (order by mc.c desc) rk, p.last_challenge_rank lr
    from mc join public.profiles p on p.id = mc.user_id
  ) loop
    begin
      if r.lr is not null and r.rk > r.lr then
        perform public.notify_user_push(r.user_id, 'competition',
          'Du wurdest überholt 🥊',
          'Jemand hat dich überholt — du bist jetzt Platz ' || r.rk || '. Hol dir den Platz zurück!',
          jsonb_build_object('url','/challenge.html'),
          'rank_' || current_date::text);
      end if;
      update public.profiles set last_challenge_rank = r.rk where id = r.user_id;
    exception when others then raise warning 'rank fail %: %', r.user_id, sqlerrm; end;
  end loop;
end; $$;

-- ============================================================
-- 6. Coupon-Spotlight (Admin/Cron): "Lust auf X bei Y? Schnapp dir den Rabatt"
--    Zielgruppe: Nutzer in der Stadt des Coupons (Fallback: alle Studenten).
-- ============================================================
create or replace function public.notify_coupon_spotlight(p_coupon_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.coupons%rowtype; r record; v_uid uuid := auth.uid(); v_n int := 0;
begin
  -- nur Admin (bei authentifiziertem Aufruf) oder Service-Role (auth.uid null)
  if v_uid is not null and not exists (select 1 from public.profiles where id=v_uid and is_admin) then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;
  select * into c from public.coupons where id = p_coupon_id;
  if not found then return jsonb_build_object('ok',false,'error','COUPON_NOT_FOUND'); end if;
  for r in (
    select id from public.profiles
    where coalesce(is_partner,false)=false
      and (c.city is null or city is null or lower(city)=lower(c.city))
  ) loop
    begin
      perform public.notify_user_push(r.id, 'coupon_spotlight',
        'Lust auf ' || coalesce(c.title, c.business_name) || '? 😋',
        'Bei ' || coalesce(c.business_name,'deinem Lieblingsladen') || ': schnapp dir jetzt den Rabatt-Coupon!',
        jsonb_build_object('url','/coupon-detail.html?id=' || c.id),
        'spotlight_' || c.id::text || '_' || current_date::text);
      v_n := v_n + 1;
    exception when others then raise warning 'spotlight fail %: %', r.id, sqlerrm; end;
  end loop;
  return jsonb_build_object('ok',true,'sent',v_n);
end; $$;

-- Grants
revoke all on function public.notify_competition_new_month() from public;
revoke all on function public.notify_competition_ending() from public;
revoke all on function public.notify_competition_winners() from public;
revoke all on function public.notify_streak_risk() from public;
revoke all on function public.notify_rank_changes() from public;
grant execute on function public.notify_competition_new_month() to service_role;
grant execute on function public.notify_competition_ending() to service_role;
grant execute on function public.notify_competition_winners() to service_role;
grant execute on function public.notify_streak_risk() to service_role;
grant execute on function public.notify_rank_changes() to service_role;
grant execute on function public.notify_coupon_spotlight(uuid) to service_role, authenticated;

-- ============================================================
-- Cron-Jobs
-- ============================================================
do $$
begin
  perform cron.unschedule(j) from (select unnest(array['comp-new-month','comp-ending','comp-winners','streak-risk','rank-changes']) j) x
    where exists (select 1 from cron.job where jobname = x.j);
  perform cron.schedule('comp-winners',  '30 0 1 * *', $c$ select public.notify_competition_winners(); $c$);
  perform cron.schedule('comp-new-month','0 9 1 * *',  $c$ select public.notify_competition_new_month(); $c$);
  perform cron.schedule('comp-ending',   '0 16 * * *', $c$ select public.notify_competition_ending(); $c$);
  perform cron.schedule('streak-risk',   '0 18 * * *', $c$ select public.notify_streak_risk(); $c$);
  perform cron.schedule('rank-changes',  '0 12 * * *', $c$ select public.notify_rank_changes(); $c$);
exception when others then raise warning 'engagement cron schedule failed (pg_cron?): %', sqlerrm;
end $$;
