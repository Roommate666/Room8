-- Goat-Coins Oekonomie (Fundament): verdienen durch Spielen, ausgeben/limitiert beim Einloesen.
--
-- Modell (Yusuf 08.08., KEINE Premium-Stufen -> alle Coupons gleich):
--   * 1. Coupon-Einloesung pro Tag = GRATIS (Basis-Value bleibt offen)
--   * jede WEITERE Einloesung am selben Tag kostet EXTRA_REDEEM_COST Coins
--   * jeder Coupon max 1x pro Tag pro User (harter Anti-Missbrauch bei Tages-%-Coupons)
--   * kleiner Feel-Good-Bonus je Einloesung
--   * Coins verdienen: taeglicher Spiel-Bonus (mehr Faucet via Referral folgt separat)
-- Konstanten stehen als lokale Variablen in den Funktionen -> leicht anpassbar.

-- ============================================================
-- 1. Schema: coins am Profil + Transaktions-Audit
-- ============================================================
alter table public.profiles add column if not exists coins int not null default 0;

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null,
  reason text not null,               -- 'redeem_bonus' | 'redeem_cost' | 'play_daily' | 'referral' ...
  ref_id uuid,                        -- z.B. coupon_id / redemption_id
  created_at timestamptz not null default now()
);
create index if not exists idx_coin_tx_user on public.coin_transactions (user_id, created_at desc);

alter table public.coin_transactions enable row level security;
drop policy if exists "coin_tx_select_own" on public.coin_transactions;
create policy "coin_tx_select_own" on public.coin_transactions
  for select to authenticated using (user_id = auth.uid());
-- INSERT nur via security-definer-Funktionen (keine direkte Policy).

-- ============================================================
-- 2. Interner Helper: Coins gutschreiben/abziehen + Audit
-- ============================================================
create or replace function public.add_coins(p_user uuid, p_delta int, p_reason text, p_ref uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_new int;
begin
  update public.profiles set coins = greatest(0, coins + p_delta) where id = p_user
    returning coins into v_new;
  insert into public.coin_transactions (user_id, delta, reason, ref_id)
    values (p_user, p_delta, p_reason, p_ref);
  return v_new;
end;
$$;
revoke all on function public.add_coins(uuid,int,text,uuid) from public, authenticated;

-- ============================================================
-- 3. Taeglicher Spiel-Bonus (Game ruft das 1x/Tag auf)
-- ============================================================
create or replace function public.claim_daily_play_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bonus int := 10;          -- Coins pro Tag fuers Spielen
  v_already int;
  v_coins int;
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
end;
$$;
grant execute on function public.claim_daily_play_bonus() to authenticated;

-- ============================================================
-- 4. self_redeem NEU: Tageslimit pro Coupon + Coin-Oekonomie
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
  v_today_same int;         -- heutige Einloesungen DIESES Coupons durch den User
  v_today_total int;        -- heutige Einloesungen ALLER Coupons durch den User
  v_coins int;
  -- Konstanten
  c_free_per_day int := 1;      -- so viele Einloesungen/Tag gratis
  c_extra_cost int := 50;       -- Kosten je weiterer Einloesung am selben Tag
  c_bonus int := 5;             -- Feel-Good-Bonus je Einloesung
  v_spent int := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_coupon_id::text || ':' || v_user_id::text, 0));

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'COUPON_NOT_FOUND'); end if;
  if coalesce(v_coupon.status, 'active') <> 'active' or v_coupon.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'COUPON_INACTIVE');
  end if;
  if v_coupon.valid_until is not null and v_coupon.valid_until < current_date then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED');
  end if;
  if v_coupon.max_redemptions is not null
     and coalesce(v_coupon.current_redemptions, 0) >= v_coupon.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MAX_REACHED');
  end if;

  -- Gesamt-Limit pro User (falls gesetzt)
  if v_coupon.usage_limit_per_user is not null then
    select count(*) into v_count_before from public.coupon_redemptions
      where coupon_id = p_coupon_id and user_id = v_user_id;
    if v_count_before >= v_coupon.usage_limit_per_user then
      return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED');
    end if;
  end if;

  -- Harter Anti-Missbrauch: DIESEN Coupon nur 1x pro Tag
  select count(*) into v_today_same from public.coupon_redemptions
    where coupon_id = p_coupon_id and user_id = v_user_id and redeemed_at::date = current_date;
  if v_today_same >= 1 then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED_TODAY');
  end if;

  -- Coin-Gate: erste c_free_per_day Einloesungen/Tag gratis, danach kosten sie Coins
  select count(*) into v_today_total from public.coupon_redemptions
    where user_id = v_user_id and redeemed_at::date = current_date;
  if v_today_total >= c_free_per_day then
    select coins into v_coins from public.profiles where id = v_user_id;
    if coalesce(v_coins,0) < c_extra_cost then
      return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_COINS',
        'needed', c_extra_cost, 'coins', coalesce(v_coins,0));
    end if;
    perform public.add_coins(v_user_id, -c_extra_cost, 'redeem_cost', p_coupon_id);
    v_spent := c_extra_cost;
  end if;

  v_verification_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.coupon_redemptions (coupon_id, user_id, verification_code, redeemed_by_partner_id, redeemed_at)
    values (p_coupon_id, v_user_id, v_verification_code, null, now())
    returning id into v_redemption_id;
  update public.coupons set current_redemptions = coalesce(current_redemptions,0)+1, updated_at = now()
    where id = p_coupon_id;

  -- Feel-Good-Bonus
  v_coins := public.add_coins(v_user_id, c_bonus, 'redeem_bonus', v_redemption_id);

  return jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'verification_code', v_verification_code,
    'coupon_title', v_coupon.title,
    'business_name', v_coupon.business_name,
    'discount_value', v_coupon.discount_value,
    'coins', v_coins,
    'coins_spent', v_spent,
    'coins_earned', c_bonus
  );
end;
$$;

grant execute on function public.self_redeem(uuid) to authenticated;
