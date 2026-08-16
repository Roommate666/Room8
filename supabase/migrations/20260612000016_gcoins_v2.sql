-- G-Coins v2 (finales Modell, Yusuf 08.08.): reine VERDIEN-/Ranking-Waehrung.
--   * Coupons IMMER frei einloesbar -> GIBT G-Coins (kein Ausgeben mehr!). 1x/Coupon/Tag bleibt.
--   * Verdienen: Coupon einloesen (+20), Freund werben (+100, in reward_pending_referral), Streak,
--     Daily Challenge (+50, Hauptquelle), Spiel spielen (+5, wenig). Spiel-Top-3 Monatsbonus separat.
--   * Monats-Challenge: Sieger = meiste G-Coins IM MONAT (aus coin_transactions), Top 3 gewinnen.
--     Wertung = SUM(delta) im laufenden Monat -> automatischer Reset, kein Loeschen.
-- Ersetzt die Ausgeben-Logik aus Mig 0013.

-- ============================================================
-- 1. Streak-Felder
-- ============================================================
alter table public.profiles add column if not exists streak_days int not null default 0;
alter table public.profiles add column if not exists last_active_date date;

-- ============================================================
-- 2. self_redeem NEU: earn-only (kein Coin-Abzug mehr)
-- ============================================================
create or replace function public.self_redeem(p_coupon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
  v_user_id uuid := auth.uid();
  v_redemption_id uuid;
  v_verification_code text;
  v_count_before int;
  v_today_same int;
  v_coins int;
  c_redeem_reward int := 20;   -- G-Coins pro Einloesung
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_coupon_id::text || ':' || v_user_id::text, 0));

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND'); end if;
  if coalesce(v_coupon.status, 'active') <> 'active' or v_coupon.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'COUPON_INACTIVE'); end if;
  if v_coupon.valid_until is not null and v_coupon.valid_until < current_date then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED'); end if;
  if v_coupon.max_redemptions is not null
     and coalesce(v_coupon.current_redemptions, 0) >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MAX_REACHED'); end if;

  if v_coupon.usage_limit_per_user is not null then
    select count(*) into v_count_before from public.coupon_redemptions
      where coupon_id = p_coupon_id and user_id = v_user_id;
    if v_count_before >= v_coupon.usage_limit_per_user then
      return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED'); end if;
  end if;

  -- Anti-Missbrauch: dieser Coupon nur 1x pro Tag
  select count(*) into v_today_same from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = v_user_id and redeemed_at::date = current_date;
  if v_today_same >= 1 then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED_TODAY'); end if;

  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.coupon_redemptions (coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at)
    values (p_coupon_id, v_user_id, v_verification_code, null, now())
    returning id into v_redemption_id;
  update public.coupons set current_redemptions = coalesce(current_redemptions,0)+1, updated_at = now()
    where id = p_coupon_id;

  v_coins := public.add_coins(v_user_id, c_redeem_reward, 'redeem', v_redemption_id);

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id,
    'verification_code', v_verification_code, 'coupon_title', v_coupon.title,
    'business_name', v_coupon.business_name, 'discount_value', v_coupon.discount_value,
    'coins', v_coins, 'coins_earned', c_redeem_reward);
end;
$$;
grant execute on function public.self_redeem(uuid) to authenticated;

-- ============================================================
-- 3. Spiel-Bonus (wenig) + Daily-Challenge-Bonus (Hauptquelle)
-- ============================================================
create or replace function public.claim_daily_play_bonus()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bonus int := 5; v_already int; v_coins int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  select count(*) into v_already from public.coin_transactions
    where user_id = v_uid and reason = 'play_daily' and created_at::date = current_date;
  if v_already > 0 then
    select coins into v_coins from public.profiles where id = v_uid;
    return jsonb_build_object('ok',true,'awarded',0,'coins',coalesce(v_coins,0),'already',true);
  end if;
  v_coins := public.add_coins(v_uid, v_bonus, 'play_daily', null);
  return jsonb_build_object('ok',true,'awarded',v_bonus,'coins',v_coins,'already',false);
end; $$;
grant execute on function public.claim_daily_play_bonus() to authenticated;

create or replace function public.claim_daily_challenge()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bonus int := 50; v_already int; v_coins int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  select count(*) into v_already from public.coin_transactions
    where user_id = v_uid and reason = 'daily_challenge' and created_at::date = current_date;
  if v_already > 0 then
    select coins into v_coins from public.profiles where id = v_uid;
    return jsonb_build_object('ok',true,'awarded',0,'coins',coalesce(v_coins,0),'already',true);
  end if;
  v_coins := public.add_coins(v_uid, v_bonus, 'daily_challenge', null);
  return jsonb_build_object('ok',true,'awarded',v_bonus,'coins',v_coins,'already',false);
end; $$;
grant execute on function public.claim_daily_challenge() to authenticated;

-- ============================================================
-- 4. Streak (App-Oeffnen ruft touch_streak; Meilenstein-Boni)
-- ============================================================
create or replace function public.touch_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_last date; v_streak int; v_today date := current_date; v_award int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  select last_active_date, coalesce(streak_days,0) into v_last, v_streak from public.profiles where id = v_uid;
  if v_last = v_today then
    return jsonb_build_object('ok',true,'streak',v_streak,'already',true,'awarded',0);
  end if;
  if v_last = v_today - 1 then v_streak := v_streak + 1; else v_streak := 1; end if;
  update public.profiles set streak_days = v_streak, last_active_date = v_today where id = v_uid;
  if v_streak = 7 then v_award := 25; perform public.add_coins(v_uid, 25, 'streak_7', null);
  elsif v_streak = 30 then v_award := 150; perform public.add_coins(v_uid, 150, 'streak_30', null);
  elsif v_streak > 0 and v_streak % 30 = 0 then v_award := 150; perform public.add_coins(v_uid, 150, 'streak_30plus', null);
  end if;
  return jsonb_build_object('ok',true,'streak',v_streak,'already',false,'awarded',v_award);
end; $$;
grant execute on function public.touch_streak() to authenticated;

-- ============================================================
-- 5. Monats-Challenge-Rangliste (nach G-Coins im laufenden Monat)
-- ============================================================
create or replace function public.get_challenge_leaderboard(p_limit int default 50)
returns table(user_id uuid, username text, university text, avatar_config jsonb, coins_month bigint, rank bigint)
language sql security definer set search_path = public as $$
  select ct.user_id, pp.username, pp.university, pp.avatar_config,
         sum(ct.delta)::bigint as coins_month,
         rank() over (order by sum(ct.delta) desc) as rank
  from public.coin_transactions ct
  join public.public_profiles pp on pp.id = ct.user_id
  where ct.created_at >= date_trunc('month', now())
  group by ct.user_id, pp.username, pp.university, pp.avatar_config
  having sum(ct.delta) > 0
  order by coins_month desc
  limit greatest(1, least(coalesce(p_limit,50), 200));
$$;
grant execute on function public.get_challenge_leaderboard(int) to anon, authenticated;

-- Eigener Monats-Rang (fuer "Dein Platz")
create or replace function public.get_my_challenge_rank()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row record;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  select * into v_row from public.get_challenge_leaderboard(1000) where user_id = v_uid;
  if not found then return jsonb_build_object('ok',true,'rank',null,'coins_month',0); end if;
  return jsonb_build_object('ok',true,'rank',v_row.rank,'coins_month',v_row.coins_month);
end; $$;
grant execute on function public.get_my_challenge_rank() to authenticated;
